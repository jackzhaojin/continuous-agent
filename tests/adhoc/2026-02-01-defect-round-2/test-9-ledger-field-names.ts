/**
 * Ad-hoc test: Terminology Cleanup — Ledger field names
 *
 * Structural test: Verifies that execution-handler.ts and state-handler.ts
 * write goal_id/goal_title (not task_id/task_title) in JSONL entries.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-9-ledger-field-names.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();

async function readSrc(rel: string): Promise<string> {
  return readFile(path.join(ROOT, rel), 'utf-8');
}

async function runTests() {
  let failures = 0;

  // === execution-handler.ts ===
  const execHandler = await readSrc('src/agentic/execution/execution-handler.ts');

  // Check all JSON.stringify blocks use goal_id, not task_id
  const execJsonBlocks = execHandler.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) || [];
  for (const block of execJsonBlocks) {
    if (block.includes('task_id:')) {
      console.log('[FAIL] execution-handler.ts: Found task_id in JSON.stringify block');
      console.error(`  Block: ${block.slice(0, 200)}`);
      failures++;
    }
    if (block.includes('task_title:')) {
      console.log('[FAIL] execution-handler.ts: Found task_title in JSON.stringify block');
      console.error(`  Block: ${block.slice(0, 200)}`);
      failures++;
    }
  }
  // Positive check: goal_id should appear in JSON.stringify blocks
  const execHasGoalId = execJsonBlocks.some(b => b.includes('goal_id:'));
  console.log(`[${execHasGoalId ? 'PASS' : 'FAIL'}] execution-handler.ts: JSON entries use goal_id`);
  if (!execHasGoalId) failures++;

  // === state-handler.ts ===
  const stateHandler = await readSrc('src/deterministic/state-handler.ts');

  const stateJsonBlocks = stateHandler.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) || [];
  for (const block of stateJsonBlocks) {
    if (block.includes('task_id:')) {
      console.log('[FAIL] state-handler.ts: Found task_id in JSON.stringify block');
      console.error(`  Block: ${block.slice(0, 200)}`);
      failures++;
    }
    if (block.includes('task_title:')) {
      console.log('[FAIL] state-handler.ts: Found task_title in JSON.stringify block');
      console.error(`  Block: ${block.slice(0, 200)}`);
      failures++;
    }
  }
  const stateHasGoalId = stateJsonBlocks.some(b => b.includes('goal_id:'));
  console.log(`[${stateHasGoalId ? 'PASS' : 'FAIL'}] state-handler.ts: JSON entries use goal_id`);
  if (!stateHasGoalId) failures++;

  // === goal-breakdown.ts ===
  const goalBreakdown = await readSrc('src/agentic/work-selection/goal-breakdown.ts');

  const breakdownJsonBlocks = goalBreakdown.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) || [];
  for (const block of breakdownJsonBlocks) {
    if (block.includes('task_id:')) {
      console.log('[FAIL] goal-breakdown.ts: Found task_id in JSON.stringify block');
      failures++;
    }
    if (block.includes('task_title:')) {
      console.log('[FAIL] goal-breakdown.ts: Found task_title in JSON.stringify block');
      failures++;
    }
  }
  const breakdownHasGoalId = breakdownJsonBlocks.some(b => b.includes('goal_id:'));
  console.log(`[${breakdownHasGoalId ? 'PASS' : 'FAIL'}] goal-breakdown.ts: JSON entries use goal_id`);
  if (!breakdownHasGoalId) failures++;

  if (failures === 0) {
    console.log('\n--- All ledger field name tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
