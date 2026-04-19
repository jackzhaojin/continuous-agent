/**
 * I3 — Journey with API round-trip requirement must be flagged when
 * worker handoffs don't reference the declared endpoints or persistence.
 *
 * Run: npx tsx tests/adhoc/i3-journey-api-verification.adhoc.ts
 */

import {
  extractApiPathsFromJourney,
  journeyDescribesPersistence,
} from '../../src/agentic/execution/integration-validator-runner.ts';

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
  console.log('[I3] Journey API verification helpers\n');

  console.log('[1] extractApiPathsFromJourney');
  const j1 = 'Fill shipment form → POST /api/shipments → loads /api/rates → select → payment → confirm';
  const paths = extractApiPathsFromJourney(j1);
  assert(paths.includes('/api/shipments'), '/api/shipments extracted');
  assert(paths.includes('/api/rates'), '/api/rates extracted');
  assert(paths.length === 2, `exactly 2 paths (got ${paths.length})`);
  assert(extractApiPathsFromJourney('no api in this text').length === 0, 'no paths in non-API journey');
  assert(extractApiPathsFromJourney(undefined).length === 0, 'undefined journey → empty array');

  console.log('\n[2] journeyDescribesPersistence');
  assert(journeyDescribesPersistence('Form submits and persists to supabase'), 'persists → true');
  assert(journeyDescribesPersistence('Data saved to DB and re-read on confirmation'), 'saved to + re-read → true');
  assert(journeyDescribesPersistence('Full round-trip to postgres'), 'round-trip + postgres → true');
  assert(!journeyDescribesPersistence('Just a marketing landing page with a hero'), 'marketing → false');
  assert(!journeyDescribesPersistence(undefined), 'undefined → false');

  console.log('\n[3] Deduplication');
  const dup = extractApiPathsFromJourney('POST /api/x then GET /api/x again then /api/y');
  assert(dup.length === 2, `dedup to 2 paths (got ${dup.length}: ${dup.join(', ')})`);

  console.log('');
  if (failures > 0) {
    console.error(`[I3] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I3] all assertions passed');
  }
}

main();
