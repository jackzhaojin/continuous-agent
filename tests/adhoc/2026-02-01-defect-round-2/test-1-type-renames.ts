/**
 * Ad-hoc test: Terminology Cleanup — Type renames in types.ts
 *
 * Verifies that old type names (TaskStep, TasksFile, TaskContract, current_task)
 * are fully removed and new names (WorkStep, StepsFile, WorkerContract, current_contract)
 * exist in src/core/types.ts.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-1-type-renames.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

async function runTests() {
  const typesPath = path.join(process.cwd(), 'src/core/types.ts');
  const content = await readFile(typesPath, 'utf-8');

  let failures = 0;

  // --- Test 1: Old types must NOT exist ---
  const deadTypes = ['TaskStep', 'TasksFile', 'TaskContract'];
  for (const t of deadTypes) {
    const regex = new RegExp(`export\\s+interface\\s+${t}\\b`);
    const found = regex.test(content);
    console.log(`[Test 1] interface ${t} removed: ${!found}`);
    if (found) { console.error(`  FAIL: ${t} still exists as an exported interface`); failures++; }
  }

  // --- Test 2: LoopState.current_task must NOT exist ---
  const hasCurrentTask = /current_task\s*:/.test(content);
  console.log(`[Test 2] LoopState.current_task removed: ${!hasCurrentTask}`);
  if (hasCurrentTask) { console.error('  FAIL: current_task still exists in LoopState'); failures++; }

  // --- Test 3: New types MUST exist ---
  const requiredTypes = ['WorkStep', 'StepsFile', 'WorkerContract'];
  for (const t of requiredTypes) {
    const regex = new RegExp(`export\\s+interface\\s+${t}\\b`);
    const found = regex.test(content);
    console.log(`[Test 3] interface ${t} exists: ${found}`);
    if (!found) { console.error(`  FAIL: ${t} not found`); failures++; }
  }

  // --- Test 4: LoopState.current_contract MUST exist ---
  const hasCurrentContract = /current_contract\s*:/.test(content);
  console.log(`[Test 4] LoopState.current_contract exists: ${hasCurrentContract}`);
  if (!hasCurrentContract) { console.error('  FAIL: current_contract not found in LoopState'); failures++; }

  // --- Test 5: WorkerContract uses 'prompt' not 'goal' for the text field ---
  const contractBlock = content.slice(
    content.indexOf('export interface WorkerContract'),
    content.indexOf('}', content.indexOf('export interface WorkerContract')) + 1
  );
  const hasPromptField = /prompt\s*:\s*string/.test(contractBlock);
  const hasGoalField = /goal\s*:\s*string/.test(contractBlock);
  console.log(`[Test 5] WorkerContract.prompt field: ${hasPromptField}, no .goal field: ${!hasGoalField}`);
  if (!hasPromptField) { console.error('  FAIL: WorkerContract should have prompt field'); failures++; }
  if (hasGoalField) { console.error('  FAIL: WorkerContract should NOT have goal field'); failures++; }

  // --- Test 6: WorkStep has unified fields from old TaskStep ---
  const wsBlock = content.slice(
    content.indexOf('export interface WorkStep'),
    content.indexOf('}', content.indexOf('export interface WorkStep')) + 1
  );
  const unifiedFields = ['completed_at', 'started_at', 'completed_by_contract', 're_breakdown_count', 'retry_count', 'id?'];
  for (const f of unifiedFields) {
    const has = wsBlock.includes(f);
    console.log(`[Test 6] WorkStep has ${f}: ${has}`);
    if (!has) { console.error(`  FAIL: WorkStep missing unified field ${f}`); failures++; }
  }

  // --- Summary ---
  if (failures === 0) {
    console.log('\n--- All type rename tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
