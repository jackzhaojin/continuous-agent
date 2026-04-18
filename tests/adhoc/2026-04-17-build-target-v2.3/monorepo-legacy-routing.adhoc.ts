/**
 * Adhoc: monorepo-mode goals route inside the legacy worktree
 * (`<AI_SANDBOX_WORKTREES_PATH>/monorepo/legacy-v2.2/`), not the old flat
 * `~/dev/ai-sandbox/` layout.
 *
 * The actual `<legacy-worktree>/...` path is composed by each caller
 * (worker-spawner: `projects/<cat>/<date>/<slug>/`; harness-executor:
 * `harnesses/<name>/<slug>/`). This test pins down the helper they share.
 *
 * Run: `npx tsx tests/adhoc/2026-04-17-build-target-v2.3/monorepo-legacy-routing.adhoc.ts`
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  getLegacyMonorepoWorktreePath,
  getAiSandboxWorktreesPath,
} from '../../../src/deterministic/build-target-resolver.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        process.stdout.write(`  ✓ ${name}\n`);
        passed++;
      },
      (err) => {
        process.stdout.write(`  ✗ ${name}\n    ${(err as Error).message}\n`);
        failed++;
      },
    );
}

async function main(): Promise<void> {
  process.stdout.write('monorepo-legacy-routing adhoc\n');

  await test('legacy path defaults to <AI_SANDBOX_WORKTREES_PATH>/monorepo/legacy-v2.2', () => {
    const prevSandbox = process.env.AI_SANDBOX_WORKTREES_PATH;
    const prevLegacy = process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    process.env.AI_SANDBOX_WORKTREES_PATH = '/fake/parent';
    try {
      assert.equal(
        getLegacyMonorepoWorktreePath(),
        path.join('/fake/parent', 'monorepo', 'legacy-v2.2'),
      );
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_SANDBOX_WORKTREES_PATH;
      else process.env.AI_SANDBOX_WORKTREES_PATH = prevSandbox;
      if (prevLegacy === undefined) delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
      else process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH = prevLegacy;
    }
  });

  await test('AI_SANDBOX_LEGACY_MONOREPO_PATH overrides the default', () => {
    const prev = process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH = '/explicit/legacy/path';
    try {
      assert.equal(getLegacyMonorepoWorktreePath(), '/explicit/legacy/path');
    } finally {
      if (prev === undefined) delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
      else process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH = prev;
    }
  });

  await test('legacy path is INSIDE the worktrees parent (not ~/dev/ai-sandbox flat)', () => {
    const prevSandbox = process.env.AI_SANDBOX_WORKTREES_PATH;
    const prevLegacy = process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    const tmpRoot = path.join(os.tmpdir(), 'legacy-routing-isolation');
    delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    process.env.AI_SANDBOX_WORKTREES_PATH = tmpRoot;
    try {
      const legacy = getLegacyMonorepoWorktreePath();
      // It must be reachable through the worktrees parent (no escape).
      assert.ok(
        legacy.startsWith(getAiSandboxWorktreesPath() + path.sep),
        `legacy path must live under worktrees parent; got ${legacy}`,
      );
      // It must NOT be the legacy flat ai-sandbox/ root.
      const oldFlat = path.join(os.homedir(), 'dev', 'ai-sandbox');
      assert.notEqual(legacy, oldFlat, 'legacy must not point at the rebaselined main checkout');
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_SANDBOX_WORKTREES_PATH;
      else process.env.AI_SANDBOX_WORKTREES_PATH = prevSandbox;
      if (prevLegacy === undefined) delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
      else process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH = prevLegacy;
    }
  });

  // Smoke check: if the user has actually set up the legacy worktree, the
  // default helper points at it. Skips silently if the worktree isn't on disk.
  await test('legacy worktree is materialized at the resolved path (smoke)', async () => {
    const prevLegacy = process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
    try {
      const legacyPath = getLegacyMonorepoWorktreePath();
      const { existsSync } = await import('node:fs');
      if (!existsSync(legacyPath)) {
        process.stdout.write(`    (skipped: ${legacyPath} not on disk)\n`);
        return;
      }
      // If on disk, it should be a git worktree (has a .git file pointing back to ai-sandbox).
      const dotGit = path.join(legacyPath, '.git');
      assert.ok(existsSync(dotGit), `.git pointer must exist in legacy worktree at ${legacyPath}`);
    } finally {
      if (prevLegacy === undefined) delete process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH;
      else process.env.AI_SANDBOX_LEGACY_MONOREPO_PATH = prevLegacy;
    }
  });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

// Touch mkdtemp/rm to keep the imports useful in case future tests need them.
void mkdtemp;
void rm;

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`);
  process.exit(1);
});
