/**
 * Ad-hoc test: Credential Tiers — resolveEnvFile fallback logic
 *
 * Validates that:
 * - resolveEnvFile picks tiered file first (.env.executive, .env.worker)
 * - Falls back to legacy .env when tiered file doesn't exist
 * - Returns null when no env file exists
 * - App tier does NOT fall back to .env (app is opt-in only)
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-5-resolve-env-file.ts
 */

import { writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { resolveEnvFile } from '../../../src/deterministic/credential-tiers.js';

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

console.log('=== Test 5: resolveEnvFile fallback logic ===\n');

// --- Test 5a: Tiered file preferred over legacy ---
console.log('[5a] Tiered file preferred over legacy .env');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(path.join(TMP_DIR, '.env.executive'), 'IDLE_SLEEP_SECONDS=30\n');
writeFileSync(path.join(TMP_DIR, '.env.worker'), 'ANTHROPIC_API_KEY=test\n');
writeFileSync(path.join(TMP_DIR, '.env'), 'LEGACY=true\n');

const execPath = resolveEnvFile(TMP_DIR, 'executive');
assert(execPath !== null, 'Executive env should be found');
assert(execPath!.endsWith('.env.executive'), `Should prefer .env.executive, got ${execPath}`);

const workerPath = resolveEnvFile(TMP_DIR, 'worker');
assert(workerPath !== null, 'Worker env should be found');
assert(workerPath!.endsWith('.env.worker'), `Should prefer .env.worker, got ${workerPath}`);

// --- Test 5b: Falls back to .env when tiered file missing ---
console.log('\n[5b] Fallback to .env when tiered file missing');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(path.join(TMP_DIR, '.env'), 'LEGACY=true\n');

const execFallback = resolveEnvFile(TMP_DIR, 'executive');
assert(execFallback !== null, 'Should fall back to .env for executive');
assert(execFallback!.endsWith('.env'), `Should fall back to .env, got ${execFallback}`);
assert(!execFallback!.endsWith('.env.executive'), `Should NOT be .env.executive`);

const workerFallback = resolveEnvFile(TMP_DIR, 'worker');
assert(workerFallback !== null, 'Should fall back to .env for worker');
assert(workerFallback!.endsWith('.env'), `Should fall back to .env, got ${workerFallback}`);

// --- Test 5c: App tier does NOT fall back to .env ---
console.log('\n[5c] App tier does NOT fall back to .env');
const appNoFallback = resolveEnvFile(TMP_DIR, 'app');
assert(appNoFallback === null, `App tier should NOT fall back to .env, got ${appNoFallback}`);

// --- Test 5d: App tier found when .env.app exists ---
console.log('\n[5d] App tier found when .env.app exists');
writeFileSync(path.join(TMP_DIR, '.env.app'), 'APP_DB=test\n');
const appFound = resolveEnvFile(TMP_DIR, 'app');
assert(appFound !== null, 'App env should be found when .env.app exists');
assert(appFound!.endsWith('.env.app'), `Should be .env.app, got ${appFound}`);

// --- Test 5e: Completely empty directory ---
console.log('\n[5e] Empty directory returns null');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });

const emptyExec = resolveEnvFile(TMP_DIR, 'executive');
assert(emptyExec === null, 'Empty dir should return null for executive');
const emptyWorker = resolveEnvFile(TMP_DIR, 'worker');
assert(emptyWorker === null, 'Empty dir should return null for worker');
const emptyApp = resolveEnvFile(TMP_DIR, 'app');
assert(emptyApp === null, 'Empty dir should return null for app');

// Cleanup
rmSync(TMP_DIR, { recursive: true, force: true });

// --- Summary ---
console.log(`\n--- Test 5 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
