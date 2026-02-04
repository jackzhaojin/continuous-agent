/**
 * Ad-hoc test: Credential Tiers — Worker spawner file selection
 *
 * Validates the worker-spawner's env file selection logic:
 * - Prefers .env.worker over .env
 * - Falls back to .env when .env.worker doesn't exist
 * - Handles missing env files gracefully
 *
 * This tests the logic pattern, not the full spawner (which needs Agent SDK).
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-7-worker-spawner-integration.ts
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, copyFileSync } from 'fs';
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

const TMP_DIR = path.join(process.cwd(), 'tests/adhoc/2026-02-03-credential-tiers/.tmp-test-spawner');

console.log('=== Test 7: Worker spawner env file selection ===\n');

// Simulate the worker-spawner's env copy logic
function simulateWorkerEnvCopy(agentBase: string, outputsBase: string): string | null {
  const envSources = [path.join(agentBase, '.env.worker'), path.join(agentBase, '.env')];
  const envDest = path.join(outputsBase, '.env');
  const envSource = envSources.find((candidate) => existsSync(candidate));
  if (envSource) {
    copyFileSync(envSource, envDest);
    return envSource;
  }
  return null;
}

// --- Test 7a: Prefers .env.worker ---
console.log('[7a] Prefers .env.worker when both exist');
rmSync(TMP_DIR, { recursive: true, force: true });
const agentDir = path.join(TMP_DIR, 'agent');
const outputDir = path.join(TMP_DIR, 'outputs');
mkdirSync(agentDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

writeFileSync(path.join(agentDir, '.env.worker'), 'ANTHROPIC_API_KEY=worker_key\nMODEL=claude-sonnet-4-5\n');
writeFileSync(path.join(agentDir, '.env'), 'ANTHROPIC_API_KEY=legacy_key\nNOTION_API_KEY=should_not_appear\n');

const selected7a = simulateWorkerEnvCopy(agentDir, outputDir);
assert(selected7a !== null, 'Should find an env file');
assert(selected7a!.endsWith('.env.worker'), `Should select .env.worker, got ${selected7a}`);

const copied7a = readFileSync(path.join(outputDir, '.env'), 'utf-8');
assert(copied7a.includes('ANTHROPIC_API_KEY=worker_key'), 'Output .env should have worker key');
assert(!copied7a.includes('NOTION_API_KEY'), 'Output .env should NOT have executive-only keys');

// --- Test 7b: Falls back to .env ---
console.log('\n[7b] Falls back to .env when .env.worker missing');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(agentDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

writeFileSync(path.join(agentDir, '.env'), 'ANTHROPIC_API_KEY=legacy_key\nMODEL=claude-sonnet-4-5\n');

const selected7b = simulateWorkerEnvCopy(agentDir, outputDir);
assert(selected7b !== null, 'Should find .env as fallback');
assert(selected7b!.endsWith('.env'), `Should select .env, got ${selected7b}`);
assert(!selected7b!.endsWith('.env.worker'), 'Should NOT be .env.worker');

const copied7b = readFileSync(path.join(outputDir, '.env'), 'utf-8');
assert(copied7b.includes('ANTHROPIC_API_KEY=legacy_key'), 'Output .env should have legacy key');

// --- Test 7c: No env files at all ---
console.log('\n[7c] No env files at all');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(agentDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const selected7c = simulateWorkerEnvCopy(agentDir, outputDir);
assert(selected7c === null, 'Should return null when no env files exist');
assert(!existsSync(path.join(outputDir, '.env')), 'No .env should be created in outputs');

// --- Test 7d: Worker env does NOT contain executive keys (separation test) ---
console.log('\n[7d] Properly separated .env.worker has no executive keys');
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(agentDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

// Write properly separated files
writeFileSync(path.join(agentDir, '.env.executive'), 'NOTION_API_KEY=secret\nIDLE_SLEEP_SECONDS=30\n');
writeFileSync(path.join(agentDir, '.env.worker'), 'ANTHROPIC_API_KEY=worker_key\nMODEL=claude-sonnet-4-5\n');

simulateWorkerEnvCopy(agentDir, outputDir);
const workerOutput = readFileSync(path.join(outputDir, '.env'), 'utf-8');
assert(!workerOutput.includes('NOTION_API_KEY'), 'Worker output should NOT contain NOTION_API_KEY');
assert(!workerOutput.includes('IDLE_SLEEP_SECONDS'), 'Worker output should NOT contain IDLE_SLEEP_SECONDS');
assert(workerOutput.includes('ANTHROPIC_API_KEY'), 'Worker output should contain ANTHROPIC_API_KEY');

// Cleanup
rmSync(TMP_DIR, { recursive: true, force: true });

// --- Summary ---
console.log(`\n--- Test 7 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
