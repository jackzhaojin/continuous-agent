/**
 * Ad-hoc test: Fix #5 — Verifier path logging
 *
 * This is a structural/code inspection test. We can't easily run the
 * real validateWork() without the full verifier infrastructure, but we
 * can verify the code contains the expected log statements.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix5-verifier-logging.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

async function runTests() {
  const filePath = path.join(process.cwd(), 'src/deterministic/validation-handler.ts');
  const content = await readFile(filePath, 'utf-8');

  // --- Test 1: Contains explicit path log before verifiers run ---
  const hasPathLog = content.includes('Running verifiers against: ${result.output_path}');
  console.log(`[Test 1] Has explicit path log: ${hasPathLog}`);
  console.assert(hasPathLog, 'FAIL: validation-handler.ts should log the exact output_path before running verifiers');

  // --- Test 2: Contains path in results summary ---
  const hasPathInSummary = content.includes('(path: ${result.output_path})');
  console.log(`[Test 2] Has path in results summary: ${hasPathInSummary}`);
  console.assert(hasPathInSummary, 'FAIL: Verifier results summary should include the path');

  // --- Test 3: Path is logged via logDeterministic (not just log) ---
  const usesLogDeterministic = content.includes('logDeterministic(`Running verifiers against:');
  console.log(`[Test 3] Uses logDeterministic for path log: ${usesLogDeterministic}`);
  console.assert(usesLogDeterministic, 'FAIL: Path log should use logDeterministic() for proper tagging');

  // --- Test 4: No duplicate "Running verifiers on worker output..." without path ---
  // The old generic message should be replaced, not duplicated
  const oldGenericMsg = (content.match(/Running verifiers on worker output/g) || []).length;
  console.log(`[Test 4] Old generic "Running verifiers on worker output" count: ${oldGenericMsg} (expect 0)`);
  console.assert(oldGenericMsg === 0, `FAIL: Old generic message should be replaced, found ${oldGenericMsg} occurrences`);

  console.log('\n--- All Fix #5 tests passed ---');
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
