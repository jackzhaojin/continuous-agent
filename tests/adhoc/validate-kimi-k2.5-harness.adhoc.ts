/**
 * Adhoc validation test — Harness v2.2 with Kimi K2.5
 *
 *   npx tsx tests/adhoc/validate-kimi-k2.5-harness.adhoc.ts
 *
 * Validates:
 *   1. Vendor adapter correctly maps tool names for Kimi (Bash→Shell, Read→ReadFile, etc.)
 *   2. Prompt adaptation injects skill bodies and CLAUDE.md content for Kimi
 *   3. Model defaults and max-turns resolution for Kimi vendors
 *   4. Harness registry includes all three harnesses
 *   5. Kimi wire and CLI providers are properly instantiated via vendor-registry
 *
 * This test does NOT make live API calls — it validates the configuration
 * and adaptation layers are ready for Kimi K2.5 execution.
 */

import assert from 'node:assert/strict';
import {
  mapToolNames,
  adaptPromptForVendor,
  getToolMap,
  KIMI_TOOL_MAP,
} from '../../src/agentic/intelligence/vendor-adapter.js';
import { getHarness, listHarnesses } from '../../src/harnesses/core/harness-registry.js';
import {
  resolveAgentModel,
  resolveMaxTurns,
  DEFAULT_AGENT_MODELS,
} from '../../src/harnesses/generic/model-defaults.js';
import {
  getAgentWorkerProviderForVendor,
  resetProviders,
} from '../../src/core/vendor/vendor-registry.js';

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  const run = async () => {
    try {
      await fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${label}`);
      console.log(`      ${(err as Error).message}`);
      failed++;
    }
  };
  return run();
}

async function main(): Promise<void> {
  console.log('\n=== Kimi K2.5 Harness Validation Tests ===\n');

  // ── Tool Name Mappings ──────────────────────────────────
  console.log('[Kimi Tool Name Mapping]');

  await check('KIMI_TOOL_MAP has required mappings', () => {
    assert.equal(KIMI_TOOL_MAP['Bash'], 'Shell');
    assert.equal(KIMI_TOOL_MAP['Read'], 'ReadFile');
    assert.equal(KIMI_TOOL_MAP['Write'], 'WriteFile');
    assert.equal(KIMI_TOOL_MAP['Edit'], 'StrReplaceFile');
  });

  await check('mapToolNames translates for kimi vendor', () => {
    const tools = ['Read', 'Write', 'Bash', 'Edit', 'Glob', 'Grep'];
    const mapped = mapToolNames(tools, 'kimi');
    assert.deepEqual(mapped, [
      'ReadFile',
      'WriteFile',
      'Shell',
      'StrReplaceFile',
      'Glob',
      'Grep',
    ]);
  });

  await check('mapToolNames translates for kimi-cli vendor', () => {
    const mapped = mapToolNames(['Bash', 'Read'], 'kimi-cli');
    assert.deepEqual(mapped, ['Shell', 'ReadFile']);
  });

  await check('mapToolNames translates for kimi-wire vendor', () => {
    const mapped = mapToolNames(['Bash', 'Read'], 'kimi-wire');
    assert.deepEqual(mapped, ['Shell', 'ReadFile']);
  });

  // ── Prompt Adaptation ───────────────────────────────────
  console.log('\n[Kimi Prompt Adaptation]');

  await check('adaptPromptForVendor returns unchanged for Claude', () => {
    const prompt = 'Use `Bash` and `Read` tools.';
    const adapted = adaptPromptForVendor(prompt, 'claude');
    assert.equal(adapted, prompt);
  });

  await check('adaptPromptForVendor injects skill bodies for Kimi', () => {
    const prompt = 'Build a web app.';
    const skills = [
      { name: 'test-skill', body: 'This is a test skill.' },
    ];
    const adapted = adaptPromptForVendor(prompt, 'kimi', { skillBodies: skills });
    assert.ok(adapted.includes('## Worker Skill: test-skill'));
    assert.ok(adapted.includes('This is a test skill.'));
  });

  await check('adaptPromptForVendor injects CLAUDE.md content for Kimi', () => {
    const prompt = 'Build a web app.';
    const claudeMd = 'Project rules here.';
    const adapted = adaptPromptForVendor(prompt, 'kimi', { claudeMdContent: claudeMd });
    assert.ok(adapted.includes('## Project Context (from CLAUDE.md)'));
    assert.ok(adapted.includes('Project rules here.'));
  });

  await check('adaptPromptForVendor includes tool name mapping section for Kimi', () => {
    const prompt = 'Use `Bash` tool.';
    const adapted = adaptPromptForVendor(prompt, 'kimi');
    assert.ok(adapted.includes('## Tool Name Mappings'));
    assert.ok(adapted.includes('Instead of "Bash", use "Shell"'));
  });

  await check('adaptPromptForVendor rewrites backtick tool references for Kimi', () => {
    const prompt = 'Use `Bash` and `Read` to complete this task.';
    const adapted = adaptPromptForVendor(prompt, 'kimi');
    assert.ok(adapted.includes('`Shell`'));
    assert.ok(adapted.includes('`ReadFile`'));
  });

  // ── Model Resolution ────────────────────────────────────
  console.log('\n[Kimi Model Resolution]');

  await check('resolveMaxTurns returns 120 for kimi vendor', () => {
    assert.equal(resolveMaxTurns('kimi', undefined), 120);
  });

  await check('resolveMaxTurns returns 120 for kimi-wire vendor', () => {
    assert.equal(resolveMaxTurns('kimi-wire', undefined), 120);
  });

  await check('resolveMaxTurns returns 80 for kimi-cli vendor', () => {
    assert.equal(resolveMaxTurns('kimi-cli', undefined), 80);
  });

  await check('resolveMaxTurns respects explicit config override', () => {
    assert.equal(resolveMaxTurns('kimi', 200), 200);
  });

  await check('resolveAgentModel uses DEFAULT_AGENT_MODELS for spec-why', () => {
    const model = resolveAgentModel('spec-why', {});
    assert.equal(model, DEFAULT_AGENT_MODELS['spec-why']);
  });

  await check('resolveAgentModel respects MODEL_<AGENT> env pattern', () => {
    process.env.MODEL_SPEC_WHY = 'kimi-k2.5';
    const model = resolveAgentModel('spec-why', {});
    assert.equal(model, 'kimi-k2.5');
    delete process.env.MODEL_SPEC_WHY;
  });

  await check('resolveAgentModel respects modelOverrides map with env key', () => {
    const model = resolveAgentModel('spec-why', { MODEL_SPEC_WHY: 'kimi-k2.5' });
    assert.equal(model, 'kimi-k2.5');
  });

  await check('resolveAgentModel respects modelOverrides map with agent name', () => {
    const model = resolveAgentModel('spec-why', { 'spec-why': 'kimi-k2.5' });
    assert.equal(model, 'kimi-k2.5');
  });

  // ── Vendor Provider Resolution ──────────────────────────
  console.log('\n[Kimi Provider Resolution]');

  await check('getAgentWorkerProviderForVendor returns KimiWire for kimi', () => {
    resetProviders();
    process.env.KIMI_MODE = 'wire';
    const provider = getAgentWorkerProviderForVendor('kimi');
    assert.equal(provider.vendorId, 'kimi');
    assert.equal(provider.vendorName, 'Kimi Wire Protocol');
    delete process.env.KIMI_MODE;
  });

  await check('getAgentWorkerProviderForVendor returns KimiCli for kimi-cli', () => {
    resetProviders();
    const provider = getAgentWorkerProviderForVendor('kimi-cli');
    assert.equal(provider.vendorId, 'kimi');
    assert.equal(provider.vendorName, 'Kimi CLI (stream-json)');
  });

  await check('getAgentWorkerProviderForVendor returns KimiWire for kimi-wire', () => {
    resetProviders();
    const provider = getAgentWorkerProviderForVendor('kimi-wire');
    assert.equal(provider.vendorId, 'kimi');
    assert.equal(provider.vendorName, 'Kimi Wire Protocol');
  });

  await check('Kimi providers validateAuth returns valid', () => {
    resetProviders();
    const provider = getAgentWorkerProviderForVendor('kimi-wire');
    const auth = provider.validateAuth();
    assert.equal(auth.valid, true);
  });

  // ── Harness Registry ────────────────────────────────────
  console.log('\n[Harness Registry]');

  await check('listHarnesses includes generic, eds, study', () => {
    const list = listHarnesses();
    assert.ok(list.includes('generic'));
    assert.ok(list.includes('eds'));
    assert.ok(list.includes('study'));
  });

  await check('getHarness("generic") has correct phase list', () => {
    const harness = getHarness('generic');
    assert.deepEqual(harness.phaseList, ['SPEC', 'RESEARCH', 'BUILD', 'VALIDATE', 'COMPLETE']);
  });

  await check('GenericHarness implements HarnessOrchestrator interface', () => {
    const harness = getHarness('generic');
    assert.equal(typeof harness.detectMode, 'function');
    assert.equal(typeof harness.run, 'function');
    assert.equal(typeof harness.getState, 'function');
  });

  // ── Tool Map Retrieval ──────────────────────────────────
  console.log('\n[getToolMap Function]');

  await check('getToolMap returns KIMI_TOOL_MAP for kimi', () => {
    const map = getToolMap('kimi');
    assert.equal(map, KIMI_TOOL_MAP);
  });

  await check('getToolMap returns KIMI_TOOL_MAP for kimi-cli', () => {
    const map = getToolMap('kimi-cli');
    assert.equal(map, KIMI_TOOL_MAP);
  });

  await check('getToolMap returns KIMI_TOOL_MAP for kimi-wire', () => {
    const map = getToolMap('kimi-wire');
    assert.equal(map, KIMI_TOOL_MAP);
  });

  await check('getToolMap returns null for claude', () => {
    const map = getToolMap('claude');
    assert.equal(map, null);
  });

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('❌ Kimi K2.5 harness validation FAILED');
    process.exit(1);
  }

  console.log('✅ Kimi K2.5 harness validation PASSED');
  console.log('\nThe harness system is correctly configured to run on Kimi K2.5:');
  console.log('  • Tool names are properly mapped (Bash→Shell, Read→ReadFile, etc.)');
  console.log('  • Prompts are adapted for Kimi (skills + CLAUDE.md injection)');
  console.log('  • Max turns are optimized for Kimi wire (120) and CLI (80)');
  console.log('  • All three harnesses (generic, eds, study) are registered');
  console.log('  • Kimi providers (wire + CLI) are properly instantiated');
  console.log('\nTo run a harness with Kimi K2.5:');
  console.log('  npm run harness -- --name generic --prompt <path> --vendor kimi-wire');
  console.log('  npm run harness -- --name generic --prompt <path> --vendor kimi-cli');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
