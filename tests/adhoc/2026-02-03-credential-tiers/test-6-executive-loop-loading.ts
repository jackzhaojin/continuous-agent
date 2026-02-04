/**
 * Ad-hoc test: Credential Tiers — Executive loop env loading order
 *
 * Validates that the tiered loading in executive-loop.ts:
 * - Loads .env.executive first (values take precedence)
 * - Loads .env.worker second (does not override existing)
 * - Falls back to .env (does not override existing)
 * - dotenv's config() with no-override behavior is correct
 *
 * This test verifies the LOGIC, not the actual executive loop runtime.
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-6-executive-loop-loading.ts
 */

import { config } from 'dotenv';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

const TMP_DIR = path.join(process.cwd(), 'tests/adhoc/2026-02-03-credential-tiers/.tmp-test-loop');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });

console.log('=== Test 6: Executive loop env loading order ===\n');

// Save original env values and clean up test keys
const originals: Record<string, string | undefined> = {};
const testKeys = ['TEST_TIER_SHARED', 'TEST_TIER1_ONLY', 'TEST_TIER2_ONLY', 'TEST_LEGACY_ONLY'];
for (const key of testKeys) {
  originals[key] = process.env[key];
  delete process.env[key];
}

// --- Create tiered env files with overlapping keys ---
writeFileSync(path.join(TMP_DIR, '.env.executive'), `
TEST_TIER_SHARED=from_executive
TEST_TIER1_ONLY=executive_value
`);

writeFileSync(path.join(TMP_DIR, '.env.worker'), `
TEST_TIER_SHARED=from_worker
TEST_TIER2_ONLY=worker_value
`);

writeFileSync(path.join(TMP_DIR, '.env'), `
TEST_TIER_SHARED=from_legacy
TEST_LEGACY_ONLY=legacy_value
`);

// --- Simulate the executive loop's loading logic ---
console.log('[6a] Simulating tiered loading order');
const envFiles = ['.env.executive', '.env.worker', '.env'];
for (const envFile of envFiles) {
  const envPath = path.join(TMP_DIR, envFile);
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

// --- Test 6a: Executive takes precedence for shared keys ---
console.log('\n[6a] Executive takes precedence for shared keys');
assert(
  process.env.TEST_TIER_SHARED === 'from_executive',
  `Shared key should come from executive (first loaded), got "${process.env.TEST_TIER_SHARED}"`
);

// --- Test 6b: Executive-only keys are loaded ---
console.log('\n[6b] Executive-only keys are loaded');
assert(
  process.env.TEST_TIER1_ONLY === 'executive_value',
  `Tier 1 key should be loaded, got "${process.env.TEST_TIER1_ONLY}"`
);

// --- Test 6c: Worker-only keys are loaded ---
console.log('\n[6c] Worker-only keys are loaded');
assert(
  process.env.TEST_TIER2_ONLY === 'worker_value',
  `Tier 2 key should be loaded, got "${process.env.TEST_TIER2_ONLY}"`
);

// --- Test 6d: Legacy-only keys are loaded ---
console.log('\n[6d] Legacy-only keys are loaded');
assert(
  process.env.TEST_LEGACY_ONLY === 'legacy_value',
  `Legacy key should be loaded, got "${process.env.TEST_LEGACY_ONLY}"`
);

// --- Test 6e: dotenv does NOT override existing keys ---
console.log('\n[6e] dotenv does NOT override existing process.env keys');
// Set a key before loading
delete process.env.TEST_PRE_SET;
process.env.TEST_PRE_SET = 'original';
writeFileSync(path.join(TMP_DIR, '.env.test-override'), `
TEST_PRE_SET=should_not_override
`);
config({ path: path.join(TMP_DIR, '.env.test-override') });
assert(
  process.env.TEST_PRE_SET === 'original',
  `dotenv should not override existing key, got "${process.env.TEST_PRE_SET}"`
);

// Cleanup: restore original env values
for (const key of testKeys) {
  if (originals[key] !== undefined) {
    process.env[key] = originals[key];
  } else {
    delete process.env[key];
  }
}
delete process.env.TEST_PRE_SET;
rmSync(TMP_DIR, { recursive: true, force: true });

// --- Summary ---
console.log(`\n--- Test 6 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
