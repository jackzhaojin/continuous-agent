/**
 * v2.4.2 J2 — Web + DB goals (e.g. expense-tracker-supabase, postal-checkout)
 * must still receive both [PREREQUISITE-0] and [PREREQUISITE-1] steps after the
 * v2.4.2 tightening. Regression guard for the v2.4 I2 backend-first fix.
 *
 * Run: npx tsx tests/adhoc/j2-web-with-db-still-gets-prereq.adhoc.ts
 */

import type { WorkItem, WorkStep } from '../../src/core/types.js';
import { insertPrerequisiteStep } from '../../src/agentic/work-selection/goal-breakdown.js';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

const buildSteps: WorkStep[] = [
  { step_number: 0, title: 'Build expense form UI', description: '', status: 'pending', dependencies: [] },
  { step_number: 1, title: 'Wire submit handler', description: '', status: 'pending', dependencies: [0] },
  { step_number: 2, title: 'Add dashboard page', description: '', status: 'pending', dependencies: [1] },
];

console.log('[J2] Web + DB goal still receives both prerequisite steps\n');

console.log('[1] expense-tracker-supabase style goal');
const webDbGoal: WorkItem = {
  id: 'expense-tracker',
  title: 'Build an expense tracker with React + Supabase dashboard',
  description: [
    'Users submit expenses via a React form.',
    'Persistence: Supabase postgres schema with an expenses table.',
    'Seed 5 realistic rows so the dashboard renders data on load.',
  ].join('\n'),
  priority: 'P2',
  status: 'pending',
  data_requirements: 'Cloud Supabase via .env.app. Dedicated schema expense_tracker_v1. Tables: expenses. Seed 5 rows.',
};

const result = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), webDbGoal);
assert(result.length === 5, `5 steps total (got ${result.length})`);
assert(/^\[PREREQUISITE-0\]/.test(result[0].title), 'step 0 is PREREQUISITE-0');
assert(/^\[PREREQUISITE-1\]/.test(result[1].title), 'step 1 is PREREQUISITE-1');
assert(JSON.stringify(result[1].dependencies) === '[0]', 'PREREQUISITE-1 depends on [0]');
assert(JSON.stringify(result[2].dependencies) === '[1]', 'first UI step depends on [1]');

console.log('\n[2] PREREQUISITE-0 description quotes persistence excerpt');
assert(/excerpt from PROMPT/i.test(result[0].description), 'PREREQUISITE-0 has excerpt section');
assert(/supabase/i.test(result[0].description), 'excerpt mentions supabase');
assert(/expense_tracker_v1|Supabase/i.test(result[0].description), 'data_requirements surfaced in description');

console.log('\n[3] PREREQUISITE-1 mentions curl + backend-testing skill');
assert(/curl/i.test(result[1].description), 'curl mentioned');
assert(/backend-testing/.test(result[1].description), 'backend-testing skill referenced');

console.log('\n[4] Postal-checkout regression guard');
const postalGoal: WorkItem = {
  id: 'postal-checkout',
  title: 'Build the b2b postal checkout wizard with supabase',
  description: 'Users fill a shipment form, we POST to /api/shipments which writes to postgres. React + Next.js dashboard.',
  priority: 'P2',
  status: 'pending',
  data_requirements: 'Supabase schema with shipments table and seed 5 rows',
};
const postalResult = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), postalGoal);
assert(postalResult.length === 5, 'postal-checkout still gets both prereqs');
assert(/^\[PREREQUISITE-0\]/.test(postalResult[0].title), 'postal PREREQUISITE-0 present');
assert(/^\[PREREQUISITE-1\]/.test(postalResult[1].title), 'postal PREREQUISITE-1 present');

if (failures > 0) {
  console.error(`\n[J2] ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\n[J2] all assertions passed');
