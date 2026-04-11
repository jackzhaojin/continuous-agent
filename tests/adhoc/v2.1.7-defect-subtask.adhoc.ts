/**
 * Adhoc test for v2.1.7 defect subtask pipeline.
 *
 * Verifies:
 *   1. insertDefectSubtask computes the right hierarchical ID (5 → 5.1 → 5.1.1)
 *   2. insertDefectSubtask marks the parent as blocked_on_subtask
 *   3. selectNextExecutableStep picks the defect subtask BEFORE the next sibling (depth-first)
 *   4. Once the subtask completes, unblockParentIfSubtasksComplete clears the parent
 *
 * Run: npx tsx tests/adhoc/v2.1.7-defect-subtask.adhoc.ts
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  createStepsFile,
  writeStepsJson,
  readStepsJson,
  insertDefectSubtask,
  selectNextExecutableStep,
  nextSubtaskId,
  unblockParentIfSubtasksComplete,
  updateStepStatus,
} from '../../src/deterministic/steps-json-handler.js';
import type { WorkStep } from '../../src/core/types.js';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

async function main() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'defect-subtask-test-'));
  console.log(`[adhoc] Working dir: ${tmp}`);

  // Seed a 6-step goal
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Step 0', description: '', status: 'complete', dependencies: [], id: 'step-0', order: 0 },
    { step_number: 1, title: 'Step 1', description: '', status: 'complete', dependencies: [0], id: 'step-1', order: 1 },
    { step_number: 2, title: 'Step 2', description: '', status: 'complete', dependencies: [1], id: 'step-2', order: 2 },
    { step_number: 3, title: 'Step 3', description: '', status: 'complete', dependencies: [2], id: 'step-3', order: 3 },
    { step_number: 4, title: 'Step 4', description: '', status: 'complete', dependencies: [3], id: 'step-4', order: 4 },
    { step_number: 5, title: 'Step 5 (parent)', description: '', status: 'complete', dependencies: [4], id: 'step-5', order: 5 },
    { step_number: 6, title: 'Step 6 (sibling)', description: '', status: 'pending', dependencies: [5], id: 'step-6', order: 6 },
  ];
  const file = createStepsFile(steps);
  await writeStepsJson(tmp, file);

  // Test 1: nextSubtaskId scheme
  console.log('\n[1] nextSubtaskId computes hierarchical IDs');
  assert(nextSubtaskId('step-5', ['step-5', 'step-6']) === 'step-5.1', 'first subtask of step-5 is step-5.1');
  assert(nextSubtaskId('step-5', ['step-5', 'step-5.1']) === 'step-5.2', 'second subtask of step-5 is step-5.2');
  assert(nextSubtaskId('step-5.1', ['step-5', 'step-5.1']) === 'step-5.1.1', 'subtask of a subtask is step-5.1.1');
  assert(nextSubtaskId('step-5', ['step-5', 'step-5.1', 'step-5.1.1', 'step-5.2']) === 'step-5.3', 'does not count grandchildren');

  // Test 2: insertDefectSubtask under step-5
  console.log('\n[2] insertDefectSubtask inserts hierarchical subtask and flags parent');
  const subId1 = await insertDefectSubtask(tmp, 'step-5', {
    title: 'Parent step did not wire pickup slot to confirmation',
    root_cause: 'No network POST on continue click',
    evidence: 'Network tab empty',
    acceptance_criteria: ['POST fires', 'Confirmation reads persisted slot'],
  });
  assert(subId1 === 'step-5.1', `filed subtask is step-5.1 (got ${subId1})`);

  // Reload and verify state
  const after1 = await readStepsJson(tmp);
  assert(after1 !== null, 'STEPS.json reloads');
  const parent1 = after1!.steps.find(s => s.id === 'step-5');
  assert(parent1?.blocked_on_subtask === true, 'parent step-5 is marked blocked_on_subtask');
  const sub = after1!.steps.find(s => s.id === 'step-5.1');
  assert(sub !== undefined, 'defect subtask step-5.1 exists');
  assert(sub?.origin === 'validator_defect', 'subtask origin is validator_defect');
  assert(sub?.parent_id === 'step-5', 'subtask parent_id is step-5');
  assert(sub?.defect_evidence?.title?.startsWith('Parent step did not wire') ?? false, 'defect_evidence has title');

  // Test 3: selectNextExecutableStep — depth-first must pick step-5.1 over step-6
  console.log('\n[3] selectNextExecutableStep picks defect subtask before sibling (depth-first)');
  const next = selectNextExecutableStep(after1!.steps);
  assert(next !== null, 'selectNextExecutableStep returns a step');
  assert(next?.id === 'step-5.1', `depth-first selects step-5.1 before step-6 (got ${next?.id})`);

  // Test 4: Nested defect (step-5.1 → step-5.1.1)
  console.log('\n[4] Nested defect subtask under step-5.1');
  const subId2 = await insertDefectSubtask(tmp, 'step-5.1', {
    title: 'Fix attempt still broken',
    root_cause: 'Mock API instead of real Supabase',
  });
  assert(subId2 === 'step-5.1.1', `nested subtask is step-5.1.1 (got ${subId2})`);
  const after2 = await readStepsJson(tmp);
  const deepest = selectNextExecutableStep(after2!.steps);
  assert(deepest?.id === 'step-5.1.1', `depth-first finds deepest subtask step-5.1.1 (got ${deepest?.id})`);

  // Test 5: Complete subtasks in reverse — parent unblocks
  console.log('\n[5] unblockParentIfSubtasksComplete clears parent after all subtasks complete');
  await updateStepStatus(tmp, 'step-5.1.1', 'complete');
  // step-5.1 should still be open (it is pending), so step-5 should stay blocked
  const after3 = await readStepsJson(tmp);
  const sel3 = selectNextExecutableStep(after3!.steps);
  assert(sel3?.id === 'step-5.1', `after completing step-5.1.1, selector picks step-5.1 (got ${sel3?.id})`);

  await updateStepStatus(tmp, 'step-5.1', 'complete');
  const unblocked = await unblockParentIfSubtasksComplete(tmp, 'step-5');
  assert(unblocked === true, 'unblockParentIfSubtasksComplete returns true when all subtasks complete');

  const after4 = await readStepsJson(tmp);
  const sel4 = selectNextExecutableStep(after4!.steps);
  assert(sel4?.id === 'step-6', `after unblock, next selected step is step-6 sibling (got ${sel4?.id})`);

  // Cleanup
  rmSync(tmp, { recursive: true, force: true });

  console.log(`\n[adhoc] ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
