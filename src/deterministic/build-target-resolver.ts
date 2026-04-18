/**
 * Build Target Resolver - DETERMINISTIC
 *
 * Unified resolution for where worker/harness output lands. Implements Phase 1
 * of the v2.3 PRD (`ai-docs/v2/xxxx-xx-xx-v2.3/harness-build-target-prd.md`).
 *
 * Three modes:
 *   - worktree: git worktree off `ai-sandbox` `base` branch; default branch
 *     name `proj/<slug>`. Worktree path mirrors the branch namespace
 *     (`<namespace>/<slug>` → `~/dev/ai-sandbox-worktrees/<namespace>/<slug>/`).
 *   - existing: validate `target_dir`, no scaffold
 *   - monorepo: anchor at the `monorepo/legacy-v2.2` worktree (the
 *     pre-rebaseline flat layout). Caller's `resolveMonorepoPath` factory
 *     decides the project sub-path under that anchor.
 *
 * Selection rules (matches PRD "Decision Framework"):
 *   1. If `build_target` is set on the input → use it
 *   2. Else if `target_dir` is set → existing
 *   3. Else → DEFAULT_BUILD_TARGET (worktree, per PRD P1-8 flip on 2026-04-17)
 *
 * The caller passes a `monorepoPath` factory so this module stays free of
 * worker-spawner / harness-executor concerns.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';

import type { BuildTarget } from '../core/types.js';

/**
 * Run a git subcommand with an argv array (no shell). Prevents shell
 * interpretation of user-controlled values like `target_branch` from
 * PROMPT.md frontmatter. Returns the combined stdout/stderr string or
 * throws if git exits non-zero.
 */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });
}

/**
 * Boolean variant: returns true if git exits 0, false otherwise. Swallows
 * errors — use only for probes like `rev-parse --verify`.
 */
function gitOk(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Default build target.
 *
 * Per PRD P1-8: flipped from 'monorepo' to 'worktree' on 2026-04-17 once the
 * in-place rebaseline of `ai-sandbox` was validated. The fallback at the end
 * of the function is the source of truth for the system default.
 *
 * Set via env var `BUILD_TARGET_DEFAULT` for staged overrides. Read lazily on
 * each call so tests/runtime overrides take effect without module reload.
 */
export function getDefaultBuildTarget(): BuildTarget {
  const fromEnv = (process.env.BUILD_TARGET_DEFAULT || '').toLowerCase();
  if (fromEnv === 'worktree' || fromEnv === 'existing' || fromEnv === 'monorepo') {
    return fromEnv;
  }
  return 'worktree';
}

/**
 * Path to the `ai-sandbox` repo (the worktree source).
 *
 * The repo was rebaselined in place on 2026-04-17: `base` branch holds the
 * clean init commit (Apache 2.0 + `.gitignore`), `main` is the empty
 * showcase, and `monorepo/legacy-v2.2` preserves the pre-rebaseline flat
 * layout. New worktrees fork from `base`.
 *
 * Override with env var `AI_SANDBOX_PATH`. Default `~/dev/ai-sandbox`.
 */
export function getAiSandboxPath(): string {
  return process.env.AI_SANDBOX_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox');
}

/**
 * Parent directory for all worktrees off `ai-sandbox`.
 * Per PRD decision 1 (Option A — dedicated parent directory) plus the
 * tiered-namespace convention: `<namespace>/<slug>` branches map to
 * `<parent>/<namespace>/<slug>/`.
 *
 * Override with env var `AI_SANDBOX_WORKTREES_PATH`. Default
 * `~/dev/ai-sandbox-worktrees`.
 */
export function getAiSandboxWorktreesPath(): string {
  return (
    process.env.AI_SANDBOX_WORKTREES_PATH ||
    path.join(os.homedir(), 'dev', 'ai-sandbox-worktrees')
  );
}

/**
 * Path to the legacy-v2.2 monorepo worktree.
 *
 * Per PRD Option 3 (Monorepo Folder, Legacy): the pre-rebaseline flat layout
 * is preserved on the `monorepo/legacy-v2.2` branch and materialized as a
 * worktree at this path. `build_target: monorepo` writes into here — callers'
 * `resolveMonorepoPath` factories should anchor sub-paths against this base.
 *
 * Override with env var `AI_SANDBOX_LEGACY_MONOREPO_PATH`.
 * Default: `<AI_SANDBOX_WORKTREES_PATH>/monorepo/legacy-v2.2/`.
 */
export function getLegacyMonorepoWorktreePath(): string {
  return (
    process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH ||
    path.join(getAiSandboxWorktreesPath(), 'monorepo', 'legacy-v2.2')
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
   * (e.g. ai-sandbox missing in worktree mode).
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
 * monorepo mode with a warning if `ai-sandbox` doesn't exist yet — that
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
      const sandboxPath = getAiSandboxPath();
      const worktreesParent = getAiSandboxWorktreesPath();

      // Defensive fallback: ai-sandbox should always exist post-rebaseline,
      // but if a user runs in an environment without it, degrade gracefully
      // to monorepo mode rather than crashing the executive loop.
      if (!existsSync(sandboxPath)) {
        warnings.push(
          `[build-target-resolver] ai-sandbox not found at ${sandboxPath}; ` +
            `falling back to monorepo mode for slug=${slug}. ` +
            `Clone the repo or set AI_SANDBOX_PATH to enable worktree mode.`,
        );
        return resolveMonorepoFallback(input, warnings);
      }

      const branch = input.target_branch || `proj/${slug}`;
      // Tiered-namespace convention: branch `<namespace>/<slug>` maps to
      // `<worktreesParent>/<namespace>/<slug>/`. A bare branch (no slash)
      // lands directly under the parent.
      const worktreePath = path.join(worktreesParent, ...branch.split('/'));

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
        // Ensure the full chain of namespace dirs exists (e.g., for
        // `experiment/spike/foo` we need `<parent>/experiment/spike/`).
        mkdirSync(path.dirname(worktreePath), { recursive: true });

        // Auto-prune stale worktree registrations. If a prior run's worktree
        // directory was manually removed (e.g. `rm -rf`) without `git worktree
        // remove`, git still thinks the worktree exists and `git worktree add`
        // would fail with "already registered". Prune is idempotent and only
        // removes entries whose directories are gone — safe to call blindly.
        try {
          git(sandboxPath, ['worktree', 'prune']);
        } catch {
          // Non-fatal — the add below will surface any real issue.
        }

        // If the branch already exists (e.g. from a prior worktree), `-b <branch>`
        // will fail. Fall back to checking out the existing branch with no `-b`.
        const branchExists = gitOk(sandboxPath, ['rev-parse', '--verify', branch]);

        // Per PRD: new worktrees fork from the `base` branch (not HEAD/`main`).
        // Rationale: `base` is frozen at the init commit (LICENSE + .gitignore)
        // so worktrees stay clean of other projects' code. Finished projects
        // merge `proj/<slug>` → `main`, but `base` never moves.
        //
        // Fall back to HEAD if `base` doesn't exist — supports repos that
        // haven't adopted the base/main split (e.g. fresh test repos).
        const baseExists = gitOk(sandboxPath, ['rev-parse', '--verify', 'base']);
        const startPoint = baseExists ? 'base' : '';

        const addArgs = branchExists
          ? ['worktree', 'add', worktreePath, branch]
          : startPoint
            ? ['worktree', 'add', '-b', branch, worktreePath, startPoint]
            : ['worktree', 'add', '-b', branch, worktreePath];

        git(sandboxPath, addArgs);
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
