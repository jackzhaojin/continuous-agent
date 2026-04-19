/**
 * v2.4.2 J3 — The rendered prereq description must quote the PROMPT's persistence
 * excerpt verbatim so the worker never sees a description that contradicts the
 * goal it was given.
 *
 * Run: npx tsx tests/adhoc/j3-prereq-description-quotes-prompt.adhoc.ts
 */

import type { WorkItem, WorkStep } from '../../src/core/types.js';
import { insertPrerequisiteStep, extractPersistenceExcerpt } from '../../src/agentic/work-selection/goal-breakdown.js';

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
  { step_number: 0, title: 'Build dashboard UI', description: '', status: 'pending', dependencies: [] },
];

console.log('[J3] Prereq description quotes PROMPT persistence excerpt\n');

console.log('[1] extractPersistenceExcerpt picks up persistence-flavored lines');
const exerciseItem: WorkItem = {
  id: 'exercise-log',
  title: 'Build an exercise-log app with Next.js + Postgres dashboard',
  description: [
    'Title: Exercise Log',
    '',
    'Persistence: cloud Postgres via Supabase, schema exercise_log_v1.',
    'Users record workouts and see aggregates.',
    'Storage is never localStorage — every write must round-trip through the API.',
    '',
    'Unrelated sentence about styling.',
  ].join('\n'),
  priority: 'P3',
  status: 'pending',
};
const excerpt = extractPersistenceExcerpt(exerciseItem);
assert(excerpt !== null, 'excerpt returned');
assert(/persistence|storage/i.test(excerpt || ''), 'excerpt mentions persistence or storage');
assert(!(excerpt || '').includes('Unrelated sentence'), 'unrelated sentence not included');

console.log('\n[2] Prereq description embeds the excerpt');
const result = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), exerciseItem);
assert(result.length === 3, `web + DB still inserts both prereqs (got ${result.length})`);
assert(/excerpt from PROMPT/i.test(result[0].description), 'excerpt header present in PREREQUISITE-0');
assert(/supabase/i.test(result[0].description), 'supabase mentioned in PREREQUISITE-0 excerpt');
assert(/excerpt from PROMPT/i.test(result[1].description), 'excerpt header present in PREREQUISITE-1');

console.log('\n[3] Falls back to data_requirements when description has no persistence hints');
const terseItem: WorkItem = {
  id: 'terse',
  title: 'Build a terse React dashboard with endpoints',
  description: 'Very brief body text. Users view charts.',
  priority: 'P3',
  status: 'pending',
  data_requirements: 'Supabase, schema terse_v1, seed one row',
};
const terseExcerpt = extractPersistenceExcerpt(terseItem);
assert(terseExcerpt !== null && /terse_v1|Supabase/i.test(terseExcerpt), 'falls back to data_requirements');

console.log('\n[4] Returns null when nothing available');
const bareItem: WorkItem = {
  id: 'bare',
  title: 'Bare React dashboard with endpoints',
  description: 'Nothing useful here.',
  priority: 'P3',
  status: 'pending',
};
assert(extractPersistenceExcerpt(bareItem) === null, 'no excerpt when neither description nor data_requirements helps');

if (failures > 0) {
  console.error(`\n[J3] ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\n[J3] all assertions passed');
