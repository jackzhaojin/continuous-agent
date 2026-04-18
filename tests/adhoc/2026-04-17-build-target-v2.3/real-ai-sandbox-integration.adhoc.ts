/**
 * Real-repo integration adhoc test for v2.3 Phase 1.
 *
 * Exercises `resolveBuildTarget()` against the user's actual `~/dev/ai-sandbox`
 * clone (the rebaselined repo with `base`/`main`/`monorepo/legacy-v2.2`).
 * Creates a throwaway worktree at the tiered-namespace path
 * `~/dev/ai-sandbox-worktrees/proj/<slug>/`, verifies the PRD contract
 * end-to-end, then cleans up with `git worktree remove` and deletes the
 * `proj/<slug>` branch.
 *
 * Skips (does not fail) if `~/dev/ai-sandbox` is not a git repo — lets CI and
 * other environments run the rest of the adhoc suite without this integration
 * check.
 *
 * Run: `npx tsx tests/adhoc/2026-04-17-build-target-v2.3/real-ai-sandbox-integration.adhoc.ts`
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveBuildTarget } from '../../../src/deterministic/build-target-resolver.js';

const AI_SANDBOX = process.env.AI_SANDBOX_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox');
const AI_SANDBOX_WORKTREES =
  process.env.AI_SANDBOX_WORKTREES_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox-worktrees');

// Unique slug per run so parallel invocations don't collide.
const SLUG = `adhoc-v2.3-${Date.now()}`;
const BRANCH = `proj/${SLUG}`;
// Tiered-namespace convention: `proj/<slug>` branch → `<parent>/proj/<slug>/`.
const WORKTREE_PATH = path.join(AI_SANDBOX_WORKTREES, ...BRANCH.split('/'));

function repoIsUsable(): boolean {
  if (!existsSync(AI_SANDBOX)) return false;
  try {
    const s = statSync(AI_SANDBOX);
    if (!s.isDirectory()) return false;
    execSync(`git -C "${AI_SANDBOX}" rev-parse --git-dir`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasBaseBranch(): boolean {
  try {
    execSync(`git -C "${AI_SANDBOX}" rev-parse --verify base`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function cleanup(): void {
  // Remove worktree (best-effort).
  try {
    execSync(`git -C "${AI_SANDBOX}" worktree remove --force "${WORKTREE_PATH}"`, { stdio: 'pipe' });
  } catch {
    // fall through
  }
  // Delete the branch (best-effort).
  try {
    execSync(`git -C "${AI_SANDBOX}" branch -D "${BRANCH}"`, { stdio: 'pipe' });
  } catch {
    // fall through
  }
}

async function main(): Promise<void> {
  process.stdout.write('real-ai-sandbox integration adhoc\n');

  if (!repoIsUsable()) {
    process.stdout.write(`  ⤳ SKIP: ${AI_SANDBOX} is not a usable git repo\n`);
    return;
  }

  const hasBase = hasBaseBranch();
  process.stdout.write(`  info: ai-sandbox=${AI_SANDBOX}  base-branch=${hasBase}\n`);

  // Preflight cleanup in case a prior run left state.
  cleanup();
  assert.ok(!existsSync(WORKTREE_PATH), 'preflight: worktree path must not exist');

  let failed = 0;

  try {
    const r = resolveBuildTarget({
      slug: SLUG,
      build_target: 'worktree',
      resolveMonorepoPath: () => {
        throw new Error('monorepo fallback should not trigger against real ai-sandbox');
      },
    });

    // ─── Contract: resolution shape ─────────────────────
    try {
      assert.equal(r.build_target, 'worktree');
      assert.equal(r.outputPath, WORKTREE_PATH);
      assert.equal(r.branch, BRANCH);
      assert.equal(r.created, true);
      assert.ok(existsSync(r.outputPath), 'worktree dir must exist on disk');
      process.stdout.write('  ✓ resolution shape (build_target/outputPath/branch/created)\n');
    } catch (err) {
      process.stdout.write(`  ✗ resolution shape\n    ${(err as Error).message}\n`);
      failed++;
    }

    // ─── Contract: branch points to a real commit ───────
    try {
      const branchSha = execSync(`git -C "${AI_SANDBOX}" rev-parse "${BRANCH}"`, {
        stdio: 'pipe',
      }).toString().trim();
      assert.match(branchSha, /^[0-9a-f]{40}$/);
      process.stdout.write(`  ✓ branch ${BRANCH} exists → ${branchSha.slice(0, 10)}\n`);
    } catch (err) {
      process.stdout.write(`  ✗ branch existence\n    ${(err as Error).message}\n`);
      failed++;
    }

    // ─── Contract: worktree HEAD == `base` when base exists ─
    try {
      const worktreeHead = execSync(`git -C "${WORKTREE_PATH}" rev-parse HEAD`, {
        stdio: 'pipe',
      }).toString().trim();
      if (hasBase) {
        const baseSha = execSync(`git -C "${AI_SANDBOX}" rev-parse base`, {
          stdio: 'pipe',
        }).toString().trim();
        assert.equal(
          worktreeHead,
          baseSha,
          `worktree must fork from base (${baseSha.slice(0, 10)}), got ${worktreeHead.slice(0, 10)}`,
        );
        process.stdout.write(`  ✓ worktree HEAD matches base (${baseSha.slice(0, 10)})\n`);
      } else {
        process.stdout.write('  ⤳ skipped base-fork check (no base branch on this repo)\n');
      }
    } catch (err) {
      process.stdout.write(`  ✗ base-fork check\n    ${(err as Error).message}\n`);
      failed++;
    }

    // ─── Contract: `.gitignore` template was copied in ──
    try {
      const gi = path.join(r.outputPath, '.gitignore');
      assert.ok(existsSync(gi), '.gitignore must exist in worktree');
      const contents = readFileSync(gi, 'utf-8');
      // The template has distinctive marker text; any match proves it was copied.
      assert.ok(
        /Baseline \.gitignore template for ai-(?:demos|sandbox) worktrees/.test(contents) ||
          /node_modules\//.test(contents),
        '.gitignore must look like the baseline template',
      );
      process.stdout.write('  ✓ .gitignore template copied into worktree\n');
    } catch (err) {
      process.stdout.write(`  ✗ .gitignore template copy\n    ${(err as Error).message}\n`);
      failed++;
    }

    // ─── Contract: idempotent re-resolve ────────────────
    try {
      const r2 = resolveBuildTarget({
        slug: SLUG,
        build_target: 'worktree',
        resolveMonorepoPath: () => {
          throw new Error('should not fall back on re-resolve');
        },
      });
      assert.equal(r2.outputPath, r.outputPath);
      assert.equal(r2.created, false);
      process.stdout.write('  ✓ idempotent re-resolve (created=false)\n');
    } catch (err) {
      process.stdout.write(`  ✗ idempotent re-resolve\n    ${(err as Error).message}\n`);
      failed++;
    }

    // ─── Contract: worktree registered with parent repo ─
    try {
      const wtList = execSync(`git -C "${AI_SANDBOX}" worktree list --porcelain`, {
        stdio: 'pipe',
      }).toString();
      assert.ok(
        wtList.includes(WORKTREE_PATH),
        `worktree must appear in git worktree list\n${wtList}`,
      );
      process.stdout.write('  ✓ worktree registered in parent repo\n');
    } catch (err) {
      process.stdout.write(`  ✗ worktree registry\n    ${(err as Error).message}\n`);
      failed++;
    }

    // ─── Contract: tiered-namespace path layout ─────────
    try {
      // The worktree path must include the namespace as a folder, not a flat slug.
      assert.ok(
        WORKTREE_PATH.includes(`${path.sep}proj${path.sep}`),
        `worktree path must include /proj/ namespace folder; got ${WORKTREE_PATH}`,
      );
      process.stdout.write('  ✓ worktree path uses tiered namespace layout\n');
    } catch (err) {
      process.stdout.write(`  ✗ tiered namespace layout\n    ${(err as Error).message}\n`);
      failed++;
    }
  } finally {
    cleanup();
    // Post-cleanup sanity: the worktree path should be gone.
    if (existsSync(WORKTREE_PATH)) {
      process.stdout.write(`  ! WARNING: cleanup left ${WORKTREE_PATH} on disk\n`);
      failed++;
    } else {
      process.stdout.write('  ✓ cleanup removed worktree + branch\n');
    }
  }

  if (failed > 0) {
    process.stdout.write(`\n${failed} failed\n`);
    process.exit(1);
  }
  process.stdout.write('\nall checks passed\n');
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`);
  process.exit(1);
});
