/**
 * Ad-hoc test: Terminology Cleanup — Log messages
 *
 * Verifies that key log messages in executive-loop.ts and state-handler.ts
 * use "goal" terminology instead of "task".
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-10-log-messages.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();

async function readSrc(rel: string): Promise<string> {
  return readFile(path.join(ROOT, rel), 'utf-8');
}

async function runTests() {
  let failures = 0;

  // === executive-loop.ts ===
  const execLoop = await readSrc('src/core/executive-loop.ts');

  // Expected log messages (should exist)
  const expectedLogs = [
    'Selected GOAL:',
    'Unblocked goals:',
    'Self-improvement goal',
  ];
  for (const msg of expectedLogs) {
    const found = execLoop.includes(msg);
    console.log(`[${found ? 'PASS' : 'FAIL'}] executive-loop.ts: contains "${msg}"`);
    if (!found) failures++;
  }

  // Should NOT contain old task log messages
  const bannedLogs = [
    'Selected TASK:',
    'Unblocked tasks:',
    'Self-improvement task added',
  ];
  for (const msg of bannedLogs) {
    const found = execLoop.includes(msg);
    console.log(`[${!found ? 'PASS' : 'FAIL'}] executive-loop.ts: does NOT contain "${msg}"`);
    if (found) failures++;
  }

  // === state-handler.ts ===
  const stateHandler = await readSrc('src/deterministic/state-handler.ts');

  const stateExpected = [
    'Updating goal state',
    'Marking goal as blocked',
  ];
  for (const msg of stateExpected) {
    const found = stateHandler.includes(msg);
    console.log(`[${found ? 'PASS' : 'FAIL'}] state-handler.ts: contains "${msg}"`);
    if (!found) failures++;
  }

  const stateBanned = [
    'Updating task state',
    'Marking task as blocked',
  ];
  for (const msg of stateBanned) {
    const found = stateHandler.includes(msg);
    console.log(`[${!found ? 'PASS' : 'FAIL'}] state-handler.ts: does NOT contain "${msg}"`);
    if (found) failures++;
  }

  if (failures === 0) {
    console.log('\n--- All log message tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
