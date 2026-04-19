/**
 * H5 — Re-breakdown must preserve already-completed sub-steps.
 *
 * v2.1.6 retro: 5 re-breakdowns regenerated research+init sub-steps each
 * time even though the research had already completed successfully, costing
 * hours. v2.4 passes existing sub-steps to reBreakdownStep so it skips any
 * role (research / implement / validate) already covered by a `complete`
 * sub-step and only returns the roles that still need to be generated.
 *
 * Run: npx tsx tests/adhoc/h5-rebreakdown-preserves-completed.adhoc.ts
 */

import { reBreakdownStep } from '../../src/agentic/work-selection/goal-breakdown.js';
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

function main() {
  console.log('[H5] Re-breakdown preserves completed sub-steps\n');

  const parent: WorkStep = {
    step_number: 4,
    id: 'step-4',
    order: 4,
    title: 'Build the checkout flow',
    description: 'Legacy parent',
    status: 'in_progress',
    dependencies: [3],
    re_breakdown_count: 0,
  };

  // ── [1] First re-breakdown with no existing sub-steps: generate all 3 ──
  console.log('[1] First re-breakdown returns research+implement+validate');
  const initial = reBreakdownStep(parent, { turnsUsed: 85 }, []);
  assert(initial.length === 3, `3 sub-steps (got ${initial.length})`);
  assert(initial[0].title.startsWith('Research and plan'), 'first is research');
  assert(initial[1].title.startsWith('Implement core'), 'second is implement');
  assert(initial[2].title.startsWith('Complete and validate'), 'third is validate');
  assert(initial.every(s => s.re_breakdown_count === 1), 're_breakdown_count bumped to 1');

  // ── [2] Second re-breakdown after research complete: skip research ─────
  console.log('\n[2] Second re-breakdown preserves completed research');
  const priorSubSteps: WorkStep[] = [
    {
      step_number: 4,
      id: 'step-4a',
      order: 5,
      title: 'Research and plan: Build the checkout flow',
      description: '',
      status: 'complete',
      dependencies: [3],
      parent_id: 'step-4',
    },
    {
      step_number: 4,
      id: 'step-4b',
      order: 6,
      title: 'Implement core: Build the checkout flow',
      description: '',
      status: 'failed' as unknown as WorkStep['status'],
      dependencies: [4],
      parent_id: 'step-4',
    },
    {
      step_number: 4,
      id: 'step-4c',
      order: 7,
      title: 'Complete and validate: Build the checkout flow',
      description: '',
      status: 'pending',
      dependencies: [4],
      parent_id: 'step-4',
    },
  ];
  const parentAfterFirst: WorkStep = { ...parent, re_breakdown_count: 1 };
  const second = reBreakdownStep(parentAfterFirst, { turnsUsed: 90 }, priorSubSteps);
  assert(second.length === 2, `2 sub-steps returned (got ${second.length})`);
  assert(!second.some(s => s.title.startsWith('Research')), 'research skipped');
  assert(second[0].title.startsWith('Implement core'), 'implement regenerated');
  assert(second[1].title.startsWith('Complete and validate'), 'validate regenerated');
  assert(second.every(s => s.re_breakdown_count === 2), 're_breakdown_count bumped to 2');

  // ── [3] All three complete: returns empty list, caller marks parent done ──
  console.log('\n[3] All completed sub-steps → empty result');
  const allComplete: WorkStep[] = priorSubSteps.map(s => ({ ...s, status: 'complete' }));
  const third = reBreakdownStep(parentAfterFirst, { turnsUsed: 50 }, allComplete);
  assert(third.length === 0, 'nothing to regenerate when all roles are complete');

  // ── [4] MAX_RE_BREAKDOWN_COUNT cap still enforced ─────────────────────
  console.log('\n[4] Exceeding MAX_RE_BREAKDOWN_COUNT returns empty');
  const maxed: WorkStep = { ...parent, re_breakdown_count: 2 };
  const fourth = reBreakdownStep(maxed, { turnsUsed: 90 }, []);
  assert(fourth.length === 0, 'no sub-steps at re_breakdown_count=2');

  console.log('');
  if (failures > 0) {
    console.error(`[H5] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[H5] all assertions passed');
  }
}

main();
