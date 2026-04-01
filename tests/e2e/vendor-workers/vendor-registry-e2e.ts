/**
 * E2E Test: Vendor Registry & Per-Goal Override
 *
 * Tests:
 *   1. Default vendor resolution (claude)
 *   2. Per-goal vendor override creates correct provider
 *   3. Model resolution per vendor
 *   4. Auth validation across all vendors
 *
 * This test does NOT call LLMs — it only validates the registry logic.
 *
 * Usage:
 *   npx tsx tests/e2e/vendor-workers/vendor-registry-e2e.ts
 */

import {
  getAgentWorkerProviderForVendor,
  resolveWorkerModelForVendor,
  resetProviders,
} from '../../../src/core/vendor/vendor-registry.js';

const PASS = '✓';
const FAIL = '✗';
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function main() {
  console.log('\n=== Vendor Registry E2E ===\n');

  // Clean state
  resetProviders();

  // Test 1: Default vendor (no override)
  console.log('[Test 1] Default vendor resolution');
  const defaultProvider = getAgentWorkerProviderForVendor();
  assert(defaultProvider.vendorId === 'claude', `Default vendor: ${defaultProvider.vendorId}`);

  // Test 2: Per-goal vendor overrides
  console.log('\n[Test 2] Per-goal vendor override');

  const claudeProvider = getAgentWorkerProviderForVendor('claude');
  assert(claudeProvider.vendorId === 'claude', `Claude override: ${claudeProvider.vendorId}`);

  const codexProvider = getAgentWorkerProviderForVendor('codex');
  assert(codexProvider.vendorId === 'codex', `Codex override: ${codexProvider.vendorId}`);

  const kimiProvider = getAgentWorkerProviderForVendor('kimi');
  assert(kimiProvider.vendorId === 'kimi', `Kimi override: ${kimiProvider.vendorId}`);

  // Test 3: Model resolution per vendor
  console.log('\n[Test 3] Model resolution per vendor');

  // Clear MODEL env to test defaults
  const savedModel = process.env.MODEL;
  delete process.env.MODEL;

  const claudeModel = resolveWorkerModelForVendor('claude');
  assert(claudeModel === 'claude-sonnet-4-5', `Claude default model: ${claudeModel}`);

  const codexModel = resolveWorkerModelForVendor('codex');
  assert(codexModel === '', `Codex default model: (empty/CLI default) got "${codexModel}"`);

  const kimiModel = resolveWorkerModelForVendor('kimi');
  assert(kimiModel === '', `Kimi default model: (empty/CLI default) got "${kimiModel}"`);

  // Test MODEL env override
  process.env.MODEL = 'custom-model-override';
  const overrideModel = resolveWorkerModelForVendor('claude');
  assert(overrideModel === 'custom-model-override', `MODEL env override: ${overrideModel}`);

  // Restore
  if (savedModel) process.env.MODEL = savedModel;
  else delete process.env.MODEL;

  // Test 4: KIMI_MODE switching
  console.log('\n[Test 4] KIMI_MODE switching');
  resetProviders();

  // Default: wire mode
  delete process.env.KIMI_MODE;
  const kimiWire = getAgentWorkerProviderForVendor('kimi');
  assert(kimiWire.vendorName.includes('Wire'), `Default kimi mode: ${kimiWire.vendorName}`);

  // CLI mode
  process.env.KIMI_MODE = 'cli';
  resetProviders();
  const kimiCli = getAgentWorkerProviderForVendor('kimi');
  assert(kimiCli.vendorName.includes('CLI'), `CLI kimi mode: ${kimiCli.vendorName}`);

  // Restore
  delete process.env.KIMI_MODE;
  resetProviders();

  // Test 5: Auth validation
  console.log('\n[Test 5] Auth validation');

  const claudeAuth = claudeProvider.validateAuth();
  console.log(`  Claude auth: valid=${claudeAuth.valid} method=${claudeAuth.method}`);

  const codexAuth = codexProvider.validateAuth();
  console.log(`  Codex auth: valid=${codexAuth.valid} method=${codexAuth.method}`);

  const kimiAuth = kimiProvider.validateAuth();
  assert(kimiAuth.valid === true, `Kimi auth always valid (trusts CLI login): ${kimiAuth.method}`);

  // Summary
  console.log(`\n=== Vendor Registry E2E Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
