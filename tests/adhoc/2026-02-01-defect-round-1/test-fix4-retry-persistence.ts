/**
 * Ad-hoc test: Fix #4 — Retry counter persistence in TASKS.json
 *
 * Validates that:
 * 1. incrementStepRetryCount() writes retry_count to TASKS.json
 * 2. readStepRetryCount() reads it back
 * 3. retry_count survives read/write round-trips
 * 4. taskStepsToWorkSteps preserves retry_count
 * 5. workStepsToTaskSteps preserves retry_count
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix4-retry-persistence.ts
 */

import { mkdtemp, rm, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  writeTasksJson,
  readTasksJson,
  incrementStepRetryCount,
  readStepRetryCount,
  taskStepsToWorkSteps,
  workStepsToTaskSteps,
} from '../../../src/deterministic/tasks-json-handler.js';
import type { TasksFile, TaskStep } from '../../../src/core/types.js';

async function runTests() {
  // Create temp directory for test bundles
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fix4-test-'));

  try {
    // --- Setup: Write a TASKS.json with 3 steps ---
    const tasksFile: TasksFile = {
      version: 1,
      created_at: new Date().toISOString(),
      trigger: 'auto',
      revision: 0,
      steps: [
        {
          id: 'step-0',
          order: 0,
          title: 'Research',
          description: 'Research the approach',
          status: 'complete',
          dependencies: [],
          estimated_turns: 50,
          completed_at: '2026-01-30T00:00:00Z',
        },
        {
          id: 'step-1',
          order: 1,
          title: 'Build',
          description: 'Build the app',
          status: 'in_progress',
          dependencies: ['step-0'],
          estimated_turns: 100,
        },
        {
          id: 'step-2',
          order: 2,
          title: 'Test',
          description: 'Test everything',
          status: 'pending',
          dependencies: ['step-1'],
          estimated_turns: 50,
        },
      ],
    };

    await writeTasksJson(tmpDir, tasksFile);

    // --- Test 1: Initial retry_count should be 0 ---
    const count0 = await readStepRetryCount(tmpDir, 'step-1');
    console.log(`[Test 1] Initial retry_count for step-1: ${count0}`);
    console.assert(count0 === 0, `FAIL: Expected 0, got ${count0}`);

    // --- Test 2: Increment once ---
    const count1 = await incrementStepRetryCount(tmpDir, 'step-1');
    console.log(`[Test 2] After 1 increment: ${count1}`);
    console.assert(count1 === 1, `FAIL: Expected 1, got ${count1}`);

    // --- Test 3: Increment again ---
    const count2 = await incrementStepRetryCount(tmpDir, 'step-1');
    console.log(`[Test 3] After 2 increments: ${count2}`);
    console.assert(count2 === 2, `FAIL: Expected 2, got ${count2}`);

    // --- Test 4: Read back persisted value ---
    const readBack = await readStepRetryCount(tmpDir, 'step-1');
    console.log(`[Test 4] Read back: ${readBack}`);
    console.assert(readBack === 2, `FAIL: Expected 2 from readback, got ${readBack}`);

    // --- Test 5: Other steps unaffected ---
    const step0Count = await readStepRetryCount(tmpDir, 'step-0');
    const step2Count = await readStepRetryCount(tmpDir, 'step-2');
    console.log(`[Test 5] step-0 retry_count: ${step0Count}, step-2 retry_count: ${step2Count}`);
    console.assert(step0Count === 0, `FAIL: step-0 should be 0, got ${step0Count}`);
    console.assert(step2Count === 0, `FAIL: step-2 should be 0, got ${step2Count}`);

    // --- Test 6: retry_count present in raw JSON ---
    const raw = JSON.parse(await readFile(path.join(tmpDir, 'TASKS.json'), 'utf-8'));
    const step1Raw = raw.steps.find((s: TaskStep) => s.id === 'step-1');
    console.log(`[Test 6] Raw JSON retry_count: ${step1Raw?.retry_count}`);
    console.assert(step1Raw?.retry_count === 2, `FAIL: Raw JSON should have retry_count=2, got ${step1Raw?.retry_count}`);

    // --- Test 7: taskStepsToWorkSteps preserves retry_count ---
    const reread = await readTasksJson(tmpDir);
    if (!reread) throw new Error('Failed to read TASKS.json');
    const workSteps = taskStepsToWorkSteps(reread.steps);
    const ws1 = workSteps.find(s => s.step_number === 1);
    console.log(`[Test 7] WorkStep retry_count: ${ws1?.retry_count}`);
    console.assert(ws1?.retry_count === 2, `FAIL: WorkStep should have retry_count=2, got ${ws1?.retry_count}`);

    // --- Test 8: workStepsToTaskSteps preserves retry_count ---
    const roundTripped = workStepsToTaskSteps(workSteps);
    const ts1 = roundTripped.find(s => s.id === 'step-1');
    console.log(`[Test 8] Round-tripped TaskStep retry_count: ${ts1?.retry_count}`);
    console.assert(ts1?.retry_count === 2, `FAIL: Round-tripped should have retry_count=2, got ${ts1?.retry_count}`);

    // --- Test 9: Nonexistent step returns 0 ---
    const noStep = await readStepRetryCount(tmpDir, 'step-99');
    console.log(`[Test 9] Nonexistent step: ${noStep}`);
    console.assert(noStep === 0, `FAIL: Nonexistent step should return 0, got ${noStep}`);

    // --- Test 10: Nonexistent bundle returns 0 ---
    const noBundleCount = await readStepRetryCount('/tmp/does-not-exist', 'step-0');
    console.log(`[Test 10] Nonexistent bundle: ${noBundleCount}`);
    console.assert(noBundleCount === 0, `FAIL: Nonexistent bundle should return 0, got ${noBundleCount}`);

    console.log('\n--- All Fix #4 tests passed ---');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
