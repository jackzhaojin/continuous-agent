/**
 * Adhoc tests for the PROMPT.md → WorkItem pipeline with v2.3 build_target fields.
 *
 * Gap this closes: the resolver adhoc (`build-target-resolver.adhoc.ts`) covers
 * resolver behavior given a shape. This test covers whether the frontmatter
 * fields actually *arrive* in that shape — i.e., `parsePromptMd()` surfaces
 * `build_target`, `target_dir`, `target_branch`, and `coerceBuildTarget()`
 * filters bad values the way the goal-scanner relies on.
 *
 * Run: `npx tsx tests/adhoc/2026-04-17-build-target-v2.3/prompt-md-build-target-fields.adhoc.ts`
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parsePromptMd } from '../../../src/deterministic/prompt-md-parser.js';
import { coerceBuildTarget } from '../../../src/deterministic/build-target-resolver.js';

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

async function withTempPromptMd(
  frontmatter: string,
  body: string,
  fn: (promptFile: string) => Promise<void>,
): Promise<void> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'promptmd-v23-'));
  try {
    const promptFile = path.join(tmp, 'PROMPT.md');
    await writeFile(promptFile, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf-8');
    await fn(promptFile);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  process.stdout.write('prompt-md build-target fields adhoc\n');

  // ─── Parser surfaces all three new fields ────────────
  await test('parsePromptMd surfaces build_target + target_dir + target_branch', async () => {
    await withTempPromptMd(
      [
        'title: "Demo"',
        'slug: "demo"',
        'priority: P3',
        'status: pending',
        'build_target: worktree',
        'target_dir: /Users/jack/dev/some-project',
        'target_branch: feature/xyz',
      ].join('\n'),
      'demo body',
      async (promptFile) => {
        const parsed = await parsePromptMd(promptFile);
        assert.equal(parsed.frontmatter.build_target, 'worktree');
        assert.equal(parsed.frontmatter.target_dir, '/Users/jack/dev/some-project');
        assert.equal(parsed.frontmatter.target_branch, 'feature/xyz');
      },
    );
  });

  // ─── Parser leaves fields undefined when omitted ────
  await test('parsePromptMd leaves build_target fields undefined when omitted', async () => {
    await withTempPromptMd(
      [
        'title: "Plain"',
        'slug: "plain"',
        'priority: P3',
        'status: pending',
      ].join('\n'),
      'plain body',
      async (promptFile) => {
        const parsed = await parsePromptMd(promptFile);
        assert.equal(parsed.frontmatter.build_target, undefined,
          'build_target must not be force-derived — PRD migration step 2 requires monorepo default to come from the resolver, not the parser');
        assert.equal(parsed.frontmatter.target_dir, undefined);
        assert.equal(parsed.frontmatter.target_branch, undefined);
      },
    );
  });

  // ─── goal-scanner path: coerceBuildTarget filters bad values ─
  await test('coerceBuildTarget rejects invalid strings the scanner receives', async () => {
    await withTempPromptMd(
      [
        'title: "Bad"',
        'slug: "bad"',
        'priority: P3',
        'status: pending',
        'build_target: "something-random"',
      ].join('\n'),
      'body',
      async (promptFile) => {
        const parsed = await parsePromptMd(promptFile);
        assert.equal(parsed.frontmatter.build_target, 'something-random',
          'parser surfaces raw value');
        assert.equal(coerceBuildTarget(parsed.frontmatter.build_target), undefined,
          'scanner coerces to undefined → resolver uses its default');
      },
    );
  });

  // ─── Each valid build_target value round-trips through coerce ─
  for (const value of ['worktree', 'existing', 'monorepo'] as const) {
    await test(`coerceBuildTarget accepts '${value}' from parsed frontmatter`, async () => {
      await withTempPromptMd(
        [
          'title: "V"',
          'slug: "v"',
          'priority: P3',
          'status: pending',
          `build_target: ${value}`,
        ].join('\n'),
        'body',
        async (promptFile) => {
          const parsed = await parsePromptMd(promptFile);
          assert.equal(coerceBuildTarget(parsed.frontmatter.build_target), value);
        },
      );
    });
  }

  // ─── Real _TEMPLATE/PROMPT.md documents the new fields ─
  await test('_TEMPLATE/PROMPT.md includes the three v2.3 fields', async () => {
    const { readFile } = await import('node:fs/promises');
    const tmpl = await readFile(
      path.resolve(process.cwd(), 'workspace-instructions/_TEMPLATE/PROMPT.md'),
      'utf-8',
    );
    assert.match(tmpl, /build_target:/, 'template must mention build_target');
    assert.match(tmpl, /target_dir:/, 'template must mention target_dir');
    assert.match(tmpl, /target_branch:/, 'template must mention target_branch');
  });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`);
  process.exit(1);
});
