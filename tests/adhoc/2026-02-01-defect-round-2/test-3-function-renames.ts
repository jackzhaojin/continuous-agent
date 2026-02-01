/**
 * Ad-hoc test: Terminology Cleanup — Function renames
 *
 * Reads source files and verifies renamed functions exist
 * and old function names are gone.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-3-function-renames.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();

async function readSrc(rel: string): Promise<string> {
  return readFile(path.join(ROOT, rel), 'utf-8');
}

async function runTests() {
  let failures = 0;

  function assertContains(file: string, content: string, pattern: string, shouldExist: boolean) {
    const found = content.includes(pattern);
    const ok = found === shouldExist;
    const verb = shouldExist ? 'found' : 'absent';
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${file}: "${pattern}" ${verb}`);
    if (!ok) failures++;
  }

  // --- state-handler.ts ---
  const stateHandler = await readSrc('src/deterministic/state-handler.ts');
  assertContains('state-handler.ts', stateHandler, 'export async function updateGoalState(', true);
  assertContains('state-handler.ts', stateHandler, 'export async function setGoalOutputPath(', true);
  assertContains('state-handler.ts', stateHandler, 'export async function markGoalBlocked(', true);
  // Old names must not exist
  assertContains('state-handler.ts', stateHandler, 'function updateTaskState(', false);
  assertContains('state-handler.ts', stateHandler, 'function setTaskOutputPath(', false);
  assertContains('state-handler.ts', stateHandler, 'function markTaskBlocked(', false);

  // --- execution-handler.ts ---
  const execHandler = await readSrc('src/agentic/execution/execution-handler.ts');
  assertContains('execution-handler.ts', execHandler, 'export function inferCapabilitiesFromGoal(', true);
  assertContains('execution-handler.ts', execHandler, 'function inferCapabilitiesFromTask(', false);

  // --- steps-json-handler.ts ---
  const stepsHandler = await readSrc('src/deterministic/steps-json-handler.ts');
  assertContains('steps-json-handler.ts', stepsHandler, 'export async function readStepsJson(', true);
  assertContains('steps-json-handler.ts', stepsHandler, 'export async function writeStepsJson(', true);
  assertContains('steps-json-handler.ts', stepsHandler, 'export function stepsJsonExists(', true);
  assertContains('steps-json-handler.ts', stepsHandler, 'export function createStepsFile(', true);
  // Old names must not exist
  assertContains('steps-json-handler.ts', stepsHandler, 'function readTasksJson(', false);
  assertContains('steps-json-handler.ts', stepsHandler, 'function writeTasksJson(', false);
  assertContains('steps-json-handler.ts', stepsHandler, 'function tasksJsonExists(', false);
  assertContains('steps-json-handler.ts', stepsHandler, 'function createTasksFile(', false);

  // --- work-selector.ts ---
  const workSelector = await readSrc('src/agentic/work-selection/work-selector.ts');
  assertContains('work-selector.ts', workSelector, "type: 'goal'", true);
  assertContains('work-selector.ts', workSelector, "type: 'task'", false);

  // --- Summary ---
  if (failures === 0) {
    console.log('\n--- All function rename tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
