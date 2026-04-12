/**
 * Adhoc unit tests — prompt loaders, agent loader, ignore-files, model defaults.
 *
 *   npx tsx tests/adhoc/2026-04-11-harness-v22/unit-loaders-and-config.adhoc.ts
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadPrompt as loadGenericPrompt,
  loadPromptFile as loadGenericPromptFile,
} from '../../../src/harnesses/generic/prompt-loader.js';
import { loadPrompt as loadEdsPrompt } from '../../../src/harnesses/eds/prompt-loader.js';
import { loadAgent, loadSkill } from '../../../src/harnesses/study/agent-loader.js';
import { ensureIgnoreFiles } from '../../../src/harnesses/eds/ignore-files.js';
import {
  resolveAgentModel as resolveGenericModel,
  resolveMaxTurns as resolveGenericMaxTurns,
  GENERIC_AGENT_CONFIGS,
} from '../../../src/harnesses/generic/model-defaults.js';
import {
  resolveAgentModel as resolveEdsModel,
  EDS_AGENT_CONFIGS,
} from '../../../src/harnesses/eds/model-defaults.js';

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${label}`);
      console.log(`      ${(err as Error).message}`);
      failed++;
    }
  })();
}

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'harness-loaders-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log('\n=== loaders + config unit tests ===\n');

  // ── generic prompt loader ───────────────────────────────
  console.log('[generic prompt-loader]');
  await check('loadPromptFile("plan/why") returns CONSTITUTION prompt', async () => {
    const prompt = await loadGenericPromptFile('plan/why');
    assert.ok(prompt.length > 0);
    assert.ok(/CONSTITUTION/i.test(prompt));
  });
  await check('loadPrompt substitutes {{DOCS_DIR}}', async () => {
    const prompt = await loadGenericPrompt('plan/why', { DOCS_DIR: '/my/docs' });
    assert.ok(prompt.includes('/my/docs'));
    assert.ok(!prompt.includes('{{DOCS_DIR}}'));
  });
  await check('loadPrompt tolerates missing context keys', async () => {
    const prompt = await loadGenericPrompt('plan/why', {});
    assert.ok(prompt.length > 0);
  });
  await check('loadPromptFile("unknown") throws', async () => {
    await assert.rejects(() => loadGenericPromptFile('nonexistent'), /Unknown prompt/);
  });
  await check('all 7 generic prompts load', async () => {
    const names = [
      'spec',
      'plan/why',
      'plan/what',
      'plan/how',
      'plan/when',
      'research',
      'build',
      'validate',
    ];
    for (const n of names) {
      const p = await loadGenericPromptFile(n);
      assert.ok(p.length > 10, `${n} empty`);
    }
  });

  // ── eds prompt loader ───────────────────────────────────
  console.log('\n[eds prompt-loader]');
  await check('loadPrompt("plan/why") is EDS-specific', async () => {
    const prompt = await loadEdsPrompt('plan/why', {});
    assert.ok(/EDS/i.test(prompt), 'EDS prompt should mention EDS');
  });
  await check('all 7 eds prompts load', async () => {
    const names = [
      'plan/why',
      'plan/what',
      'plan/how',
      'plan/when',
      'research',
      'build',
      'validate',
    ];
    for (const n of names) {
      const p = await loadEdsPrompt(n, {});
      assert.ok(p.length > 10, `${n} empty`);
    }
  });

  // ── study agent loader ──────────────────────────────────
  console.log('\n[study agent-loader]');
  await check('loadAgent("coordinator") parses frontmatter', async () => {
    const a = await loadAgent('coordinator', {});
    assert.equal(a.name, 'coordinator');
    assert.ok(a.tools.includes('Task'));
    assert.ok(a.tools.includes('Skill'));
    assert.ok(a.prompt.length > 100);
    assert.equal(a.model, 'claude-sonnet-4-6');
  });
  await check('loadAgent substitutes variables', async () => {
    const a = await loadAgent('coordinator', {
      TARGET_DIR: '/my/study',
      MANIFEST_PATH: '/m.yaml',
    });
    assert.ok(a.prompt.includes('/my/study'));
    assert.ok(!a.prompt.includes('{{TARGET_DIR}}'));
  });
  await check('loadAgent("research") has tools list', async () => {
    const a = await loadAgent('research', {});
    assert.ok(a.tools.length > 0);
  });
  await check('loadAgent("nonexistent") throws ENOENT', async () => {
    await assert.rejects(() => loadAgent('nonexistent', {}));
  });
  await check('loadSkill("research") returns skill body', async () => {
    const s = await loadSkill('research');
    assert.ok(s !== null);
    assert.ok(s!.body.length > 10);
  });
  await check('loadSkill("nonexistent") returns null', async () => {
    const s = await loadSkill('nonexistent-skill-xyz');
    assert.equal(s, null);
  });

  // ── ensureIgnoreFiles ───────────────────────────────────
  console.log('\n[eds ignore-files]');
  await check('creates both files in empty dir', async () => {
    await withTmp(async (dir) => {
      const r = await ensureIgnoreFiles(dir);
      assert.equal(r.gitignore, true);
      assert.equal(r.hlxignore, true);
      const git = await readFile(join(dir, '.gitignore'), 'utf-8');
      assert.ok(git.includes('.playwright-mcp'));
      assert.ok(!git.includes('ai-docs')); // ai-docs stays in git
      const hlx = await readFile(join(dir, '.hlxignore'), 'utf-8');
      assert.ok(hlx.includes('ai-docs/'));
      assert.ok(hlx.includes('.playwright-mcp'));
    });
  });
  await check('no-op when both files already have patterns', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, '.gitignore'), 'node_modules\n.playwright-mcp\n');
      await writeFile(join(dir, '.hlxignore'), 'ai-docs/\n.playwright-mcp\n');
      const r = await ensureIgnoreFiles(dir);
      assert.equal(r.gitignore, false);
      assert.equal(r.hlxignore, false);
    });
  });
  await check('merges patterns into existing .gitignore', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, '.gitignore'), 'node_modules\n');
      const r = await ensureIgnoreFiles(dir);
      assert.equal(r.gitignore, true);
      const git = await readFile(join(dir, '.gitignore'), 'utf-8');
      assert.ok(git.includes('node_modules'));
      assert.ok(git.includes('.playwright-mcp'));
    });
  });

  // ── model defaults / resolver ───────────────────────────
  console.log('\n[generic model-defaults]');
  await check('agent configs have all 7 entries', () => {
    assert.equal(Object.keys(GENERIC_AGENT_CONFIGS).length, 7);
    for (const name of [
      'spec-why',
      'spec-what',
      'spec-how',
      'spec-when',
      'research',
      'build',
      'validate',
    ]) {
      const cfg = GENERIC_AGENT_CONFIGS[name as keyof typeof GENERIC_AGENT_CONFIGS];
      assert.ok(cfg.tools.length > 0, `${name} has no tools`);
      assert.ok(cfg.prompt.length > 0);
    }
  });
  await check('resolveAgentModel: explicit override wins', () => {
    delete process.env.MODEL_BUILD;
    const m = resolveGenericModel('build', { MODEL_BUILD: 'custom-model' });
    assert.equal(m, 'custom-model');
  });
  await check('resolveAgentModel: env var second', () => {
    process.env.MODEL_BUILD = 'env-model';
    const m = resolveGenericModel('build', {});
    assert.equal(m, 'env-model');
    delete process.env.MODEL_BUILD;
  });
  await check('resolveAgentModel: default fallback', () => {
    delete process.env.MODEL_BUILD;
    const m = resolveGenericModel('build', {});
    assert.equal(m, 'claude-sonnet-4-5');
  });
  await check('resolveMaxTurns: explicit > vendor default', () => {
    assert.equal(resolveGenericMaxTurns('claude', 99), 99);
    assert.equal(resolveGenericMaxTurns('claude', undefined), 50);
    assert.equal(resolveGenericMaxTurns('kimi-wire', undefined), 120);
    assert.equal(resolveGenericMaxTurns('kimi-cli', undefined), 80);
    assert.equal(resolveGenericMaxTurns('codex', undefined), 60);
  });

  console.log('\n[eds model-defaults]');
  await check('eds configs mirror generic structure', () => {
    assert.equal(Object.keys(EDS_AGENT_CONFIGS).length, 7);
    assert.deepEqual(
      EDS_AGENT_CONFIGS.build.tools,
      ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep'],
    );
  });
  await check('resolveEdsModel defaults match generic', () => {
    delete process.env.MODEL_BUILD;
    assert.equal(resolveEdsModel('build', {}), 'claude-sonnet-4-5');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
