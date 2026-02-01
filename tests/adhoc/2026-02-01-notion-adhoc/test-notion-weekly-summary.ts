#!/usr/bin/env npx tsx
/**
 * Ad-hoc test: Create a test weekly summary child page under the monthly summaries page.
 * Verifies NOTION_API_KEY, NOTION_MONTHLY_PAGE_ID, and child page creation works.
 *
 * Usage:
 *   npx tsx tests/adhoc/test-notion-weekly-summary.ts
 *
 * Expects .env to have NOTION_API_KEY and NOTION_MONTHLY_PAGE_ID set.
 * Creates a "[Test] Weekly Summary" child page that you can delete manually.
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

// Test: Create a weekly summary child page
const now = new Date();
const endDate = now.toISOString().split('T')[0];
const startDateObj = new Date(now);
startDateObj.setDate(startDateObj.getDate() - 7);
const startDate = startDateObj.toISOString().split('T')[0];

const pageTitle = `[Test] Weekly Summary: ${startDate} to ${endDate}`;

console.log(`1. Creating child page: "${pageTitle}"...`);

const createRes = await fetch('https://api.notion.com/v1/pages', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  },
  body: JSON.stringify({
    parent: { page_id: PAGE_ID },
    properties: {
      title: {
        title: [{ text: { content: pageTitle } }],
      },
    },
    children: [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: 'Overview' } }],
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
                  `Period: ${startDate} to ${endDate}`,
                  'Unique tasks touched: 5',
                  'Tasks started: 3',
                  'Tasks completed: 2',
                  'Steps completed: 8',
                  'Failures/retries: 1',
                  'Total ledger entries: 24',
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
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: 'Tasks Worked On' } }],
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
                  '- Build Next.js App [Completed]',
                  '- Setup Notion Integration [Completed]',
                  '- Music Player UI [In Progress]',
                ].join('\n'),
              },
            },
          ],
        },
      },
    ],
  }),
});

if (!createRes.ok) {
  console.error(`   FAIL: HTTP ${createRes.status} - ${await createRes.text()}`);
  process.exit(1);
}

const createData = (await createRes.json()) as { id: string; url: string };
console.log(`   OK: Child page created — ${createData.url}`);

// Verify it's a child of the monthly page
console.log('\n2. Verifying parent-child relationship...');
const verifyRes = await fetch(`https://api.notion.com/v1/pages/${createData.id}`, {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Notion-Version': '2022-06-28',
  },
});

if (!verifyRes.ok) {
  console.error(`   FAIL: HTTP ${verifyRes.status}`);
  process.exit(1);
}

const verifyData = (await verifyRes.json()) as { parent: { type: string; page_id?: string } };
const parentId = verifyData.parent.page_id?.replace(/-/g, '');
const expectedParent = PAGE_ID.replace(/-/g, '');

if (parentId === expectedParent) {
  console.log(`   OK: Parent is the monthly summaries page`);
} else {
  console.error(`   FAIL: Parent mismatch — got ${parentId}, expected ${expectedParent}`);
  process.exit(1);
}

console.log('\n--- ALL TESTS PASSED ---');
console.log(`You can delete the "${pageTitle}" page in Notion.`);
