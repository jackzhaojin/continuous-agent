#!/usr/bin/env npx tsx
/**
 * SDK integration test: Call the actual closeMilestone() function from notion-reporter.ts.
 *
 * Steps:
 *   1. Load env vars so the module picks them up
 *   2. Create a Started row via reportMilestone()
 *   3. Wait 2 seconds
 *   4. Call closeMilestone() with the same contract ID
 *   5. Query Notion to verify the row was updated with end date + duration
 *   6. Clean up
 *
 * This tests the real compiled code path including SDK dataSources.query().
 *
 * Run: npx tsx tests/adhoc/2026-02-01-notion-endtask/test-sdk-close-milestone.ts
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// Load .env into process.env BEFORE importing notion-reporter
// (the module reads env lazily, so this works)
function loadEnvToProcess(): void {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvToProcess();

const API_KEY = process.env.NOTION_API_KEY;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!API_KEY || !DATABASE_ID) {
  console.error('NOTION_API_KEY or NOTION_DATABASE_ID not set');
  process.exit(1);
}

// Now import the module (env is loaded)
const { reportMilestone, closeMilestone } = await import(
  path.join(PROJECT_ROOT, 'dist/deterministic/notion-reporter.js')
);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
};

async function queryByContractId(contractId: string): Promise<Array<{ id: string; properties: Record<string, unknown> }>> {
  // Use databases endpoint for verification (known to work)
  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Contract ID', rich_text: { equals: contractId } },
          { property: 'Event', select: { equals: 'Started' } },
        ],
      },
      page_size: 1,
    }),
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { results: Array<{ id: string; properties: Record<string, unknown> }> };
  return data.results;
}

async function archivePage(pageId: string): Promise<void> {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ archived: true }),
  });
}

// === Test ===

const TEST_CONTRACT_ID = `sdk-endtask-test-${Date.now()}`;
let createdPageId: string | null = null;

async function runTests() {
  console.log(`Test contract ID: ${TEST_CONTRACT_ID}`);
  console.log('');

  // --- Step 1: Create Started row via reportMilestone ---
  console.log('1. Creating Started row via reportMilestone()...');

  const fakeWorkItem = {
    id: 'test-endtask',
    title: '[Test] SDK closeMilestone lifecycle',
    priority: 'P4' as const,
    status: 'Pending' as const,
  };

  await reportMilestone('Started', fakeWorkItem, TEST_CONTRACT_ID, {
    outputPath: '/tests/adhoc/endtask-sdk',
  });

  // Verify it was created
  await sleep(1000); // Give Notion a moment
  const beforeClose = await queryByContractId(TEST_CONTRACT_ID);
  assert(beforeClose.length === 1, 'Started row created via reportMilestone');

  if (beforeClose.length === 0) {
    console.error('Cannot continue — Started row not found');
    process.exit(1);
  }

  createdPageId = beforeClose[0].id;
  console.log(`   Page ID: ${createdPageId}`);

  // Check initial state
  const initialTimestamp = beforeClose[0].properties['Timestamp'] as {
    date?: { start?: string; end?: string | null };
  };
  assert(!!initialTimestamp?.date?.start, `Initial start date: ${initialTimestamp?.date?.start}`);
  assert(
    !initialTimestamp?.date?.end,
    'Initial end date is null'
  );

  // --- Step 2: Wait for measurable duration ---
  console.log('\n2. Waiting 2 seconds...');
  await sleep(2000);

  // --- Step 3: Call closeMilestone ---
  console.log('\n3. Calling closeMilestone()...');
  await closeMilestone(TEST_CONTRACT_ID);
  console.log('   closeMilestone returned (no throw = fire-and-forget OK)');

  // --- Step 4: Verify ---
  console.log('\n4. Verifying closed row...');
  await sleep(1000); // Give Notion a moment

  const afterClose = await queryByContractId(TEST_CONTRACT_ID);
  assert(afterClose.length === 1, 'Row still exists after closure');

  const closedTimestamp = afterClose[0].properties['Timestamp'] as {
    date?: { start?: string; end?: string | null };
  };
  const closedDuration = afterClose[0].properties['Duration'] as {
    number?: number | null;
  };

  assert(!!closedTimestamp?.date?.start, `Start date preserved: ${closedTimestamp?.date?.start}`);
  assert(!!closedTimestamp?.date?.end, `End date populated: ${closedTimestamp?.date?.end}`);
  assert(
    closedTimestamp?.date?.start === initialTimestamp?.date?.start,
    'Start date unchanged'
  );
  assert(
    closedDuration?.number !== null && closedDuration?.number !== undefined,
    `Duration populated: ${closedDuration?.number} minutes`
  );
  assert(
    (closedDuration?.number ?? -1) >= 0,
    'Duration is non-negative'
  );

  // --- Step 5: Test idempotency — calling closeMilestone again shouldn't break ---
  console.log('\n5. Testing idempotency (calling closeMilestone again)...');
  await closeMilestone(TEST_CONTRACT_ID);
  console.log('   Second call completed without error');

  // --- Step 6: Test edge case — nonexistent contract ID ---
  console.log('\n6. Testing nonexistent contract ID...');
  await closeMilestone('nonexistent-contract-id-12345');
  console.log('   Handled gracefully (no throw)');
  assert(true, 'closeMilestone handles missing contract ID gracefully');

  // --- Step 7: Test edge case — empty string ---
  console.log('\n7. Testing empty contract ID...');
  await closeMilestone('');
  console.log('   Handled gracefully (no throw)');
  assert(true, 'closeMilestone handles empty contract ID gracefully');

  // --- Cleanup ---
  console.log('\n8. Cleaning up (archiving test row)...');
  if (createdPageId) {
    await archivePage(createdPageId);
    console.log('   Archived');
  }

  // === Summary ===
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    console.error('SDK TESTS FAILED');
    process.exit(1);
  }
  console.log('ALL SDK TESTS PASSED');
}

runTests().catch(async (err) => {
  console.error('\nTest runner failed:', err);
  if (createdPageId) {
    try {
      await archivePage(createdPageId);
      console.log('Cleaned up after error');
    } catch { /* ignore */ }
  }
  process.exit(1);
});
