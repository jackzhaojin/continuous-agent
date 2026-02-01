/**
 * Ad-hoc test: Terminology Cleanup — Dual-write integration
 *
 * Structural test: Verifies that execution-handler.ts and state-handler.ts
 * import and call appendContractEvent() at the correct points.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-8-dual-write-integration.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();

async function readSrc(rel: string): Promise<string> {
  return readFile(path.join(ROOT, rel), 'utf-8');
}

async function runTests() {
  let failures = 0;

  function assertContains(file: string, content: string, pattern: string, label: string) {
    const found = content.includes(pattern);
    console.log(`[${found ? 'PASS' : 'FAIL'}] ${file}: ${label}`);
    if (!found) { console.error(`  Pattern not found: "${pattern}"`); failures++; }
  }

  // === execution-handler.ts ===
  const execHandler = await readSrc('src/agentic/execution/execution-handler.ts');

  assertContains('execution-handler.ts', execHandler,
    "import { appendContractEvent } from '../../deterministic/contracts-log-writer.js'",
    'imports appendContractEvent');

  assertContains('execution-handler.ts', execHandler,
    "event: 'CONTRACT_STARTED'",
    'writes CONTRACT_STARTED event');

  // Verify the dual-write is inside logWorkStart (after ledger write, before STEPS.json update)
  const logWorkStartBody = execHandler.slice(
    execHandler.indexOf('export async function logWorkStart('),
    execHandler.indexOf('\nexport ', execHandler.indexOf('export async function logWorkStart(') + 1)
  );
  assertContains('logWorkStart()', logWorkStartBody,
    'appendContractEvent(item.source_path',
    'calls appendContractEvent in logWorkStart');

  // === state-handler.ts ===
  const stateHandler = await readSrc('src/deterministic/state-handler.ts');

  assertContains('state-handler.ts', stateHandler,
    "import { appendContractEvent } from './contracts-log-writer.js'",
    'imports appendContractEvent');

  // updateGoalState — success branch (CONTRACT_COMPLETED)
  const goalStateBody = stateHandler.slice(
    stateHandler.indexOf('export async function updateGoalState('),
    stateHandler.indexOf('\nexport ', stateHandler.indexOf('export async function updateGoalState(') + 1)
  );
  assertContains('updateGoalState()', goalStateBody,
    "event: 'CONTRACT_COMPLETED'",
    'writes CONTRACT_COMPLETED on success');

  assertContains('updateGoalState()', goalStateBody,
    "event: 'CONTRACT_FAILED'",
    'writes CONTRACT_FAILED on failure');

  // updateStepState — both branches
  const stepStateBody = stateHandler.slice(
    stateHandler.indexOf('export async function updateStepState('),
    stateHandler.indexOf('\nexport ', stateHandler.indexOf('export async function updateStepState(') + 1)
  );
  assertContains('updateStepState()', stepStateBody,
    "event: 'CONTRACT_COMPLETED'",
    'writes CONTRACT_COMPLETED on step success');

  assertContains('updateStepState()', stepStateBody,
    "event: 'CONTRACT_FAILED'",
    'writes CONTRACT_FAILED on step failure');

  // markGoalBlocked
  const goalBlockedBody = stateHandler.slice(
    stateHandler.indexOf('export async function markGoalBlocked('),
    stateHandler.indexOf('\nexport ', stateHandler.indexOf('export async function markGoalBlocked(') + 1)
  );
  assertContains('markGoalBlocked()', goalBlockedBody,
    "event: 'CONTRACT_BLOCKED'",
    'writes CONTRACT_BLOCKED');

  // markStepBlocked
  const stepBlockedBody = stateHandler.slice(
    stateHandler.indexOf('export async function markStepBlocked('),
    stateHandler.indexOf('\nexport ', stateHandler.indexOf('export async function markStepBlocked(') + 1)
  );
  assertContains('markStepBlocked()', stepBlockedBody,
    "event: 'CONTRACT_BLOCKED'",
    'writes CONTRACT_BLOCKED for step');

  // --- Summary ---
  if (failures === 0) {
    console.log('\n--- All dual-write integration tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
