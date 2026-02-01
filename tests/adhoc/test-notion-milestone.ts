#!/usr/bin/env npx tsx
/**
 * Ad-hoc test: Write a test milestone row to the Notion database.
 * Verifies NOTION_API_KEY, NOTION_DATABASE_ID, and the database schema are correct.
 *
 * Usage:
 *   npx tsx tests/adhoc/test-notion-milestone.ts
 *
 * Expects .env to have NOTION_API_KEY and NOTION_DATABASE_ID set.
 * Creates a "[Test] Ad-hoc Milestone" row that you can delete manually.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// Load .env manually
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

if (!API_KEY) {
  console.error('NOTION_API_KEY not found in .env');
  process.exit(1);
}
if (!DATABASE_ID) {
  console.error('NOTION_DATABASE_ID not found in .env');
  process.exit(1);
}

console.log(`API key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`);
console.log(`Database ID: ${DATABASE_ID}`);
console.log('');

// Test 1: Verify database schema
console.log('1. Verifying database schema...');
const dbRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Notion-Version': '2022-06-28',
  },
});

if (!dbRes.ok) {
  console.error(`   FAIL: HTTP ${dbRes.status} - ${await dbRes.text()}`);
  process.exit(1);
}

const dbData = (await dbRes.json()) as { properties: Record<string, { type: string }> };
const expected: Record<string, string> = {
  Title: 'title',
  Event: 'select',
  Priority: 'select',
  Timestamp: 'date',
  Duration: 'number',
  'Contract ID': 'rich_text',
  'Output Path': 'rich_text',
  'Error Summary': 'rich_text',
};

let schemaOk = true;
for (const [name, expectedType] of Object.entries(expected)) {
  const prop = dbData.properties[name];
  if (!prop) {
    console.error(`   MISSING: ${name}`);
    schemaOk = false;
  } else if (prop.type !== expectedType) {
    console.error(`   WRONG TYPE: ${name} — expected ${expectedType}, got ${prop.type}`);
    schemaOk = false;
  } else {
    console.log(`   OK: ${name} (${expectedType})`);
  }
}

if (!schemaOk) {
  console.error('\n   Schema verification FAILED');
  process.exit(1);
}
console.log('   Schema OK\n');

// Test 2: Insert a test milestone
console.log('2. Inserting test milestone row...');
const insertRes = await fetch('https://api.notion.com/v1/pages', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  },
  body: JSON.stringify({
    parent: { database_id: DATABASE_ID },
    properties: {
      Title: { title: [{ text: { content: '[Test] Ad-hoc Milestone' } }] },
      Event: { select: { name: 'Started' } },
      Priority: { select: { name: 'P4' } },
      Timestamp: { date: { start: new Date().toISOString() } },
      Duration: { number: 0 },
      'Contract ID': { rich_text: [{ text: { content: 'adhoc-test' } }] },
      'Output Path': { rich_text: [{ text: { content: '/tests/adhoc' } }] },
      'Error Summary': { rich_text: [{ text: { content: '' } }] },
    },
  }),
});

if (!insertRes.ok) {
  console.error(`   FAIL: HTTP ${insertRes.status} - ${await insertRes.text()}`);
  process.exit(1);
}

const insertData = (await insertRes.json()) as { id: string; url: string };
console.log(`   OK: Row created — ${insertData.url}`);

// Test 3: Query it back
console.log('\n3. Querying test row back...');
const queryRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  },
  body: JSON.stringify({
    filter: {
      property: 'Contract ID',
      rich_text: { equals: 'adhoc-test' },
    },
    page_size: 1,
  }),
});

if (!queryRes.ok) {
  console.error(`   FAIL: HTTP ${queryRes.status}`);
  process.exit(1);
}

const queryData = (await queryRes.json()) as { results: unknown[] };
if (queryData.results.length > 0) {
  console.log(`   OK: Found ${queryData.results.length} row(s) with contract ID "adhoc-test"`);
} else {
  console.error('   FAIL: Row not found after insert');
  process.exit(1);
}

console.log('\n--- ALL TESTS PASSED ---');
console.log('You can delete the "[Test] Ad-hoc Milestone" row in Notion.');
