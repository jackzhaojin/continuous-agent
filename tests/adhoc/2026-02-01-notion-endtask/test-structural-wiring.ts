/**
 * Structural test: Verify closeMilestone is wired into all terminal paths.
 *
 * Checks:
 * 1. closeMilestone is exported from notion-reporter.ts
 * 2. closeMilestone is imported in state-handler.ts
 * 3. closeMilestone is called in all 5 terminal paths (success, failure, blocked, step success, step failure)
 * 4. markTaskBlocked accepts contractId parameter
 * 5. executive-loop.ts passes contractId to markTaskBlocked at both call sites
 *
 * Run: npx tsx tests/adhoc/2026-02-01-notion-endtask/test-structural-wiring.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function runTests() {
  const notionReporter = await readFile(
    path.join(process.cwd(), 'src/deterministic/notion-reporter.ts'),
    'utf-8'
  );
  const stateHandler = await readFile(
    path.join(process.cwd(), 'src/deterministic/state-handler.ts'),
    'utf-8'
  );
  const executiveLoop = await readFile(
    path.join(process.cwd(), 'src/core/executive-loop.ts'),
    'utf-8'
  );

  // === 1. closeMilestone function exists and is exported ===
  console.log('\n1. notion-reporter.ts — closeMilestone export');
  assert(
    notionReporter.includes('export async function closeMilestone('),
    'closeMilestone is exported'
  );
  assert(
    notionReporter.includes('contractId: string'),
    'closeMilestone takes contractId param'
  );
  assert(
    notionReporter.includes('databases/') && notionReporter.includes('/query'),
    'closeMilestone queries via databases REST endpoint'
  );
  assert(
    notionReporter.includes("equals: 'Started'"),
    'closeMilestone filters for Started event'
  );
  assert(
    notionReporter.includes('pages.update('),
    'closeMilestone updates the page via SDK'
  );
  assert(
    notionReporter.includes('Duration'),
    'closeMilestone sets Duration property'
  );

  // === 2. state-handler.ts — import ===
  console.log('\n2. state-handler.ts — closeMilestone import');
  assert(
    stateHandler.includes("closeMilestone") &&
      stateHandler.includes("from './notion-reporter.js'"),
    'closeMilestone is imported from notion-reporter'
  );

  // === 3. state-handler.ts — 5 terminal call sites ===
  console.log('\n3. state-handler.ts — closeMilestone call sites');

  // Find updateTaskState function
  const updateTaskStart = stateHandler.indexOf('export async function updateTaskState(');
  const updateTaskEnd = stateHandler.indexOf('\nexport ', updateTaskStart + 1);
  const updateTaskBody = stateHandler.slice(updateTaskStart, updateTaskEnd);

  // 3a: After reportMilestone('Completed', ...)
  const completedIdx = updateTaskBody.indexOf("reportMilestone('Completed'");
  const closeAfterCompleted = updateTaskBody.indexOf('closeMilestone(', completedIdx);
  const nextSectionAfterCompleted = updateTaskBody.indexOf('// V1.2: Record project memory', completedIdx);
  assert(
    closeAfterCompleted > completedIdx && closeAfterCompleted < nextSectionAfterCompleted,
    'closeMilestone called after reportMilestone(Completed) in updateTaskState'
  );

  // 3b: After reportMilestone('Failed', ...) in updateTaskState
  const failedIdx = updateTaskBody.indexOf("reportMilestone('Failed'");
  const closeAfterFailed = updateTaskBody.indexOf('closeMilestone(', failedIdx);
  assert(
    closeAfterFailed > failedIdx,
    'closeMilestone called after reportMilestone(Failed) in updateTaskState'
  );

  // 3c: markTaskBlocked
  const markBlockedStart = stateHandler.indexOf('export async function markTaskBlocked(');
  const markBlockedEnd = stateHandler.indexOf('\nexport ', markBlockedStart + 1);
  const markBlockedBody = stateHandler.slice(markBlockedStart, markBlockedEnd);

  assert(
    markBlockedBody.includes('closeMilestone('),
    'closeMilestone called in markTaskBlocked'
  );

  // 3d: updateStepState success path
  const updateStepStart = stateHandler.indexOf('export async function updateStepState(');
  const updateStepEnd = stateHandler.indexOf('\nexport ', updateStepStart + 1);
  const updateStepBody = stateHandler.slice(updateStepStart, updateStepEnd);

  const stepCompletedIdx = updateStepBody.indexOf("'Step Completed'");
  const closeAfterStepCompleted = updateStepBody.indexOf('closeMilestone(', stepCompletedIdx);
  assert(
    closeAfterStepCompleted > stepCompletedIdx,
    'closeMilestone called after reportMilestone(Step Completed) in updateStepState'
  );

  // 3e: updateStepState failure path
  const stepElse = updateStepBody.slice(updateStepBody.indexOf('} else {'));
  const stepFailedMilestone = stepElse.indexOf("reportMilestone('Failed'");
  const closeAfterStepFailed = stepElse.indexOf('closeMilestone(', stepFailedMilestone);
  assert(
    closeAfterStepFailed > stepFailedMilestone,
    'closeMilestone called after reportMilestone(Failed) in updateStepState failure path'
  );

  // === 4. markTaskBlocked signature ===
  console.log('\n4. state-handler.ts — markTaskBlocked signature');
  assert(
    markBlockedBody.includes('contractId?: string'),
    'markTaskBlocked accepts optional contractId parameter'
  );
  assert(
    markBlockedBody.includes("reportMilestone('Blocked', item, contractId)"),
    'markTaskBlocked passes contractId to reportMilestone'
  );

  // === 5. executive-loop.ts — passes contractId ===
  console.log('\n5. executive-loop.ts — markTaskBlocked call sites');

  // Count occurrences of markTaskBlocked with contractId
  const markBlockedCalls = executiveLoop.match(/markTaskBlocked\(workItem,\s*contractId\)/g);
  assert(
    markBlockedCalls !== null && markBlockedCalls.length === 2,
    `markTaskBlocked(workItem, contractId) called exactly 2 times (found: ${markBlockedCalls?.length || 0})`
  );

  // Verify no bare markTaskBlocked(workItem) calls remain (without contractId)
  const bareMarkBlocked = executiveLoop.match(/markTaskBlocked\(workItem\)(?!\s*,)/g);
  assert(
    bareMarkBlocked === null,
    `No bare markTaskBlocked(workItem) calls without contractId (found: ${bareMarkBlocked?.length || 0})`
  );

  // === 6. Guard pattern ===
  console.log('\n6. state-handler.ts — Guard pattern');

  // Count "if (contractId)" guards around closeMilestone calls
  const guardedCalls = stateHandler.match(/if \(contractId\) \{\s*\n\s*await closeMilestone\(contractId\)/g);
  assert(
    guardedCalls !== null && guardedCalls.length >= 4,
    `closeMilestone guarded by if(contractId) in at least 4 places (found: ${guardedCalls?.length || 0})`
  );

  // === Summary ===
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    console.error('STRUCTURAL TESTS FAILED');
    process.exit(1);
  }
  console.log('ALL STRUCTURAL TESTS PASSED');
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
