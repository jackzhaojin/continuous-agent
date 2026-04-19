/**
 * H3 — Gate step must block on regression.
 *
 * v2.1.6: Gate 9 detected 17/45 failing tests but the loop continued. v2.4
 * adds a deterministic cheap check that fires BEFORE the LLM validator —
 * when a gate step's journey_blocks_added is lower than the prior gate's
 * (or missing entirely), file a defect subtask that sets blocks_parent=true
 * so the depth-first selector forces the defect to run before the next
 * sibling.
 *
 * Run: npx tsx tests/adhoc/h3-gate-blocks-on-regression.adhoc.ts
 */

import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  createStepsFile,
  writeStepsJson,
  readStepsJson,
} from '../../src/deterministic/steps-json-handler.js';
import { runIntegrationValidator } from '../../src/agentic/execution/integration-validator-runner.ts';
import type { WorkItem, WorkStep } from '../../src/core/types.js';

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
  const rootTmp = mkdtempSync(path.join(tmpdir(), 'h3-gate-'));
  mkdirSync(path.join(rootTmp, 'workspace'));
  const prevCwd = process.cwd();
  process.chdir(rootTmp);

  try {
    const bundleDir = path.join(rootTmp, 'my-goal');
    mkdirSync(bundleDir);

    console.log('[H3] Gate regression blocker tests\n');

    // ── Case 1: regression detected — journey_blocks_added decreased ──
    console.log('[1] journey_blocks_added 4 → 2 on consecutive gates → defect filed, parent blocked');
    const stepsRegression: WorkStep[] = [
      {
        id: 'step-5', order: 5, step_number: 5,
        title: '[GATE] Journey checkpoint 1', description: '',
        status: 'complete', dependencies: [], kind: 'integration_gate',
        handoff: { journey_blocks_added: 4, what_i_built: 'gate 1', what_connects: 'tests', what_i_verified: 'ok', known_gaps: '', next_step_should_know: '' },
      },
      {
        id: 'step-9', order: 9, step_number: 9,
        title: '[GATE] Journey checkpoint 2', description: '',
        status: 'complete', dependencies: [5], kind: 'integration_gate',
        handoff: { journey_blocks_added: 2, what_i_built: 'gate 2', what_connects: 'tests', what_i_verified: 'ran', known_gaps: 'pricing broken', next_step_should_know: '' },
      },
    ];
    await writeStepsJson(bundleDir, createStepsFile(stepsRegression));

    const item: WorkItem = {
      id: 'my-goal',
      title: 'Postal checkout',
      source_path: bundleDir,
      priority: 'P2',
      status: 'in_progress',
      description: '',
      output_path: bundleDir,
      definition_of_done_journey: 'fill form → submit → confirmation',
    };

    const resultFail = await runIntegrationValidator(item, stepsRegression[1], 'contract-xyz');
    assert(resultFail.result === 'fail', `regression → fail (got ${resultFail.result})`);
    assert(
      !!resultFail.defect?.title?.toLowerCase().includes('regression'),
      `defect title mentions regression (got "${resultFail.defect?.title}")`,
    );
    assert(!!resultFail.defectSubtaskId, 'defect subtask id returned');

    const after = await readStepsJson(bundleDir);
    const parent = after!.steps.find(s => s.id === 'step-9');
    assert(parent?.blocked_on_subtask === true, 'parent gate is flagged blocked_on_subtask');
    const defectSub = after!.steps.find(s => s.parent_id === 'step-9');
    assert(defectSub !== undefined, 'defect subtask inserted under step-9');
    assert(defectSub?.blocks_parent === true, 'defect subtask has blocks_parent=true');

    // ── Case 2: missing journey_blocks_added on a gate ──────────────────
    console.log('\n[2] gate with no journey_blocks_added after a gate that had one → defect filed');
    const bundle2 = path.join(rootTmp, 'my-goal-2');
    mkdirSync(bundle2);
    const stepsMissing: WorkStep[] = [
      {
        id: 'step-5', order: 5, step_number: 5,
        title: '[GATE] Checkpoint 1', description: '',
        status: 'complete', dependencies: [], kind: 'integration_gate',
        handoff: { journey_blocks_added: 3, what_i_built: 'gate', what_connects: '', what_i_verified: '', known_gaps: '', next_step_should_know: '' },
      },
      {
        id: 'step-9', order: 9, step_number: 9,
        title: '[GATE] Checkpoint 2', description: '',
        status: 'complete', dependencies: [5], kind: 'integration_gate',
        handoff: { what_i_built: 'gate 2', what_connects: '', what_i_verified: '', known_gaps: '', next_step_should_know: '' },
      },
    ];
    await writeStepsJson(bundle2, createStepsFile(stepsMissing));
    const item2 = { ...item, source_path: bundle2, output_path: bundle2 };
    const resultMissing = await runIntegrationValidator(item2, stepsMissing[1], 'c2');
    assert(resultMissing.result === 'fail', 'missing journey_blocks_added → fail');
    assert(!!resultMissing.defectSubtaskId, 'defect subtask filed');

    // ── Case 3: no regression — first gate in bundle → cheap check returns null ──
    // (Depending on LLM availability, the LLM call may fail — the validator defaults to pass in that case,
    // which is the desired behavior when there's no deterministic signal.)
    console.log('\n[3] first gate in bundle with no prior → cheap check returns null (LLM may soft-pass)');
    const bundle3 = path.join(rootTmp, 'my-goal-3');
    mkdirSync(bundle3);
    const stepsFirstGate: WorkStep[] = [
      {
        id: 'step-5', order: 5, step_number: 5,
        title: '[GATE] First gate', description: '',
        status: 'complete', dependencies: [], kind: 'integration_gate',
        handoff: { journey_blocks_added: 1, what_i_built: 'just built', what_connects: 'tests', what_i_verified: 'ok', known_gaps: '', next_step_should_know: '' },
      },
    ];
    await writeStepsJson(bundle3, createStepsFile(stepsFirstGate));
    const item3 = { ...item, source_path: bundle3, output_path: bundle3 };
    const resultFirst = await runIntegrationValidator(item3, stepsFirstGate[0], 'c3');
    // Expect no deterministic defect — either pass (LLM succeeded) or pass (LLM error soft-pass).
    // The important thing is that the cheap check did NOT fire for a first-ever gate.
    assert(resultFirst.result === 'pass', `first gate does not trigger cheap defect (got ${resultFirst.result})`);

    // ── Case 4: non-gate step → cheap check is a no-op ──────────────────
    console.log('\n[4] non-gate step → cheap check returns null');
    const bundle4 = path.join(rootTmp, 'my-goal-4');
    mkdirSync(bundle4);
    const stepsNonGate: WorkStep[] = [
      {
        id: 'step-3', order: 3, step_number: 3,
        title: 'Build product grid', description: '',
        status: 'complete', dependencies: [], kind: 'build',
        handoff: { what_i_built: 'grid', what_connects: '', what_i_verified: '', known_gaps: '', next_step_should_know: '' },
      },
    ];
    await writeStepsJson(bundle4, createStepsFile(stepsNonGate));
    const item4 = { ...item, source_path: bundle4, output_path: bundle4 };
    const resultNonGate = await runIntegrationValidator(item4, stepsNonGate[0], 'c4');
    assert(resultNonGate.result === 'pass', `non-gate step does not deterministically fail (got ${resultNonGate.result})`);
  } finally {
    process.chdir(prevCwd);
    try { rmSync(rootTmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('');
  if (failures > 0) {
    console.error(`[H3] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[H3] all assertions passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
