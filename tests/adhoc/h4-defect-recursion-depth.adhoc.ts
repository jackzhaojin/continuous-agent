/**
 * H4 — Defect recursion depth cap.
 *
 * v2.1.6 retro: validator filed defects about defects about defects to
 * depth step-1.1.2.1.1.1.1.1 (8 levels deep) over 30 attempts. v2.4 adds
 * MAX_DEFECT_RECURSION_DEPTH (default 2); beyond the cap the executive
 * appends to needs-you.md instead of filing a deeper subtask.
 *
 * This test:
 *   1. Files depth-1 defect under an original step — succeeds.
 *   2. Files depth-2 defect under the depth-1 subtask — succeeds.
 *   3. Files depth-3 defect under the depth-2 subtask — SKIPPED, escalates
 *      to needs-you.md, no new subtask created.
 *
 * Run: npx tsx tests/adhoc/h4-defect-recursion-depth.adhoc.ts
 */

import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  createStepsFile,
  writeStepsJson,
  readStepsJson,
  insertDefectSubtask,
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
  // Set up a throwaway cwd so workspace/needs-you.md lives somewhere isolated.
  const rootTmp = mkdtempSync(path.join(tmpdir(), 'h4-defect-root-'));
  mkdirSync(path.join(rootTmp, 'workspace'));
  writeFileSync(path.join(rootTmp, 'workspace', 'needs-you.md'), '# needs-you.md\n');
  const prevCwd = process.cwd();
  process.chdir(rootTmp);

  try {
    const bundleDir = path.join(rootTmp, 'my-goal');
    mkdirSync(bundleDir);

    // Seed a single original step
    const steps: WorkStep[] = [
      { step_number: 5, order: 5, id: 'step-5', title: 'Build checkout', description: '', status: 'complete', dependencies: [] },
    ];
    await writeStepsJson(bundleDir, createStepsFile(steps));

    console.log('[H4] Defect recursion depth cap tests\n');

    // ── Depth 1: first defect filed under the original step ─────────────
    console.log('[1] Depth-1 defect filed successfully');
    const d1 = await insertDefectSubtask(bundleDir, 'step-5', {
      title: 'Payment integration broken',
      root_cause: 'API rejects body shape',
      evidence: 'curl -X POST /api/pay returns 400',
    });
    assert(d1 === 'step-5.1', `depth-1 id is step-5.1 (got ${d1})`);

    const after1 = await readStepsJson(bundleDir);
    const sub1 = after1!.steps.find(s => s.id === 'step-5.1');
    assert(sub1?.defect_evidence?.depth_reached === 1, 'depth_reached=1');

    // ── Depth 2: defect filed under step-5.1 ────────────────────────────
    console.log('\n[2] Depth-2 defect filed successfully');
    const d2 = await insertDefectSubtask(bundleDir, 'step-5.1', {
      title: 'API validation regex too strict',
      root_cause: 'Amount parsed as string',
    });
    assert(d2 === 'step-5.1.1', `depth-2 id is step-5.1.1 (got ${d2})`);
    const after2 = await readStepsJson(bundleDir);
    const sub2 = after2!.steps.find(s => s.id === 'step-5.1.1');
    assert(sub2?.defect_evidence?.depth_reached === 2, 'depth_reached=2');

    // ── Depth 3: SHOULD ESCALATE, NOT FILE ──────────────────────────────
    console.log('\n[3] Depth-3 defect is rejected and escalated to needs-you.md');
    const sizeBefore = readFileSync(path.join(rootTmp, 'workspace', 'needs-you.md'), 'utf-8').length;
    const d3 = await insertDefectSubtask(bundleDir, 'step-5.1.1', {
      title: 'Type coercion defect',
      root_cause: 'Number(x) returns NaN for empty string',
    });
    assert(d3 === null, `depth-3 returns null (got ${d3})`);

    const after3 = await readStepsJson(bundleDir);
    const depth3Sub = after3!.steps.find(s => s.parent_id === 'step-5.1.1');
    assert(depth3Sub === undefined, 'no step-5.1.1.1 was created');

    const needsYouAfter = readFileSync(path.join(rootTmp, 'workspace', 'needs-you.md'), 'utf-8');
    assert(needsYouAfter.length > sizeBefore, 'needs-you.md appended to');
    assert(needsYouAfter.includes('[DEFECT ESCALATION]'), 'escalation marker present');
    assert(needsYouAfter.includes('Type coercion defect'), 'defect title present');
    assert(needsYouAfter.includes('Depth reached:** 3'), 'depth line present');

    // ── Depth override via env ──────────────────────────────────────────
    console.log('\n[4] MAX_DEFECT_RECURSION_DEPTH=4 allows depth-3 filing');
    process.env.MAX_DEFECT_RECURSION_DEPTH = '4';
    const d3b = await insertDefectSubtask(bundleDir, 'step-5.1.1', {
      title: 'Deeper defect with raised cap',
    });
    assert(d3b === 'step-5.1.1.1', `with cap=4 depth-3 files (got ${d3b})`);
    delete process.env.MAX_DEFECT_RECURSION_DEPTH;
  } finally {
    process.chdir(prevCwd);
    try { rmSync(rootTmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('');
  if (failures > 0) {
    console.error(`[H4] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[H4] all assertions passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
