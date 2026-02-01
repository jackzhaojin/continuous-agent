#!/usr/bin/env npx tsx
/**
 * Live Notion API test: Full lifecycle of closeMilestone.
 *
 * Steps:
 *   1. Create a "Started" milestone row with a known contract ID
 *   2. Wait 2 seconds (so duration > 0)
 *   3. Close it by querying + updating (simulates closeMilestone logic)
 *   4. Re-query and verify: Timestamp has start+end, Duration is populated
 *   5. Clean up (archive the test row)
 *
 * Uses the databases/query REST endpoint (v2022-06-28), matching closeMilestone's
 * implementation. The SDK v5.8.0 dataSources.query endpoint is not yet supported
 * by the Notion API.
 *
 * Expects .env to have NOTION_API_KEY and NOTION_DATABASE_ID.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-notion-endtask/test-live-close-milestone.ts
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// === Helpers ===

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_PATH)) return env;
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.NOTION_API_KEY || process.env.NOTION_API_KEY;
const DATABASE_ID = env.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';

if (!API_KEY || !DATABASE_ID) {
  console.error('NOTION_API_KEY or NOTION_DATABASE_ID not found in .env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION,
};

let passed = 0;
let failed = 0;
let createdPageId: string | null = null;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function notionPost(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function notionPatch(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PageResult = { id: string; properties: Record<string, unknown> };
type QueryResponse = { results: PageResult[] };

async function queryStartedRow(contractId: string): Promise<PageResult[]> {
  const data = (await notionPost(
    `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
    {
      filter: {
        and: [
          { property: 'Contract ID', rich_text: { equals: contractId } },
          { property: 'Event', select: { equals: 'Started' } },
        ],
      },
      page_size: 1,
    }
  )) as QueryResponse;
  return data.results;
}

// === Test ===

const TEST_CONTRACT_ID = `endtask-test-${Date.now()}`;

async function runTests() {
  console.log(`Test contract ID: ${TEST_CONTRACT_ID}`);
  console.log(`Database ID: ${DATABASE_ID}`);
  console.log('');

  // --- Step 1: Create Started milestone ---
  console.log('1. Creating Started milestone row...');
  const startTime = new Date().toISOString();

  const createResult = (await notionPost('https://api.notion.com/v1/pages', {
    parent: { database_id: DATABASE_ID },
    properties: {
      Title: { title: [{ text: { content: '[Test] closeMilestone lifecycle' } }] },
      Event: { select: { name: 'Started' } },
      Priority: { select: { name: 'P4' } },
      Timestamp: { date: { start: startTime } },
      'Contract ID': { rich_text: [{ text: { content: TEST_CONTRACT_ID } }] },
      'Output Path': { rich_text: [{ text: { content: '/tests/adhoc/endtask' } }] },
    },
  })) as { id: string; url: string };

  createdPageId = createResult.id;
  console.log(`   Created page: ${createResult.id}`);
  assert(!!createdPageId, 'Started row created');

  // --- Step 2: Wait for measurable duration ---
  console.log('\n2. Waiting 2 seconds for measurable duration...');
  await sleep(2000);

  // --- Step 3: Query for the Started row ---
  console.log('\n3. Querying for Started row by Contract ID...');
  const results = await queryStartedRow(TEST_CONTRACT_ID);

  assert(results.length === 1, 'Found exactly 1 Started row');

  const foundPage = results[0];
  assert(foundPage.id === createdPageId, 'Query returned the correct page');

  // Extract existing start from properties
  const timestampProp = foundPage.properties['Timestamp'] as {
    date?: { start?: string; end?: string | null };
  };
  const existingStart = timestampProp?.date?.start;
  assert(!!existingStart, `Start date extracted: ${existingStart}`);
  assert(
    !timestampProp?.date?.end,
    'End date is initially null/undefined'
  );

  // --- Step 4: Update (simulating closeMilestone's update) ---
  console.log('\n4. Closing milestone (update with end date + duration)...');
  const endTime = new Date().toISOString();
  const startMs = new Date(existingStart!).getTime();
  const endMs = new Date(endTime).getTime();
  const durationMinutes = Math.round((endMs - startMs) / 60000);

  await notionPatch(`https://api.notion.com/v1/pages/${foundPage.id}`, {
    properties: {
      Timestamp: {
        date: { start: existingStart, end: endTime },
      },
      Duration: {
        number: durationMinutes,
      },
    },
  });
  console.log(`   Updated: end=${endTime}, duration=${durationMinutes} min`);

  // --- Step 5: Verify the update ---
  console.log('\n5. Verifying updated row...');
  const verifyResults = await queryStartedRow(TEST_CONTRACT_ID);

  const updatedPage = verifyResults[0];
  const updatedTimestamp = updatedPage.properties['Timestamp'] as {
    date?: { start?: string; end?: string | null };
  };
  const updatedDuration = updatedPage.properties['Duration'] as {
    number?: number | null;
  };

  assert(!!updatedTimestamp?.date?.start, `Timestamp.start preserved: ${updatedTimestamp?.date?.start}`);
  assert(!!updatedTimestamp?.date?.end, `Timestamp.end populated: ${updatedTimestamp?.date?.end}`);
  assert(
    updatedTimestamp?.date?.start === existingStart,
    'Start date unchanged after close'
  );
  assert(
    updatedDuration?.number !== null && updatedDuration?.number !== undefined,
    `Duration populated: ${updatedDuration?.number} minutes`
  );
  assert(
    (updatedDuration?.number ?? -1) >= 0,
    `Duration is non-negative: ${updatedDuration?.number}`
  );

  // --- Step 6: Clean up ---
  console.log('\n6. Cleaning up (archiving test row)...');
  try {
    await notionPatch(`https://api.notion.com/v1/pages/${createdPageId}`, { archived: true });
    console.log('   Archived test row');
  } catch (e) {
    console.log(`   Warning: cleanup failed: ${e}`);
  }

  // === Summary ===
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    console.error('LIVE TESTS FAILED');
    process.exit(1);
  }
  console.log('ALL LIVE TESTS PASSED');
}

runTests().catch(async (err) => {
  console.error('\nTest runner failed:', err);
  if (createdPageId) {
    try {
      await notionPatch(`https://api.notion.com/v1/pages/${createdPageId}`, { archived: true });
      console.log('Cleaned up test row after error');
    } catch { /* ignore */ }
  }
  process.exit(1);
});
