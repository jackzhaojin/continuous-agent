/**
 * A5 — Playwright / web-testing skill inclusion must be gated by step type.
 * Backend-only steps skip web-testing and get backend-testing instead.
 *
 * Run: npx tsx tests/adhoc/a5-playwright-policy.adhoc.ts
 */

import { isBackendOnlyStepTitle } from '../../src/agentic/intelligence/prompt-builder.js';

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
  console.log('[A5] Playwright policy tests\n');

  console.log('[1] Backend-only titles classified correctly');
  assert(isBackendOnlyStepTitle('[PREREQUISITE-0] Database schema + seed data'), 'PREREQUISITE-0');
  assert(isBackendOnlyStepTitle('[PREREQUISITE-1] API endpoints + curl smoke tests'), 'PREREQUISITE-1');
  assert(isBackendOnlyStepTitle('Build the REST API for quote creation'), 'REST API title');
  assert(isBackendOnlyStepTitle('Implement server-side rate limiter'), 'server-side title');
  assert(isBackendOnlyStepTitle('Create supabase schema'), 'supabase schema');
  assert(isBackendOnlyStepTitle('Write database migration'), 'migration');
  assert(isBackendOnlyStepTitle('Add /api/health endpoint'), 'health endpoint');

  console.log('\n[2] UI-ish titles fall through to default (web-testing stays)');
  assert(!isBackendOnlyStepTitle('Build shipment form UI'), 'form UI');
  assert(!isBackendOnlyStepTitle('Add confirmation page'), 'confirmation page');
  assert(!isBackendOnlyStepTitle('Style the dashboard'), 'dashboard');
  assert(!isBackendOnlyStepTitle('Wire supabase schema to the checkout form'), 'schema + form is not backend-only');
  assert(!isBackendOnlyStepTitle('[GATE] Journey checkpoint'), 'gate is not backend-only');

  console.log('\n[3] Ambiguous title: default is to include web-testing');
  assert(!isBackendOnlyStepTitle('Research the auth approach'), 'research is not backend-only');
  assert(!isBackendOnlyStepTitle('Add feature flag for new checkout'), 'feature flag is not backend-only');

  console.log('');
  if (failures > 0) {
    console.error(`[A5] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[A5] all assertions passed');
  }
}

main();
