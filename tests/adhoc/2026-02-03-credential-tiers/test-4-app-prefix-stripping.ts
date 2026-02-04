/**
 * Ad-hoc test: Credential Tiers — APP_ prefix stripping
 *
 * Validates that:
 * - APP_ prefix is stripped from Tier 3 credentials
 * - Non-APP_ keys pass through unchanged
 * - getAvailableAppCredentialNames returns stripped names
 * - getAppCredentialPairs returns correct key-value pairs
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-4-app-prefix-stripping.ts
 */

import { writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import {
  getAppCredentialPairs,
  getAvailableAppCredentialNames,
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

const TMP_DIR = path.join(process.cwd(), 'tests/adhoc/2026-02-03-credential-tiers/.tmp-test');
mkdirSync(TMP_DIR, { recursive: true });

console.log('=== Test 4: APP_ prefix stripping ===\n');

// --- Test 4a: Standard APP_ prefix stripping ---
console.log('[4a] APP_ prefix stripping');
const appEnvPath = path.join(TMP_DIR, '.env.app');
writeFileSync(appEnvPath, `
APP_DATABASE_URL=postgres://localhost/mydb
APP_REDIS_URL=redis://localhost:6379
APP_STRIPE_SECRET=sk_test_abc
APP_SENDGRID_API_KEY=sg_test_xyz
`);

const pairs = getAppCredentialPairs(appEnvPath);
assert(pairs.length === 4, `Should have 4 pairs, got ${pairs.length}`);
assert(pairs[0].key === 'DATABASE_URL', `First key should be DATABASE_URL (APP_ stripped), got ${pairs[0].key}`);
assert(pairs[0].value === 'postgres://localhost/mydb', `First value should be the DB URL`);
assert(pairs[1].key === 'REDIS_URL', `Second key should be REDIS_URL (APP_ stripped), got ${pairs[1].key}`);
assert(pairs[2].key === 'STRIPE_SECRET', `Third key should be STRIPE_SECRET, got ${pairs[2].key}`);
assert(pairs[3].key === 'SENDGRID_API_KEY', `Fourth key should be SENDGRID_API_KEY, got ${pairs[3].key}`);

// --- Test 4b: Mixed APP_ and non-APP_ keys ---
console.log('\n[4b] Mixed APP_ and non-APP_ keys');
const mixedPath = path.join(TMP_DIR, '.env.app-mixed');
writeFileSync(mixedPath, `
APP_DATABASE_URL=postgres://localhost/mydb
CUSTOM_KEY=custom_value
APP_REDIS_URL=redis://localhost
`);

const mixedPairs = getAppCredentialPairs(mixedPath);
assert(mixedPairs.length === 3, `Should have 3 pairs, got ${mixedPairs.length}`);
assert(mixedPairs[0].key === 'DATABASE_URL', `APP_ prefix should be stripped`);
assert(mixedPairs[1].key === 'CUSTOM_KEY', `Non-APP_ key should pass through unchanged`);
assert(mixedPairs[1].value === 'custom_value', `Non-APP_ value should be correct`);
assert(mixedPairs[2].key === 'REDIS_URL', `APP_ prefix should be stripped`);

// --- Test 4c: getAvailableAppCredentialNames ---
console.log('\n[4c] getAvailableAppCredentialNames');
const names = getAvailableAppCredentialNames(appEnvPath);
assert(names.length === 4, `Should have 4 names, got ${names.length}`);
assert(names.includes('DATABASE_URL'), `Should include DATABASE_URL`);
assert(names.includes('REDIS_URL'), `Should include REDIS_URL`);
assert(names.includes('STRIPE_SECRET'), `Should include STRIPE_SECRET`);
assert(names.includes('SENDGRID_API_KEY'), `Should include SENDGRID_API_KEY`);
assert(!names.includes('APP_DATABASE_URL'), `Should NOT include APP_-prefixed names`);

// --- Test 4d: Empty/missing file ---
console.log('\n[4d] Missing file returns empty');
const missingPairs = getAppCredentialPairs(path.join(TMP_DIR, 'nonexistent.env'));
assert(missingPairs.length === 0, `Missing file should return empty pairs`);
const missingNames = getAvailableAppCredentialNames(path.join(TMP_DIR, 'nonexistent.env'));
assert(missingNames.length === 0, `Missing file should return empty names`);

// --- Test 4e: File with only empty values ---
console.log('\n[4e] File with only empty values');
const emptyValsPath = path.join(TMP_DIR, '.env.app-empty');
writeFileSync(emptyValsPath, `
APP_DATABASE_URL=
APP_REDIS_URL=
`);
const emptyPairs = getAppCredentialPairs(emptyValsPath);
assert(emptyPairs.length === 0, `File with only empty values should return no pairs, got ${emptyPairs.length}`);

// Cleanup
rmSync(TMP_DIR, { recursive: true, force: true });

// --- Summary ---
console.log(`\n--- Test 4 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
