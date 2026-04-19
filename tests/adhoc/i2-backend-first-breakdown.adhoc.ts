/**
 * I2 — Fullstack breakdown must insert TWO prerequisite steps before UI work:
 *   0. schema + seed
 *   1. API endpoints + curl smoke
 *
 * Run: npx tsx tests/adhoc/i2-backend-first-breakdown.adhoc.ts
 */

import type { WorkItem, WorkStep } from '../../src/core/types.js';

// Import the (intentionally internal) insertPrerequisiteStep via a focused
// wrapper. The function isn't re-exported on purpose — so we test the
// end-to-end `decomposeGoal` path when possible, but for this unit check
// we dynamically import and reach through the module's internals.
async function getInserter(): Promise<(steps: WorkStep[], item: WorkItem) => WorkStep[]> {
  const mod = await import('../../src/agentic/work-selection/goal-breakdown.ts');
  // insertPrerequisiteStep is not exported; exercise it via the exposed
  // fallback path `generateFallbackSteps` + `insertPrerequisiteStep` composition
  // by calling any exported function that runs the full pipeline. Since the
  // easiest verifiable path is reBreakdownStep / the full decomposeGoal, we
  // rely on an indirect check: build a bunch of synthetic steps and call
  // the pipeline. BUT: insertPrerequisiteStep runs inside the fallback path
  // only on the full breakdown entry point. For this test we re-implement
  // the exact inclusion criteria (WEB + backend) and simulate the call by
  // invoking the module's unexported helpers via eval on the compiled path.
  //
  // Simpler: re-export insertPrerequisiteStep for testing. We do that by
  // importing the raw TS and using the build's export list check.
  type ModWithInsert = typeof mod & {
    insertPrerequisiteStep?: (s: WorkStep[], i: WorkItem) => WorkStep[];
  };
  const typed = mod as ModWithInsert;
  if (typeof typed.insertPrerequisiteStep === 'function') {
    return typed.insertPrerequisiteStep;
  }
  throw new Error('insertPrerequisiteStep is not exported — see test note');
}

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
  console.log('[I2] Backend-first breakdown tests\n');

  const inserter = await getInserter();

  const fullstackItem: WorkItem = {
    id: 'postal-checkout',
    title: 'Build the b2b postal checkout page with supabase',
    description: 'Users fill a shipment form, we POST to /api/shipments which writes to postgres',
    priority: 'P2',
    status: 'pending',
    data_requirements: 'Supabase schema with shipments table and seed 5 rows',
  };

  const buildSteps: WorkStep[] = [
    { step_number: 0, title: 'Build shipment form UI', description: '', status: 'pending', dependencies: [] },
    { step_number: 1, title: 'Wire submit handler', description: '', status: 'pending', dependencies: [0] },
    { step_number: 2, title: 'Add confirmation page', description: '', status: 'pending', dependencies: [1] },
  ];

  console.log('[1] Fullstack goal inserts both prerequisites');
  const result = inserter(buildSteps.slice().map(s => ({ ...s })), fullstackItem);
  assert(result.length === 5, `5 steps total (got ${result.length})`);
  assert(/^\[PREREQUISITE-0\]/.test(result[0].title), `step 0 is PREREQUISITE-0 (got ${result[0].title})`);
  assert(/^\[PREREQUISITE-1\]/.test(result[1].title), `step 1 is PREREQUISITE-1 (got ${result[1].title})`);
  assert(result[0].dependencies?.length === 0, 'PREREQUISITE-0 has no deps');
  assert(JSON.stringify(result[1].dependencies) === '[0]', 'PREREQUISITE-1 depends on [0]');
  assert(JSON.stringify(result[2].dependencies) === '[1]', 'first UI step depends on [1]');

  console.log('\n[2] PREREQUISITE-1 description references curl + backend-testing skill');
  assert(/curl/i.test(result[1].description), 'curl mentioned');
  assert(/backend-testing/.test(result[1].description), 'backend-testing skill referenced');

  console.log('\n[3] Non-web goal is untouched');
  const cliItem: WorkItem = {
    id: 'cli',
    title: 'Build a CLI tool that parses CSV files',
    description: '',
    priority: 'P3',
    status: 'pending',
  };
  const cliResult = inserter(buildSteps.slice().map(s => ({ ...s })), cliItem);
  assert(cliResult.length === 3, 'non-web goal untouched');
  assert(!/PREREQUISITE/.test(cliResult[0].title), 'no prerequisite inserted');

  console.log('\n[4] Web goal without backend keyword is untouched');
  const staticSite: WorkItem = {
    id: 'static',
    title: 'Build a marketing landing page in React',
    description: 'Just a hero + pricing + contact',
    priority: 'P3',
    status: 'pending',
  };
  const staticResult = inserter(buildSteps.slice().map(s => ({ ...s })), staticSite);
  assert(staticResult.length === 3, 'static site goal untouched');
  assert(!/PREREQUISITE/.test(staticResult[0].title), 'no prerequisite inserted');

  console.log('\n[5] First step already looks like schema setup → no insertion');
  const alreadySetup: WorkStep[] = [
    { step_number: 0, title: 'Set up Supabase schema and seed data', description: '', status: 'pending', dependencies: [] },
    ...buildSteps.slice(1).map(s => ({ ...s })),
  ];
  const alreadyResult = inserter(alreadySetup, fullstackItem);
  assert(alreadyResult.length === 3, 'no insertion when schema already present');

  console.log('');
  if (failures > 0) {
    console.error(`[I2] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I2] all assertions passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
