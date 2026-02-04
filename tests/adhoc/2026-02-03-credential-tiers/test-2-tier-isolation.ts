/**
 * Ad-hoc test: Credential Tiers — Tier isolation / leak detection
 *
 * Validates that:
 * - Executive keys in worker env are flagged as leaks
 * - Worker keys in app env are flagged as leaks
 * - Clean env files pass validation
 * - Known tier keys are classified correctly
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-2-tier-isolation.ts
 */

import { writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import {
  checkWorkerEnvForLeaks,
  checkAppEnvForLeaks,
  TIER1_EXECUTIVE_KEYS,
  TIER2_WORKER_KEYS,
} from '../../../src/deterministic/credential-tiers.js';

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

// Use a temp directory for test files
const TMP_DIR = path.join(process.cwd(), 'tests/adhoc/2026-02-03-credential-tiers/.tmp-test');
mkdirSync(TMP_DIR, { recursive: true });

console.log('=== Test 2: Tier isolation / leak detection ===\n');

// --- Test 2a: Clean worker env (no leaks) ---
console.log('[2a] Clean worker env (Tier 2 only)');
const cleanWorkerPath = path.join(TMP_DIR, '.env.worker-clean');
writeFileSync(cleanWorkerPath, `
ANTHROPIC_API_KEY=sk-ant-test123
MODEL=claude-sonnet-4-5
MAX_TURNS=250
ELEVENLABS_API_KEY=el_test456
`);
const cleanResult = checkWorkerEnvForLeaks(cleanWorkerPath);
assert(cleanResult.clean === true, `Clean worker env should have no leaks`);
assert(cleanResult.leaks.length === 0, `Leak count should be 0, got ${cleanResult.leaks.length}`);

// --- Test 2b: Worker env WITH executive key leaks ---
console.log('\n[2b] Worker env with executive key leaks');
const leakyWorkerPath = path.join(TMP_DIR, '.env.worker-leaky');
writeFileSync(leakyWorkerPath, `
ANTHROPIC_API_KEY=sk-ant-test123
MODEL=claude-sonnet-4-5
NOTION_API_KEY=secret_notion_key
IDLE_SLEEP_SECONDS=30
`);
const leakyResult = checkWorkerEnvForLeaks(leakyWorkerPath);
assert(leakyResult.clean === false, `Leaky worker env should not be clean`);
assert(leakyResult.leaks.length === 2, `Should have 2 leaks (NOTION_API_KEY + IDLE_SLEEP_SECONDS), got ${leakyResult.leaks.length}`);
const leakedKeys = leakyResult.leaks.map(l => l.key).sort();
assert(leakedKeys.includes('NOTION_API_KEY'), `Should flag NOTION_API_KEY as leak`);
assert(leakedKeys.includes('IDLE_SLEEP_SECONDS'), `Should flag IDLE_SLEEP_SECONDS as leak`);
for (const leak of leakyResult.leaks) {
  assert(leak.belongsToTier === 'executive', `Leaked key ${leak.key} should belong to executive tier`);
  assert(leak.foundInTier === 'worker', `Leaked key ${leak.key} should be found in worker tier`);
}

// --- Test 2c: Clean app env ---
console.log('\n[2c] Clean app env (Tier 3 only)');
const cleanAppPath = path.join(TMP_DIR, '.env.app-clean');
writeFileSync(cleanAppPath, `
APP_DATABASE_URL=postgres://localhost/mydb
APP_REDIS_URL=redis://localhost:6379
APP_STRIPE_SECRET=sk_test_abc
`);
const cleanAppResult = checkAppEnvForLeaks(cleanAppPath);
assert(cleanAppResult.clean === true, `Clean app env should have no leaks`);

// --- Test 2d: App env WITH both executive and worker leaks ---
console.log('\n[2d] App env with executive + worker key leaks');
const leakyAppPath = path.join(TMP_DIR, '.env.app-leaky');
writeFileSync(leakyAppPath, `
APP_DATABASE_URL=postgres://localhost/mydb
NOTION_API_KEY=secret_notion
ANTHROPIC_API_KEY=sk-ant-shouldnt-be-here
APP_REDIS_URL=redis://localhost
`);
const leakyAppResult = checkAppEnvForLeaks(leakyAppPath);
assert(leakyAppResult.clean === false, `Leaky app env should not be clean`);
assert(leakyAppResult.leaks.length === 2, `Should have 2 leaks, got ${leakyAppResult.leaks.length}`);
const appLeakedKeys = leakyAppResult.leaks.map(l => l.key).sort();
assert(appLeakedKeys.includes('NOTION_API_KEY'), `Should flag NOTION_API_KEY as executive leak in app`);
assert(appLeakedKeys.includes('ANTHROPIC_API_KEY'), `Should flag ANTHROPIC_API_KEY as worker leak in app`);

// --- Test 2e: Non-existent file returns clean ---
console.log('\n[2e] Non-existent file returns clean');
const missingResult = checkWorkerEnvForLeaks(path.join(TMP_DIR, 'nonexistent.env'));
assert(missingResult.clean === true, `Non-existent file should return clean (no entries to leak)`);

// --- Test 2f: Known tier keys are comprehensive ---
console.log('\n[2f] Tier key sets are non-overlapping');
const overlap = [...TIER1_EXECUTIVE_KEYS].filter(k => TIER2_WORKER_KEYS.has(k));
assert(overlap.length === 0, `Tier 1 and Tier 2 key sets should not overlap, found: ${overlap.join(', ')}`);

// Cleanup
rmSync(TMP_DIR, { recursive: true, force: true });

// --- Summary ---
console.log(`\n--- Test 2 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
