/**
 * Ad-hoc test: Terminology Cleanup — CONTRACTS.jsonl writer
 *
 * End-to-end test of appendContractEvent() and readContractHistory().
 * Uses a temp directory to avoid polluting real goal bundles.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-6-contracts-log-writer.ts
 */

import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { appendContractEvent, readContractHistory, type ContractEvent } from '../../../src/deterministic/contracts-log-writer.js';

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

async function runTests() {
  // Create temp directory
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'contracts-test-'));

  try {
    // --- Test 1: readContractHistory returns [] for missing file ---
    const empty = await readContractHistory(tmpDir);
    assertEqual('Empty dir returns []', empty, []);

    // --- Test 2: appendContractEvent creates file and writes ---
    const event1: ContractEvent = {
      event: 'CONTRACT_STARTED',
      ts: '2026-02-01T10:00:00Z',
      contract_id: 'contract-123',
      step_id: 'step-0',
      step_title: 'Research',
    };
    const ok1 = await appendContractEvent(tmpDir, event1);
    assertEqual('First append succeeds', ok1, true);

    // --- Test 3: readContractHistory reads back single entry ---
    const history1 = await readContractHistory(tmpDir);
    assertEqual('History has 1 entry', history1.length, 1);
    assertEqual('Entry event matches', history1[0]?.event, 'CONTRACT_STARTED');
    assertEqual('Entry contract_id matches', history1[0]?.contract_id, 'contract-123');
    assertEqual('Entry step_id matches', history1[0]?.step_id, 'step-0');

    // --- Test 4: Multiple appends accumulate ---
    const event2: ContractEvent = {
      event: 'CONTRACT_COMPLETED',
      ts: '2026-02-01T11:00:00Z',
      contract_id: 'contract-123',
      output_path: '/some/path',
    };
    const event3: ContractEvent = {
      event: 'CONTRACT_FAILED',
      ts: '2026-02-01T12:00:00Z',
      contract_id: 'contract-456',
      error: 'npm build failed',
    };
    await appendContractEvent(tmpDir, event2);
    await appendContractEvent(tmpDir, event3);

    const history3 = await readContractHistory(tmpDir);
    assertEqual('History has 3 entries', history3.length, 3);
    assertEqual('Second entry is COMPLETED', history3[1]?.event, 'CONTRACT_COMPLETED');
    assertEqual('Third entry is FAILED', history3[2]?.event, 'CONTRACT_FAILED');
    assertEqual('Third entry has error', history3[2]?.error, 'npm build failed');

    // --- Test 5: CONTRACT_BLOCKED event ---
    const event4: ContractEvent = {
      event: 'CONTRACT_BLOCKED',
      ts: '2026-02-01T13:00:00Z',
      contract_id: 'contract-789',
    };
    await appendContractEvent(tmpDir, event4);
    const history4 = await readContractHistory(tmpDir);
    assertEqual('History has 4 entries', history4.length, 4);
    assertEqual('Fourth entry is BLOCKED', history4[3]?.event, 'CONTRACT_BLOCKED');

  } finally {
    // Cleanup
    await rm(tmpDir, { recursive: true, force: true });
  }

  // --- Summary ---
  if (failures === 0) {
    console.log('\n--- All CONTRACTS.jsonl writer tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
