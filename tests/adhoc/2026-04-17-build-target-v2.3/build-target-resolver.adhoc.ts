/**
 * Adhoc tests for v2.3 Phase 1: build-target-resolver.
 *
 * Covers the deterministic decision logic + the I/O paths for `existing` and
 * the worktree fallback. Worktree happy-path (`git worktree add`) is exercised
 * by setting AI_DEMOS_PATH to a freshly-init'd temp git repo.
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

  await test('existing: inferred from target_dir alone (no explicit build_target)', async () => {
    // Regression guard for the harness-executor fix: the resolver MUST return
    // build_target='existing' when only target_dir is set, so harness-executor's
    // existing-mode mkdir-skip guard fires correctly via resolvedBuildTarget.
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'btr-existing-inf-'));
    try {
      const r = resolveBuildTarget({
        slug: 'foo',
        // build_target intentionally omitted
        target_dir: tmp,
        resolveMonorepoPath: () => '/unused',
      });
      assert.equal(r.build_target, 'existing',
        'target_dir without build_target must resolve to existing');
      assert.equal(r.outputPath, tmp);
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

  // ─── worktree mode: fallback when ai-demos missing ─
  await test('worktree: missing ai-demos falls back to monorepo with warning', () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    process.env.AI_DEMOS_PATH = '/nonexistent/ai-demos-for-testing';
    try {
      const r = resolveBuildTarget({
        slug: 'foo',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/legacy/fallback/foo',
      });
      assert.equal(r.build_target, 'monorepo');
      assert.equal(r.outputPath, '/legacy/fallback/foo');
      assert.ok(r.warnings.length >= 1, 'expected at least one warning');
      assert.match(r.warnings[0]!, /ai-demos not found/);
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
    }
  });

  // ─── worktree mode: happy path against a temp git repo ─
  await test('worktree: creates worktree off temp ai-demos repo', async () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;
    const prevAgent = process.env.AGENT_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-wt-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
    const worktreesParent = path.join(tmpRoot, 'ai-demos-worktrees');
    const fakeAgent = path.join(tmpRoot, 'continuous-agent');

    try {
      // Init the fake ai-demos repo with a single commit.
      await mkdir(sandboxRepo);
      execSync('git init -q', { cwd: sandboxRepo });
      execSync('git config user.email test@example.com', { cwd: sandboxRepo });
      execSync('git config user.name Test', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      execSync('git config tag.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'README.md'), '# ai-demos\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });

      // Drop a fake gitignore-template into the agent's workspace-instructions/.
      await mkdir(path.join(fakeAgent, 'workspace-instructions'), { recursive: true });
      await writeFile(
        path.join(fakeAgent, 'workspace-instructions', 'gitignore-template'),
        '# from-template\nnode_modules/\n',
      );

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;
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
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
      if (prevAgent === undefined) delete process.env.AGENT_PATH;
      else process.env.AGENT_PATH = prevAgent;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── worktree forks from `base` branch, not main/HEAD ─
  await test('worktree: forks from `base` branch when it exists (PRD decision 1)', async () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-base-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
    const worktreesParent = path.join(tmpRoot, 'wt');

    try {
      await mkdir(sandboxRepo);
      execSync('git init -q -b main', { cwd: sandboxRepo });
      execSync('git config user.email t@e.com', { cwd: sandboxRepo });
      execSync('git config user.name t', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });

      // Init commit (will be the shared ancestor).
      await writeFile(path.join(sandboxRepo, 'LICENSE'), 'Apache 2.0\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });
      const initSha = execSync('git rev-parse HEAD', { cwd: sandboxRepo }).toString().trim();

      // Fork `base` off the init commit — frozen.
      execSync('git branch base', { cwd: sandboxRepo });

      // Advance `main` with a demo-project commit that should NOT appear in new worktrees.
      await writeFile(path.join(sandboxRepo, 'finished-demo.md'), 'a previous project merged to main\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m "finished demo"', { cwd: sandboxRepo });
      const mainSha = execSync('git rev-parse main', { cwd: sandboxRepo }).toString().trim();

      assert.notEqual(initSha, mainSha, 'main must have advanced past base');

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;

      const r = resolveBuildTarget({
        slug: 'new-project',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/x',
      });

      assert.equal(r.created, true);
      const worktreeHead = execSync('git rev-parse HEAD', { cwd: r.outputPath }).toString().trim();
      assert.equal(worktreeHead, initSha, 'worktree HEAD must equal base/init commit, not main');
      // finished-demo.md from main must not be present.
      assert.ok(!existsSync(path.join(r.outputPath, 'finished-demo.md')),
        'worktree must not contain files from main');
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── explicit target_branch still forks from base ────
  await test('worktree: explicit target_branch still forks from `base`', async () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-tb-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
    const worktreesParent = path.join(tmpRoot, 'wt');

    try {
      await mkdir(sandboxRepo);
      execSync('git init -q -b main', { cwd: sandboxRepo });
      execSync('git config user.email t@e.com', { cwd: sandboxRepo });
      execSync('git config user.name t', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'LICENSE'), 'a\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });
      const initSha = execSync('git rev-parse HEAD', { cwd: sandboxRepo }).toString().trim();
      execSync('git branch base', { cwd: sandboxRepo });
      // Advance main with other work
      await writeFile(path.join(sandboxRepo, 'other.md'), 'other\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m other', { cwd: sandboxRepo });

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;

      const r = resolveBuildTarget({
        slug: 'custom-branch-project',
        build_target: 'worktree',
        target_branch: 'feat/something-custom',
        resolveMonorepoPath: () => '/x',
      });

      assert.equal(r.branch, 'feat/something-custom');
      const head = execSync(`git rev-parse HEAD`, { cwd: r.outputPath }).toString().trim();
      assert.equal(head, initSha, 'custom-named branch must still fork from base');
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── auto-prune: dir gone WITHOUT manual prune, resolver recovers ─
  await test('worktree: auto-prunes stale registration when dir was rm\'d without `worktree remove`', async () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-autoprune-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
    const worktreesParent = path.join(tmpRoot, 'wt');

    try {
      await mkdir(sandboxRepo);
      execSync('git init -q -b main', { cwd: sandboxRepo });
      execSync('git config user.email t@e.com', { cwd: sandboxRepo });
      execSync('git config user.name t', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'LICENSE'), 'a\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });
      execSync('git branch base', { cwd: sandboxRepo });

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;

      const r1 = resolveBuildTarget({
        slug: 'auto-prune',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/x',
      });
      assert.equal(r1.created, true);

      // Nuke the worktree dir WITHOUT `git worktree remove` / `prune`.
      // Leaves a dangling registration in `.git/worktrees/auto-prune/`.
      await rm(r1.outputPath, { recursive: true, force: true });

      // Resolver must auto-prune and recreate without human intervention.
      const r2 = resolveBuildTarget({
        slug: 'auto-prune',
        build_target: 'worktree',
        resolveMonorepoPath: () => {
          throw new Error('resolver should not fall back — auto-prune must save the day');
        },
      });
      assert.equal(r2.outputPath, r1.outputPath);
      assert.ok(existsSync(r2.outputPath), 'worktree dir must be recreated post-prune');
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── shell-safe branch names (hardening) ─────────────
  await test('worktree: branch name with shell-special chars does not shell-inject', async () => {
    // Hardening guard: we switched from execSync template strings to
    // execFileSync with argv arrays. A name with `"`, `;`, `$`, backticks
    // must not be interpreted by a shell. Git will reject the name itself
    // as invalid (so the resolver logs a warning and falls back to
    // monorepo) but there must be NO side effects from shell parsing.
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-shell-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
    const worktreesParent = path.join(tmpRoot, 'wt');
    // The canary file git could have been tricked into writing if shell
    // interpretation leaked through. Its existence = test fail.
    const canary = path.join(tmpRoot, 'canary-pwned.txt');

    try {
      await mkdir(sandboxRepo);
      execSync('git init -q -b main', { cwd: sandboxRepo });
      execSync('git config user.email t@e.com', { cwd: sandboxRepo });
      execSync('git config user.name t', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'L'), 'a\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });
      execSync('git branch base', { cwd: sandboxRepo });

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;

      // Classic shell-injection payload: if the branch name ever hits a
      // shell, the `touch canary-pwned.txt` would fire.
      const evilBranch = `bad"; touch ${canary} ; echo "`;

      // The resolver must not crash the process and must not execute the
      // injected command. Git will reject the branch name as invalid,
      // causing the resolver's internal catch to fall back to monorepo.
      const r = resolveBuildTarget({
        slug: 'shell-test',
        build_target: 'worktree',
        target_branch: evilBranch,
        resolveMonorepoPath: () => path.join(tmpRoot, 'mono-fallback'),
      });

      // Either the worktree was created with git's own invalid-branch
      // handling, OR the resolver fell back to monorepo. Both are
      // acceptable. What is NOT acceptable is the canary being touched.
      assert.ok(!existsSync(canary),
        `SHELL INJECTION DETECTED: ${canary} was created by a shell`);
      assert.ok(r.build_target === 'worktree' || r.build_target === 'monorepo',
        'resolver must return a valid mode, not crash');
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── dangling branch (worktree dir manually removed) ─
  await test('worktree: dangling branch (no dir) re-uses branch via `git worktree add <path> <branch>`', async () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-dangle-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
    const worktreesParent = path.join(tmpRoot, 'wt');

    try {
      await mkdir(sandboxRepo);
      execSync('git init -q -b main', { cwd: sandboxRepo });
      execSync('git config user.email t@e.com', { cwd: sandboxRepo });
      execSync('git config user.name t', { cwd: sandboxRepo });
      execSync('git config commit.gpgsign false', { cwd: sandboxRepo });
      await writeFile(path.join(sandboxRepo, 'LICENSE'), 'a\n');
      execSync('git add -A', { cwd: sandboxRepo });
      execSync('git commit -q -m init', { cwd: sandboxRepo });
      execSync('git branch base', { cwd: sandboxRepo });

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;

      // First pass creates the worktree + branch.
      const r1 = resolveBuildTarget({
        slug: 'resume-project',
        build_target: 'worktree',
        resolveMonorepoPath: () => '/x',
      });
      assert.equal(r1.created, true);
      const worktreePath = r1.outputPath;

      // Simulate a user/retry nuking the worktree dir WITHOUT `git worktree remove`.
      // This leaves a dangling registration in .git/worktrees/<name>.
      await rm(worktreePath, { recursive: true, force: true });
      // Prune the dangling registration — matches what a disciplined recovery would do.
      execSync(`git -C "${sandboxRepo}" worktree prune`, { stdio: 'pipe' });

      // Branch still exists. Re-resolve: should succeed, re-using the branch (no -b).
      const r2 = resolveBuildTarget({
        slug: 'resume-project',
        build_target: 'worktree',
        resolveMonorepoPath: () => {
          throw new Error('resolver should not fall back on dangling recovery');
        },
      });
      assert.equal(r2.build_target, 'worktree');
      assert.equal(r2.outputPath, worktreePath);
      assert.equal(r2.created, true);
      assert.ok(existsSync(r2.outputPath), 'worktree dir must be recreated');
    } finally {
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  // ─── slug sanitization ───────────────────────────────
  await test('worktree: sanitizes slug for branch and path', async () => {
    const prevSandbox = process.env.AI_DEMOS_PATH;
    const prevWorktrees = process.env.AI_DEMOS_WORKTREES_PATH;

    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'btr-slug-'));
    const sandboxRepo = path.join(tmpRoot, 'ai-demos');
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

      process.env.AI_DEMOS_PATH = sandboxRepo;
      process.env.AI_DEMOS_WORKTREES_PATH = worktreesParent;

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
      if (prevSandbox === undefined) delete process.env.AI_DEMOS_PATH;
      else process.env.AI_DEMOS_PATH = prevSandbox;
      if (prevWorktrees === undefined) delete process.env.AI_DEMOS_WORKTREES_PATH;
      else process.env.AI_DEMOS_WORKTREES_PATH = prevWorktrees;
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
