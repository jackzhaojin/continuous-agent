/**
 * Build Target Resolver - DETERMINISTIC
 *
 * Unified resolution for where worker/harness output lands. Implements Phase 1
 * of the v2.3 PRD (`ai-docs/v2/xxxx-xx-xx-v2.3/harness-build-target-prd.md`).
 *
 * Three modes:
 *   - worktree: git worktree off `ai-demos`, branch `proj/<slug>`
 *   - existing: validate `target_dir`, no scaffold
 *   - monorepo: legacy `ai-sandbox/` subfolder behavior (caller computes path)
 *
 * Selection rules (matches PRD "Decision Framework"):
 *   1. If `build_target` is set on the input → use it
 *   2. Else if `target_dir` is set → existing
 *   3. Else → DEFAULT_BUILD_TARGET (currently 'monorepo' during v2.3 transition;
 *      flips to 'worktree' once worktree path is validated end-to-end — PRD P1-8)
 *
 * The caller passes a `monorepoPath` factory so this module stays free of
 * worker-spawner / harness-executor concerns.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';

import type { BuildTarget } from '../core/types.js';

/**
 * Default build target during the v2.3 transition.
 *
 * Per PRD migration plan step 2: "Add `build_target` field to
 * `prompt-md-parser.ts` (default: `monorepo` during transition)" and step 6:
 * "Flip default from `monorepo` to `worktree` once validated".
 *
 * Set via env var `BUILD_TARGET_DEFAULT` for staged rollout. Read lazily on
 * each call so tests/runtime overrides take effect without module reload.
 */
export function getDefaultBuildTarget(): BuildTarget {
  const fromEnv = (process.env.BUILD_TARGET_DEFAULT || '').toLowerCase();
  if (fromEnv === 'worktree' || fromEnv === 'existing' || fromEnv === 'monorepo') {
    return fromEnv;
  }
  return 'monorepo';
}

/**
 * Path to the ai-demos repo (the worktree source).
 *
 * Per PRD: "Jack manually creates `ai-demos` repo with Apache 2.0 license,
 * baseline `.gitignore`, README". The agent never auto-creates it.
 *
 * Override with env var `AI_DEMOS_PATH`. Default `~/dev/ai-demos`.
 */
export function getAiDemosPath(): string {
  return process.env.AI_DEMOS_PATH || path.join(os.homedir(), 'dev', 'ai-demos');
}

/**
 * Parent directory for all worktrees off ai-demos.
 * Per PRD decision 1 (Option A — dedicated parent directory).
 *
 * Override with env var `AI_DEMOS_WORKTREES_PATH`. Default
 * `~/dev/ai-demos-worktrees`.
 */
export function getAiDemosWorktreesPath(): string {
  return (
    process.env.AI_DEMOS_WORKTREES_PATH ||
    path.join(os.homedir(), 'dev', 'ai-demos-worktrees')
  );
}

/**
 * Source `.gitignore` template copied into newly-created worktrees.
 * Per PRD decision 2: "Maintain a baseline template in
 * `continuous-agent/workspace-instructions/gitignore-template`."
 */
function getWorktreeGitignoreTemplate(): string {
  const agentBase =
    process.env.AGENT_PATH || path.join(os.homedir(), 'dev', 'continuous-agent');
  return path.join(agentBase, 'workspace-instructions', 'gitignore-template');
}

/** Input for `resolveBuildTarget()`. */
export interface BuildTargetInput {
  /** Slug from PROMPT.md frontmatter. Used to derive worktree path/branch. */
  slug: string;

  /** Frontmatter `build_target` (raw — may be undefined or invalid). */
  build_target?: string | BuildTarget;

  /** Frontmatter `target_dir` (required for build_target='existing'). */
  target_dir?: string;

  /** Frontmatter `target_branch` (optional override). */
  target_branch?: string;

  /**
   * Already-resolved output path from a previous run (retry / resume).
   * When set, the resolver re-uses it as-is and skips creation. This makes
   * resolveBuildTarget() idempotent across executive-loop retries.
   */
  existingOutputPath?: string;

