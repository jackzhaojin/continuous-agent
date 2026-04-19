/**
 * v2.4.2 J4 — tags:[no-ui] and tags:[no-database] must hard-suppress prereq
 * insertion even when the goal body contains ambiguous keywords like `api` or
 * `endpoint`. Also verifies that a web + localStorage-only goal (Recipe Book
 * style) does not receive a DB prereq.
 *
 * Run: npx tsx tests/adhoc/j4-no-ui-tag-suppresses-prereq.adhoc.ts
 */

import type { WorkItem, WorkStep } from '../../src/core/types.js';
import {
  insertPrerequisiteStep,
  declaresNoDatabase,
  declaresNoUi,
} from '../../src/agentic/work-selection/goal-breakdown.js';

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
  { step_number: 0, title: 'Scaffold app', description: '', status: 'pending', dependencies: [] },
  { step_number: 1, title: 'Implement core feature', description: '', status: 'pending', dependencies: [0] },
];

console.log('[J4] no-ui / no-database tag suppressors + localStorage-only web goal\n');

console.log('[1] tags:[no-ui, no-database] on an API goal');
const apiGoal: WorkItem = {
  id: 'api-only',
  title: 'Build task-scheduler-api REST service with endpoints',
  description: 'Backend-only. Pure API. No persistence layer.',
  priority: 'P2',
  status: 'pending',
  tags: ['backend', 'no-ui', 'no-database'],
};
assert(declaresNoUi(apiGoal), 'declaresNoUi detects tag');
assert(declaresNoDatabase(apiGoal), 'declaresNoDatabase detects tag');
const r1 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), apiGoal);
assert(r1.length === 2, 'no prereq inserted for no-ui + no-database goal');

console.log('\n[2] Recipe Book — web goal with localStorage-only persistence');
const recipeGoal: WorkItem = {
  id: 'recipe-book',
  title: 'Build a Recipe Book React UI with dashboard',
  description: [
    'A simple recipe book app. React + Next.js frontend.',
    'Persistence: localStorage only — no backend database.',
    'Users save recipes locally and export to JSON.',
  ].join('\n'),
  priority: 'P3',
  status: 'pending',
};
assert(declaresNoDatabase(recipeGoal), 'Recipe Book declaresNoDatabase via body');
const r2 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), recipeGoal);
assert(r2.length === 2, 'localStorage-only web goal gets 0 prereqs');
assert(!r2.some(s => /PREREQUISITE/.test(s.title)), 'no PREREQUISITE-* present');

console.log('\n[3] Control: regular web + DB goal still gets prereqs');
const webDb: WorkItem = {
  id: 'control',
  title: 'Build a blog React dashboard backed by Postgres',
  description: 'Posts persisted to Postgres. Users browse, create, edit.',
  priority: 'P3',
  status: 'pending',
  data_requirements: 'Supabase postgres, schema blog_v1, seed 3 posts',
};
assert(!declaresNoDatabase(webDb), 'control goal does NOT declare no-database');
assert(!declaresNoUi(webDb), 'control goal does NOT declare no-ui');
const r3 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), webDb);
assert(r3.length === 4, `control gets 2 prereqs prepended (got ${r3.length} steps)`);
assert(/^\[PREREQUISITE-0\]/.test(r3[0].title), 'control PREREQUISITE-0 present');

console.log('\n[4] data_requirements: "none — ..." is equivalent to the tag');
const drNone: WorkItem = {
  id: 'dr-none',
  title: 'Internal scheduler React dashboard',
  description: 'Internal tool.',
  priority: 'P3',
  status: 'pending',
  data_requirements: 'none — in-memory only for this prototype',
};
assert(declaresNoDatabase(drNone), 'data_requirements "none — ..." counts as no-database');
const r4 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), drNone);
assert(r4.length === 2, 'dr:"none — ..." suppresses prereqs');

if (failures > 0) {
  console.error(`\n[J4] ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\n[J4] all assertions passed');
