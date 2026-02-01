/**
 * Ad-hoc test: Terminology Cleanup — Ledger event/field normalization
 *
 * Tests normalizeLedgerEvent() and normalizeLedgerEntry() in logging.ts.
 * These functions enable backward compat with old TASK_* events and task_id/task_title fields.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-5-ledger-normalization.ts
 */

import { normalizeLedgerEvent, normalizeLedgerEntry } from '../../../src/core/logging.js';

let failures = 0;

function assertEqual(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`);
  if (!ok) {
    console.error(`  Expected: ${JSON.stringify(expected)}`);
    console.error(`  Actual:   ${JSON.stringify(actual)}`);
    failures++;
  }
}

// --- Test 1: Legacy event names map to new ---
assertEqual('TASK_STARTED → GOAL_STARTED', normalizeLedgerEvent('TASK_STARTED'), 'GOAL_STARTED');
assertEqual('TASK_COMPLETED → GOAL_COMPLETED', normalizeLedgerEvent('TASK_COMPLETED'), 'GOAL_COMPLETED');
assertEqual('TASK_BREAKDOWN → GOAL_BREAKDOWN', normalizeLedgerEvent('TASK_BREAKDOWN'), 'GOAL_BREAKDOWN');

// --- Test 2: New event names pass through ---
assertEqual('GOAL_STARTED passthrough', normalizeLedgerEvent('GOAL_STARTED'), 'GOAL_STARTED');
assertEqual('STEP_STARTED passthrough', normalizeLedgerEvent('STEP_STARTED'), 'STEP_STARTED');
assertEqual('STEP_COMPLETED passthrough', normalizeLedgerEvent('STEP_COMPLETED'), 'STEP_COMPLETED');

// --- Test 3: Unknown events pass through ---
assertEqual('UNKNOWN passthrough', normalizeLedgerEvent('SOMETHING_ELSE'), 'SOMETHING_ELSE');

// --- Test 4: normalizeLedgerEntry normalizes event name ---
const oldEntry = { event: 'TASK_STARTED', ts: '2026-01-01', task_id: 'abc', task_title: 'Build app' };
const normalized = normalizeLedgerEntry(oldEntry);
assertEqual('Entry event normalized', normalized.event, 'GOAL_STARTED');

// --- Test 5: normalizeLedgerEntry normalizes task_id → goal_id ---
assertEqual('task_id → goal_id', normalized.goal_id, 'abc');

// --- Test 6: normalizeLedgerEntry normalizes task_title → goal_title ---
assertEqual('task_title → goal_title', normalized.goal_title, 'Build app');

// --- Test 7: Already-new entries pass through unchanged ---
const newEntry = { event: 'GOAL_STARTED', ts: '2026-02-01', goal_id: 'xyz', goal_title: 'New app' };
const passthrough = normalizeLedgerEntry(newEntry);
assertEqual('New entry event unchanged', passthrough.event, 'GOAL_STARTED');
assertEqual('New entry goal_id unchanged', passthrough.goal_id, 'xyz');
assertEqual('New entry goal_title unchanged', passthrough.goal_title, 'New app');

// --- Summary ---
if (failures === 0) {
  console.log('\n--- All ledger normalization tests passed ---');
} else {
  console.error(`\n--- ${failures} test(s) FAILED ---`);
  process.exit(1);
}
