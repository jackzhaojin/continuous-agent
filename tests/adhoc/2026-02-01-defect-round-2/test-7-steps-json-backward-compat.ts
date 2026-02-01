/**
 * Ad-hoc test: Terminology Cleanup — STEPS.json backward compatibility
 *
 * Verifies that readStepsJson() falls back to TASKS.json when STEPS.json
 * doesn't exist, and that writeStepsJson() always writes STEPS.json.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-2/test-7-steps-json-backward-compat.ts
 */

import { mkdtemp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { readStepsJson, writeStepsJson, stepsJsonExists } from '../../../src/deterministic/steps-json-handler.js';
import type { StepsFile } from '../../../src/core/types.js';

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
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'steps-compat-'));

  try {
    // --- Test 1: Empty dir returns null ---
    const empty = await readStepsJson(tmpDir);
    assertEqual('Empty dir returns null', empty, null);
    assertEqual('stepsJsonExists returns false for empty dir', stepsJsonExists(tmpDir), false);

    // --- Test 2: TASKS.json fallback ---
    const legacyData: StepsFile = {
      version: 1,
      created_at: '2026-01-25T00:00:00Z',
      trigger: 'auto',
      revision: 1,
      steps: [
        {
          step_number: 0,
          title: 'Legacy step',
          description: 'From old TASKS.json',
          status: 'pending',
          id: 'step-0',
          order: 0,
        },
      ],
    };
    await writeFile(path.join(tmpDir, 'TASKS.json'), JSON.stringify(legacyData), 'utf-8');

    const fromLegacy = await readStepsJson(tmpDir);
    assertEqual('Reads from TASKS.json fallback', fromLegacy?.steps?.[0]?.title, 'Legacy step');
    assertEqual('stepsJsonExists finds TASKS.json', stepsJsonExists(tmpDir), true);

    // --- Test 3: writeStepsJson writes STEPS.json (not TASKS.json) ---
    const newData: StepsFile = {
      version: 1,
      created_at: '2026-02-01T00:00:00Z',
      trigger: 'auto',
      revision: 0,
      steps: [
        {
          step_number: 0,
          title: 'New step',
          description: 'Written as STEPS.json',
          status: 'pending',
          id: 'step-0',
          order: 0,
        },
      ],
    };
    const writeOk = await writeStepsJson(tmpDir, newData);
    assertEqual('writeStepsJson succeeds', writeOk, true);

    const stepsExists = existsSync(path.join(tmpDir, 'STEPS.json'));
    assertEqual('STEPS.json file created', stepsExists, true);

    // --- Test 4: STEPS.json takes precedence over TASKS.json ---
    const fromNew = await readStepsJson(tmpDir);
    assertEqual('STEPS.json takes precedence', fromNew?.steps?.[0]?.title, 'New step');

    // --- Test 5: Revision is bumped ---
    assertEqual('Revision bumped to 1', fromNew?.revision, 1);

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  if (failures === 0) {
    console.log('\n--- All STEPS.json backward compat tests passed ---');
  } else {
    console.error(`\n--- ${failures} test(s) FAILED ---`);
    process.exit(1);
  }
}

runTests().catch(err => { console.error('Test runner failed:', err); process.exit(1); });
