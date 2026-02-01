/**
 * Ad-hoc test: Terminology Cleanup — Contract ID prefix
 *
 * Verifies that contract IDs use `contract-` prefix (not `task-`)
 * in execution-handler.ts, executive-loop.ts, and worker-spawner.ts.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-4-contract-id-prefix.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();

async function readSrc(rel: string): Promise<string> {
  return readFile(path.join(ROOT, rel), 'utf-8');
}

async function runTests() {
  let failures = 0;

  // --- Test 1: execution-handler.ts uses contract- prefix ---
  const execHandler = await readSrc('src/agentic/execution/execution-handler.ts');
  const hasContractPrefix = execHandler.includes('`contract-${Date.now()}`');
  const hasTaskPrefix = execHandler.includes('`task-${Date.now()}`');
  console.log(`[${hasContractPrefix ? 'PASS' : 'FAIL'}] execution-handler.ts: uses contract- prefix`);
  console.log(`[${!hasTaskPrefix ? 'PASS' : 'FAIL'}] execution-handler.ts: no task- prefix`);
  if (!hasContractPrefix) failures++;
  if (hasTaskPrefix) failures++;

  // --- Test 2: executive-loop.ts uses contract- prefix ---
  const execLoop = await readSrc('src/core/executive-loop.ts');
  const loopHasContract = execLoop.includes('`contract-${Date.now()}`');
  const loopHasTask = execLoop.includes('`task-${Date.now()}`');
  console.log(`[${loopHasContract ? 'PASS' : 'FAIL'}] executive-loop.ts: uses contract- prefix`);
  console.log(`[${!loopHasTask ? 'PASS' : 'FAIL'}] executive-loop.ts: no task- prefix`);
  if (!loopHasContract) failures++;
  if (loopHasTask) failures++;

  // --- Test 3: worker-spawner.ts uses contract- in log filenames ---
  const spawner = await readSrc('src/agentic/execution/worker-spawner.ts');
  const spawnerHasContractReplace = spawner.includes("replace('contract-', '')");
  const spawnerHasTaskReplace = spawner.includes("replace('task-', '')");
  console.log(`[${spawnerHasContractReplace ? 'PASS' : 'FAIL'}] worker-spawner.ts: replace('contract-', '')`);
  console.log(`[${!spawnerHasTaskReplace ? 'PASS' : 'FAIL'}] worker-spawner.ts: no replace('task-', '')`);
  if (!spawnerHasContractReplace) failures++;
  if (spawnerHasTaskReplace) failures++;

  // --- Summary ---
  if (failures === 0) {
    console.log('\n--- All contract ID prefix tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
