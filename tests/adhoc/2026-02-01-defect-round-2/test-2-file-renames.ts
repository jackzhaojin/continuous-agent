/**
 * Ad-hoc test: Terminology Cleanup — File renames and deletions
 *
 * Verifies renamed files exist, old files are gone, and deleted files stay deleted.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-2-file-renames.ts
 */

import { existsSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();

function check(label: string, shouldExist: boolean, filePath: string): boolean {
  const exists = existsSync(filePath);
  const ok = exists === shouldExist;
  const status = ok ? 'PASS' : 'FAIL';
  const verb = shouldExist ? 'exists' : 'removed';
  console.log(`[${status}] ${label}: ${verb} — ${path.relative(ROOT, filePath)}`);
  return ok;
}

let failures = 0;
function assert(ok: boolean) { if (!ok) failures++; }

// --- Renamed files: new names MUST exist ---
assert(check('steps-json-handler.ts', true, path.join(ROOT, 'src/deterministic/steps-json-handler.ts')));
assert(check('goal-breakdown.ts', true, path.join(ROOT, 'src/agentic/work-selection/goal-breakdown.ts')));

// --- Old names MUST NOT exist ---
assert(check('tasks-json-handler.ts', false, path.join(ROOT, 'src/deterministic/tasks-json-handler.ts')));
assert(check('task-breakdown.ts', false, path.join(ROOT, 'src/agentic/work-selection/task-breakdown.ts')));

// --- Deleted files MUST NOT exist ---
assert(check('task-contractor.ts', false, path.join(ROOT, 'src/agentic/execution/task-contractor.ts')));
assert(check('goals-index-generator.ts', false, path.join(ROOT, 'src/deterministic/goals-index-generator.ts')));
assert(check('workspace/goals.md', false, path.join(ROOT, 'workspace/goals.md')));
assert(check('contract-creation prompt', false, path.join(ROOT, 'src/agentic/worker-prompts/contracts/contract-creation-v1.0.0.md')));

// --- New files MUST exist ---
assert(check('contracts-log-writer.ts', true, path.join(ROOT, 'src/deterministic/contracts-log-writer.ts')));

// --- Summary ---
if (failures === 0) {
  console.log('\n--- All file rename tests passed ---');
} else {
  console.error(`\n--- ${failures} test(s) FAILED ---`);
  process.exit(1);
}
