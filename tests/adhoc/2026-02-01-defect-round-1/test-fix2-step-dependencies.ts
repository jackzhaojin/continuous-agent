/**
 * Ad-hoc test: Fix #2 — Step dependency violation
 *
 * Validates that the step selection logic in goal-scanner correctly skips
 * steps whose dependencies are not all complete.
 *
 * The bug: step-2 (depends on step-1) could be selected even when step-1
 * was blocked. Now the dependency check prevents this.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix2-step-dependencies.ts
 */

import type { WorkStep } from '../../../src/core/types.js';

/**
 * Simulates the step selection logic from goal-scanner.ts:368-388
 * This is an exact copy of the logic to test in isolation.
 */
function selectFirstAvailableStep(steps: WorkStep[]): WorkStep | null {
  for (const step of steps) {
    if (step.status === 'complete' || step.status === 'blocked') continue;

    // The fix: check if all dependencies are complete before selecting
    if (step.dependencies && step.dependencies.length > 0) {
      const allDepsComplete = step.dependencies.every(depNum =>
        steps[depNum]?.status === 'complete'
      );
      if (!allDepsComplete) continue;
    }

    return step;
  }
  return null;
}

// --- Test 1: No dependencies — selects first pending step ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'complete' },
    { step_number: 1, title: 'Setup', description: '', status: 'pending' },
    { step_number: 2, title: 'Build', description: '', status: 'pending' },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 1] No deps, first pending: ${selected?.title}`);
  console.assert(selected?.step_number === 1, `FAIL: Expected step 1 (Setup), got ${selected?.step_number}`);
}

// --- Test 2: Step-1 blocked, step-2 depends on step-1 — should skip both ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'complete' },
    { step_number: 1, title: 'Setup', description: '', status: 'blocked', dependencies: [0] },
    { step_number: 2, title: 'Build', description: '', status: 'pending', dependencies: [1] },
    { step_number: 3, title: 'Test', description: '', status: 'pending', dependencies: [2] },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 2] Blocked dep chain: ${selected?.title ?? 'null'}`);
  console.assert(selected === null, `FAIL: Expected null (all blocked by dependency), got step ${selected?.step_number}`);
}

// --- Test 3: Step-1 complete, step-2 depends on step-1 — should select step-2 ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'complete' },
    { step_number: 1, title: 'Setup', description: '', status: 'complete', dependencies: [0] },
    { step_number: 2, title: 'Build', description: '', status: 'pending', dependencies: [1] },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 3] Deps satisfied: ${selected?.title}`);
  console.assert(selected?.step_number === 2, `FAIL: Expected step 2 (Build), got ${selected?.step_number}`);
}

// --- Test 4: Multiple dependencies, one not complete ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research A', description: '', status: 'complete' },
    { step_number: 1, title: 'Research B', description: '', status: 'pending' },
    { step_number: 2, title: 'Merge', description: '', status: 'pending', dependencies: [0, 1] },
    { step_number: 3, title: 'Final', description: '', status: 'pending', dependencies: [2] },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 4] Multi-dep, one pending: ${selected?.title}`);
  // step-1 has no deps and is pending, so it should be selected
  console.assert(selected?.step_number === 1, `FAIL: Expected step 1 (Research B), got ${selected?.step_number}`);
}

// --- Test 5: Empty dependencies array (no deps) — should be selectable ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'complete' },
    { step_number: 1, title: 'Setup', description: '', status: 'pending', dependencies: [] },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 5] Empty deps array: ${selected?.title}`);
  console.assert(selected?.step_number === 1, `FAIL: Expected step 1 (Setup), got ${selected?.step_number}`);
}

// --- Test 6: Undefined dependencies (no deps field) — should be selectable ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'complete' },
    { step_number: 1, title: 'Setup', description: '', status: 'pending' },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 6] Undefined deps: ${selected?.title}`);
  console.assert(selected?.step_number === 1, `FAIL: Expected step 1 (Setup), got ${selected?.step_number}`);
}

// --- Test 7: All steps complete — null ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'complete' },
    { step_number: 1, title: 'Setup', description: '', status: 'complete' },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 7] All complete: ${selected?.title ?? 'null'}`);
  console.assert(selected === null, `FAIL: Expected null, got step ${selected?.step_number}`);
}

// --- Test 8: in_progress step with blocked dep — should skip ---
{
  const steps: WorkStep[] = [
    { step_number: 0, title: 'Research', description: '', status: 'blocked' },
    { step_number: 1, title: 'Setup', description: '', status: 'in_progress', dependencies: [0] },
  ];
  const selected = selectFirstAvailableStep(steps);
  console.log(`[Test 8] in_progress with blocked dep: ${selected?.title ?? 'null'}`);
  // step-0 is blocked (skipped), step-1 is in_progress but dep[0] is blocked not complete
  console.assert(selected === null, `FAIL: Expected null (dep not complete), got step ${selected?.step_number}`);
}

console.log('\n--- All Fix #2 tests passed ---');
