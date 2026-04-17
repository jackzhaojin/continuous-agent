/**
 * Adhoc tests for v2.3 Phase 1: build-target-resolver.
 *
 * Covers the deterministic decision logic + the I/O paths for `existing` and
 * the worktree fallback. Worktree happy-path (`git worktree add`) is exercised
 * by setting AI_SANDBOX_V2_PATH to a freshly-init'd temp git repo.
 *
 * Run: `npx tsx tests/adhoc/2026-04-17-build-target-v2.3/build-target-resolver.adhoc.ts`
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  coerceBuildTarget,
  decideBuildTarget,
  resolveBuildTarget,
  getDefaultBuildTarget,
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
  process.stdout.write('build-target-resolver adhoc tests\n');

  // ─── coerceBuildTarget ───────────────────────────────
  await test('coerceBuildTarget accepts valid values', () => {
    assert.equal(coerceBuildTarget('worktree'), 'worktree');
    assert.equal(coerceBuildTarget('existing'), 'existing');
    assert.equal(coerceBuildTarget('monorepo'), 'monorepo');
    assert.equal(coerceBuildTarget('WORKTREE'), 'worktree');
    assert.equal(coerceBuildTarget('  Existing '), 'existing');
  });

  await test('coerceBuildTarget rejects invalid values', () => {
    assert.equal(coerceBuildTarget('invalid'), undefined);
    assert.equal(coerceBuildTarget(undefined), undefined);
    assert.equal(coerceBuildTarget(null), undefined);
    assert.equal(coerceBuildTarget(42), undefined);
  });

  // ─── decideBuildTarget (PRD Decision Framework) ──────
  await test('explicit build_target wins over target_dir', () => {
    assert.equal(
      decideBuildTarget({ build_target: 'monorepo', target_dir: '/some/path' }),
      'monorepo',
    );
    assert.equal(
      decideBuildTarget({ build_target: 'worktree', target_dir: '/some/path' }),
      'worktree',
    );
  });

  await test('target_dir without build_target → existing', () => {
    assert.equal(
      decideBuildTarget({ target_dir: '/some/path' }),
      'existing',
    );
  });

  await test('no build_target and no target_dir → default', () => {
    assert.equal(decideBuildTarget({}), getDefaultBuildTarget());
  });

  await test('BUILD_TARGET_DEFAULT env override flips default', () => {
    const prev = process.env.BUILD_TARGET_DEFAULT;
    process.env.BUILD_TARGET_DEFAULT = 'worktree';
    try {
      assert.equal(getDefaultBuildTarget(), 'worktree');
      assert.equal(decideBuildTarget({}), 'worktree');
    } finally {
      if (prev === undefined) delete process.env.BUILD_TARGET_DEFAULT;
      else process.env.BUILD_TARGET_DEFAULT = prev;
    }
  });

  // ─── resolveBuildTarget — existing mode ─────────────
  await test('existing: throws when target_dir missing', () => {
    assert.throws(
      () =>
        resolveBuildTarget({
          slug: 'foo',
          build_target: 'existing',
          resolveMonorepoPath: () => '/unused',
        }),
      /requires 'target_dir'/,
    );
  });

  await test('existing: throws when target_dir does not exist', () => {
    assert.throws(
      () =>
        resolveBuildTarget({
          slug: 'foo',
          build_target: 'existing',
          target_dir: '/this/path/definitely/does/not/exist',
          resolveMonorepoPath: () => '/unused',
        }),
      /does not exist/,
    );
  });

  await test('existing: resolves to absolute path of an existing dir', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'btr-existing-'));
    try {
      const r = resolveBuildTarget({
        slug: 'foo',
        build_target: 'existing',
        target_dir: tmp,
        target_branch: 'feature/x',
        resolveMonorepoPath: () => '/unused',
      });
      assert.equal(r.build_target, 'existing');
      assert.equal(r.outputPath, tmp);
      assert.equal(r.branch, 'feature/x');
      assert.equal(r.created, false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  // ─── resolveBuildTarget — monorepo fallback ─────────
  await test('monorepo: defers path to caller factory', () => {
    const r = resolveBuildTarget({
      slug: 'foo',
      build_target: 'monorepo',
      resolveMonorepoPath: () => '/legacy/sandbox/projects/misc/foo',
    });
    assert.equal(r.build_target, 'monorepo');
    assert.equal(r.outputPath, '/legacy/sandbox/projects/misc/foo');
    assert.equal(r.created, false);
  });

  await test('monorepo: passes through target_branch', () => {
    const r = resolveBuildTarget({
      slug: 'foo',
      build_target: 'monorepo',
      target_branch: 'feat/x',
      resolveMonorepoPath: () => '/legacy/sandbox/x',
    });
    assert.equal(r.branch, 'feat/x');
  });

  // ─── resolveBuildTarget — retry/resume short-circuit ─
  await test('existingOutputPath short-circuits to that path', () => {
    const r = resolveBuildTarget({
      slug: 'foo',
      build_target: 'worktree',
      existingOutputPath: '/already/resolved/path',
      resolveMonorepoPath: () => '/unused',
    });
    assert.equal(r.outputPath, '/already/resolved/path');
    assert.equal(r.created, false);
  });

  // ─── worktree mode: fallback when ai-sandbox-v2 missing ─
  await test('worktree: missing ai-sandbox-v2 falls back to monorepo with warning', () => {
    const prevSandbox = process.env.AI_SANDBOX_V2_PATH;
    process.env.AI_SANDBOX_V2_PATH = '/nonexistent/ai-sandbox-v2-for-testing';
    try {
      const r = resolveBuildTarget({
        slug: 'foo',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/legacy/fallback/foo',
      });
      assert.equal(r.build_target, 'monorepo');
      assert.equal(r.outputPath, '/legacy/fallback/foo');
      assert.ok(r.warnings.length >= 1, 'expected at least one warning');
      assert.match(r.warnings[0]!, /ai-sandbox-v2 not found/);
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_SANDBOX_V2_PATH;
      else process.env.AI_SANDBOX_V2_PATH = prevSandbox;
    }
  });

  // ─── worktree mode: happy path against a temp git repo ─
  await test('worktree: creates worktree off temp ai-sandbox-v2 repo', async () => {
    const prevSandbox = process.env.AI_SANDBOX_V2_PATH;
    const prevWorktrees = process.env.AI_SANDBOX_V2_WORKTREES_PATH;
    const prevAgent = process.env.AGENT_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-wt-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-sandbox-v2');
    const worktreesParent = path.join(tmpRoot, 'ai-sandbox-v2-worktrees');
    const fakeAgent = path.join(tmpRoot, 'continuous-agent');

    try {
      // Init the fake ai-sandbox-v2 repo with a single commit.
      await mkdir(sandboxRepo);
      execSync('git init -q', { cwd: sandboxRepo });
      execSync('git config user.email test@example.com', { cwd: sandboxRepo });
      execSync('git config user.name Test', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      execSync('git config tag.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'README.md'), '# ai-sandbox-v2\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });

      // Drop a fake gitignore-template into the agent's workspace-instructions/.
      await mkdir(path.join(fakeAgent, 'workspace-instructions'), { recursive: true });
      await writeFile(
        path.join(fakeAgent, 'workspace-instructions', 'gitignore-template'),
        '# from-template\nnode_modules/\n',
      );

      process.env.AI_SANDBOX_V2_PATH = sandboxRepo;
      process.env.AI_SANDBOX_V2_WORKTREES_PATH = worktreesParent;
      process.env.AGENT_PATH = fakeAgent;

      const r = resolveBuildTarget({
        slug: 'demo-project',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/should-not-be-used',
      });

      assert.equal(r.build_target, 'worktree');
      assert.equal(r.outputPath, path.join(worktreesParent, 'demo-project'));
      assert.equal(r.branch, 'proj/demo-project');
      assert.equal(r.created, true);
      assert.ok(existsSync(r.outputPath), 'worktree dir should exist');

      // .gitignore template should have been copied in.
      const gi = path.join(r.outputPath, '.gitignore');
      assert.ok(existsSync(gi), '.gitignore should exist in worktree');
      assert.match(readFileSync(gi, 'utf-8'), /from-template/);

      // Idempotent re-resolve should no-op (created=false).
      const r2 = resolveBuildTarget({
        slug: 'demo-project',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/should-not-be-used',
      });
      assert.equal(r2.outputPath, r.outputPath);
      assert.equal(r2.created, false);
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_SANDBOX_V2_PATH;
      else process.env.AI_SANDBOX_V2_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_SANDBOX_V2_WORKTREES_PATH;
      else process.env.AI_SANDBOX_V2_WORKTREES_PATH = prevWorktrees;
      if (prevAgent === undefined) delete process.env.AGENT_PATH;
      else process.env.AGENT_PATH = prevAgent;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── slug sanitization ───────────────────────────────
  await test('worktree: sanitizes slug for branch and path', async () => {
    const prevSandbox = process.env.AI_SANDBOX_V2_PATH;
    const prevWorktrees = process.env.AI_SANDBOX_V2_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-slug-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-sandbox-v2');
    const worktreesParent = path.join(tmpRoot, 'wt');

    try {
      await mkdir(sandboxRepo);
      execSync('git init -q', { cwd: sandboxRepo });
      execSync('git config user.email t@e.com', { cwd: sandboxRepo });
      execSync('git config user.name t', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      execSync('git config tag.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'r.md'), 'x');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });

      process.env.AI_SANDBOX_V2_PATH = sandboxRepo;
      process.env.AI_SANDBOX_V2_WORKTREES_PATH = worktreesParent;

      const r = resolveBuildTarget({
        slug: 'weird/slug with spaces & symbols!',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/x',
      });
      assert.equal(r.build_target, 'worktree');
      // Sanitized: only [a-zA-Z0-9._-] allowed, others replaced with -.
      // The slug appears as the LAST path segment under worktreesParent — that
      // segment must be free of unsafe characters even if the parent path has /.
      const segment = path.basename(r.outputPath);
      assert.ok(!segment.includes(' '), 'no spaces in slug segment');
      assert.ok(!segment.includes('/'), 'no embedded / in slug segment');
      assert.match(segment, /^[a-zA-Z0-9._-]+$/);
      assert.match(r.branch ?? '', /^proj\/[a-zA-Z0-9._-]+$/);
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_SANDBOX_V2_PATH;
      else process.env.AI_SANDBOX_V2_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_SANDBOX_V2_WORKTREES_PATH;
      else process.env.AI_SANDBOX_V2_WORKTREES_PATH = prevWorktrees;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`);
  process.exit(1);
});
