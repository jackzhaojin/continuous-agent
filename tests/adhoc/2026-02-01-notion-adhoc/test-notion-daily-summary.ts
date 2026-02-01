#!/usr/bin/env npx tsx
/**
 * Ad-hoc test: Post a test daily summary to the Notion monthly summaries page.
 * Verifies NOTION_API_KEY, NOTION_MONTHLY_PAGE_ID, and block appending works.
 *
 * Usage:
 *   npx tsx tests/adhoc/test-notion-daily-summary.ts
 *
 * Expects .env to have NOTION_API_KEY and NOTION_MONTHLY_PAGE_ID set.
 * Appends a "[Test] Daily Summary" block that you can delete manually.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

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
const PAGE_ID = env.NOTION_MONTHLY_PAGE_ID || process.env.NOTION_MONTHLY_PAGE_ID;

if (!API_KEY) {
  console.error('NOTION_API_KEY not found in .env');
  process.exit(1);
}
if (!PAGE_ID) {
  console.error('NOTION_MONTHLY_PAGE_ID not found in .env');
  process.exit(1);
}

console.log(`API key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`);
console.log(`Monthly page ID: ${PAGE_ID}`);
console.log('');

// Test 1: Verify page exists
console.log('1. Verifying monthly summaries page...');
const pageRes = await fetch(`https://api.notion.com/v1/pages/${PAGE_ID}`, {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Notion-Version': '2022-06-28',
  },
});

if (!pageRes.ok) {
  console.error(`   FAIL: HTTP ${pageRes.status} - ${await pageRes.text()}`);
  process.exit(1);
}

const pageData = (await pageRes.json()) as { url: string };
console.log(`   OK: Page accessible — ${pageData.url}\n`);

// Test 2: Append test daily summary blocks
console.log('2. Appending test daily summary blocks...');
const today = new Date().toISOString().split('T')[0];

const appendRes = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  },
  body: JSON.stringify({
    children: [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: `[Test] Daily Summary: ${today}` } }],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: [
                  'Tasks touched: 3',
                  'Tasks started: 2',
                  'Tasks completed: 1',
                  'Steps completed: 4',
                  'Failures/retries: 0',
                  'Total ledger entries: 12',
                  '',
                  '(This is a test entry — delete it manually)',
                ].join('\n'),
              },
            },
          ],
        },
      },
      {
        object: 'block',
        type: 'divider',
        divider: {},
      },
    ],
  }),
});

if (!appendRes.ok) {
  console.error(`   FAIL: HTTP ${appendRes.status} - ${await appendRes.text()}`);
  process.exit(1);
}

console.log('   OK: Test daily summary blocks appended');

// Test 3: Read back children to verify
console.log('\n3. Reading page children to verify...');
const childrenRes = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children?page_size=5`, {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Notion-Version': '2022-06-28',
  },
});

if (!childrenRes.ok) {
  console.error(`   FAIL: HTTP ${childrenRes.status}`);
  process.exit(1);
}

const childrenData = (await childrenRes.json()) as { results: Array<{ type: string }> };
console.log(`   OK: Page has ${childrenData.results.length} child blocks`);
console.log(`   Block types: ${childrenData.results.map((b) => b.type).join(', ')}`);

console.log('\n--- ALL TESTS PASSED ---');
console.log('You can delete the "[Test] Daily Summary" blocks in Notion.');
