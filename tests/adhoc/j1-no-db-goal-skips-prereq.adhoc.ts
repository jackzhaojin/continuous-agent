/**
 * v2.4.2 J1 — Backend-only no-DB goal must NOT receive any [PREREQUISITE-*] steps.
 *
 * Live evidence: `workspace/in-progress/P2/task-scheduler-api/PROMPT.md` explicitly
 * declared "No UI, no database, no auth" yet the 2026-04-18 breakdown prepended
 * Supabase schema + API prereq steps that drove the worker to provision cloud tables.
 *
 * Run: npx tsx tests/adhoc/j1-no-db-goal-skips-prereq.adhoc.ts
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
  { step_number: 0, title: 'Scaffold Express server', description: '', status: 'pending', dependencies: [] },
  { step_number: 1, title: 'Implement /tasks endpoints', description: '', status: 'pending', dependencies: [0] },
  { step_number: 2, title: 'Wire JSON snapshot persistence', description: '', status: 'pending', dependencies: [1] },
];

console.log('[J1] Backend-only no-DB goal skips prereq\n');

console.log('[1] Body-text suppression — "no database" / "in-memory" / "JSON file"');
const apiGoal: WorkItem = {
  id: 'task-scheduler-api',
  title: 'Build task-scheduler-api (Node.js/Express REST API)',
  description: [
    'Backend-only task scheduler REST API.',
    'No UI, no database, no auth. State is held in-process with periodic snapshot',
    'to a JSON file under `data/state.json` so a restart resumes cleanly.',
    '- Persistence: in-memory + periodic JSON snapshot (every 5s, debounced) to data/state.json',
  ].join('\n'),
  priority: 'P2',
  status: 'pending',
  tags: ['kimi-test', 'backend', 'nodejs', 'api', 'no-ui', 'v2.3-worktree-test'],
};

const result = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), apiGoal);
assert(result.length === 3, `3 steps unchanged (got ${result.length})`);
assert(!result.some(s => /PREREQUISITE-/.test(s.title)), 'no PREREQUISITE-* steps inserted');
assert(result[0].title === buildSteps[0].title, 'original first step preserved');

console.log('\n[2] Tag-based suppression — tags:[no-database]');
const taggedGoal: WorkItem = {
  id: 'kv-cache',
  title: 'Build a simple key-value cache service with HTTP API and endpoints',
  description: 'Expose GET/PUT/DELETE endpoints. Backend service.',
  priority: 'P3',
  status: 'pending',
  tags: ['backend', 'no-database'],
};
const r2 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), taggedGoal);
assert(r2.length === 3, 'tag-based no-database suppresses prereq');
assert(!r2.some(s => /PREREQUISITE/.test(s.title)), 'no PREREQUISITE-* steps');

console.log('\n[3] data_requirements: "none — in-memory ..." suppresses prereq');
const drNoneGoal: WorkItem = {
  id: 'cron-api',
  title: 'Tiny cron registry API service with endpoints',
  description: 'Simple scheduler. No frontend.',
  priority: 'P3',
  status: 'pending',
  data_requirements: 'none — in-memory + JSON file snapshot at data/state.json',
};
const r3 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), drNoneGoal);
assert(r3.length === 3, 'data_requirements: "none — ..." suppresses prereq');

console.log('\n[4] tags:[no-ui] without data requirement — no prereq');
const noUiGoal: WorkItem = {
  id: 'parse-cli',
  title: 'CSV parse & compact API service with endpoints',
  description: 'Backend service that ingests CSVs.',
  priority: 'P3',
  status: 'pending',
  tags: ['no-ui'],
};
const r4 = insertPrerequisiteStep(buildSteps.map(s => ({ ...s })), noUiGoal);
assert(r4.length === 3, 'no-ui without data_requirements → no prereq');

if (failures > 0) {
  console.error(`\n[J1] ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\n[J1] all assertions passed');