  /**
   * Caller-provided factory that returns the absolute path for monorepo mode.
   * Decoupled so the resolver doesn't need to know whether the caller is the
   * worker-spawner (`ai-sandbox/projects/<cat>/<date>/<slug>/`) or the
   * harness-executor (`ai-sandbox/harnesses/<name>/<slug>/`).
   */
  resolveMonorepoPath: () => string;
}

/** Output from `resolveBuildTarget()`. */
export interface BuildTargetResolution {
  /** The mode that was actually used. */
  build_target: BuildTarget;
  /** Absolute path the worker/harness should write to. */
  outputPath: string;
  /**
   * Branch name applied (or to be applied) to the output dir.
   *
   * - worktree: always set (`proj/<slug>` or `target_branch` override).
   * - existing: set only if `target_branch` was explicitly provided.
   * - monorepo: set only if `target_branch` was explicitly provided.
   */
  branch?: string;
  /** True when this resolver actually created/added the directory. */
  created: boolean;
  /**
   * Best-effort warnings from the resolution that the caller should log
   * (e.g. ai-demos missing in worktree mode).
   */
  warnings: string[];
}

/**
 * Sanitize a slug into something safe for branch names and worktree paths.
 * Allows `[a-zA-Z0-9._-]` and replaces everything else with `-`.
 */
function sanitizeSlug(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
}

/** Coerce a raw string into a BuildTarget, returning undefined if invalid. */
export function coerceBuildTarget(raw: unknown): BuildTarget | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.toLowerCase().trim();
  if (v === 'worktree' || v === 'existing' || v === 'monorepo') return v;
  return undefined;
}

/**
 * Pure decision step (no I/O). Encodes the PRD's "Decision Framework" table.
 * Exported for testing.
 */
export function decideBuildTarget(input: {
  build_target?: string | BuildTarget;
  target_dir?: string;
}): BuildTarget {
  const explicit = coerceBuildTarget(input.build_target);
  if (explicit) return explicit;
  if (input.target_dir && input.target_dir.length > 0) return 'existing';
  return getDefaultBuildTarget();
}

/**
 * Resolve the build target into a concrete output directory, creating worktrees
 * or validating existing dirs as needed. Idempotent: if a worktree already
 * exists for the slug, this just returns the existing path.
 *
 * Throws on configuration errors that the caller can't recover from
 * (e.g. existing target_dir missing). Worktree creation falls back to
 * monorepo mode with a warning if `ai-demos` doesn't exist yet — that
 * keeps the executive loop running while Jack completes P1-1.
 */
export function resolveBuildTarget(input: BuildTargetInput): BuildTargetResolution {
  const warnings: string[] = [];

  // Retry/resume short-circuit: if a previous attempt already resolved the
  // path, re-use it as-is. We don't re-derive the mode — `output_path` is
  // the source of truth across retries.
  if (input.existingOutputPath) {
    return {
      build_target: coerceBuildTarget(input.build_target) ?? getDefaultBuildTarget(),
      outputPath: input.existingOutputPath,
      branch: input.target_branch,
      created: false,
      warnings,
    };
  }

  const mode = decideBuildTarget(input);
  const slug = sanitizeSlug(input.slug);

  switch (mode) {
    case 'existing': {
      if (!input.target_dir) {
        throw new Error(
          `build_target='existing' requires 'target_dir' in PROMPT.md frontmatter`,
        );
      }
      const abs = path.isAbsolute(input.target_dir)
        ? input.target_dir
        : path.resolve(input.target_dir);
      if (!existsSync(abs)) {
        throw new Error(
          `build_target='existing': target_dir does not exist: ${abs}`,
        );
      }
      const stat = statSync(abs);
      if (!stat.isDirectory()) {
        throw new Error(
          `build_target='existing': target_dir is not a directory: ${abs}`,
        );
      }
      return {
        build_target: 'existing',
        outputPath: abs,
        branch: input.target_branch || undefined,
        created: false,
        warnings,
      };
    }

    case 'worktree': {
      const sandboxPath = getAiDemosPath();
      const worktreesParent = getAiDemosWorktreesPath();

      // Fallback when ai-demos isn't ready yet (PRD P1-1 is human work).
      if (!existsSync(sandboxPath)) {
        warnings.push(
          `[build-target-resolver] ai-demos not found at ${sandboxPath}; ` +
            `falling back to monorepo mode for slug=${slug}. ` +
            `Create the repo (PRD P1-1) to enable worktree mode.`,
        );
        return resolveMonorepoFallback(input, warnings);
      }

      const branch = input.target_branch || `proj/${slug}`;
      const worktreePath = path.join(worktreesParent, slug);

      // Idempotent worktree add. Two cases handled:
      //   (a) worktree already exists at worktreePath → re-use it
      //   (b) doesn't exist → `git worktree add -b <branch> <path> <start-point>`
      // We don't try to detect partial state; if the dir exists we trust it.
      if (existsSync(worktreePath)) {
        return {
          build_target: 'worktree',
          outputPath: worktreePath,
          branch,
          created: false,
          warnings,
        };
      }

      try {
        mkdirSync(worktreesParent, { recursive: true });
        // If the branch already exists (e.g. from a prior worktree that was removed
        // without `git worktree remove`), `-b <branch>` will fail. Fall back to
        // checking out the existing branch with no `-b` flag.
        const branchExists = (() => {
          try {
            execSync(`git -C "${sandboxPath}" rev-parse --verify "${branch}"`, {
              stdio: 'pipe',
            });
            return true;
          } catch {
            return false;
          }
        })();

        // Per PRD: new worktrees fork from the `base` branch (not HEAD/`main`).
        // Rationale: `base` is frozen at the init commit (LICENSE + .gitignore)
        // so worktrees stay clean of other projects' code. Finished projects
        // merge `proj/<slug>` → `main`, but `base` never moves.
        //
        // Fall back to HEAD if `base` doesn't exist — supports repos that
        // haven't adopted the base/main split (e.g. fresh test repos).
        const baseExists = (() => {
          try {
            execSync(`git -C "${sandboxPath}" rev-parse --verify "base"`, {
              stdio: 'pipe',
            });
            return true;
          } catch {
            return false;
          }
        })();
        const startPoint = baseExists ? 'base' : '';

        const cmd = branchExists
          ? `git -C "${sandboxPath}" worktree add "${worktreePath}" "${branch}"`
          : startPoint
            ? `git -C "${sandboxPath}" worktree add -b "${branch}" "${worktreePath}" "${startPoint}"`
            : `git -C "${sandboxPath}" worktree add -b "${branch}" "${worktreePath}"`;

        execSync(cmd, { stdio: 'pipe' });
      } catch (err) {
        warnings.push(
          `[build-target-resolver] git worktree add failed for slug=${slug}: ` +
            `${(err as Error).message}; falling back to monorepo mode`,
        );
        return resolveMonorepoFallback(input, warnings);
      }

      // Copy baseline .gitignore template if available and not already present.
      try {
        const dest = path.join(worktreePath, '.gitignore');
        const tmpl = getWorktreeGitignoreTemplate();
        if (!existsSync(dest) && existsSync(tmpl)) {
          const content = readFileSync(tmpl, 'utf-8');
          writeFileSync(dest, content, 'utf-8');
        }
      } catch (err) {
        warnings.push(
          `[build-target-resolver] failed to copy .gitignore template into ` +
            `worktree ${worktreePath}: ${(err as Error).message}`,
        );
      }

      return {
        build_target: 'worktree',
        outputPath: worktreePath,
        branch,
        created: true,
        warnings,
      };
    }

    case 'monorepo':
    default:
      return resolveMonorepoFallback(input, warnings);
  }
}

function resolveMonorepoFallback(
  input: BuildTargetInput,
  warnings: string[],
): BuildTargetResolution {
  const outputPath = input.resolveMonorepoPath();
  return {
    build_target: 'monorepo',
    outputPath,
    branch: input.target_branch || undefined,
    created: false, // caller (worker-spawner / harness-executor) handles mkdir
    warnings,
  };
}
