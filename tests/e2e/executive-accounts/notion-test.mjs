/**
 * E2E Test: Notion API integration
 *
 * Tests:
 *   1. Authenticate with Notion API
 *   2. Append a block to the E2E Testing page
 *   3. Insert a row into the Agent Milestones database
 *
 * All credentials come from .env.executive — nothing is hardcoded.
 *
 * Usage:
 *   node tests/e2e/executive-accounts/notion-test.mjs
 *
 * Env vars (from .env.executive):
 *   NOTION_API_KEY            — Notion integration token
 *   NOTION_DATABASE_ID        — Agent Milestones database ID
 *   NOTION_E2E_PAGE_ID        — E2E Testing page ID (for appending blocks)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const NOTION_API_VERSION = '2022-06-28';

// ── Load env from .env.executive ────────────────────────────────────

function loadEnv() {
  const env = {};
  try {
    const content = readFileSync(resolve(ROOT, '.env.executive'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  } catch { /* ignore */ }
  return env;
}

const env = loadEnv();
const API_KEY = env.NOTION_API_KEY || '';
const DATABASE_ID = env.NOTION_DATABASE_ID || '';
const E2E_PAGE_ID = env.NOTION_E2E_PAGE_ID || '';
const DISPLAY_NAME = env.AGENT_DISPLAY_NAME || 'Agent';

const timestamp = new Date().toISOString();
let passed = 0;
let failed = 0;

function notionHeaders() {
  return {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_API_VERSION,
  };
}

// ── Test 1: Authenticate ────────────────────────────────────────────

async function testAuth() {
  console.log('\n--- Test 1: Notion API Authentication ---');

  if (!API_KEY) {
    console.log('FAIL: NOTION_API_KEY not set');
    failed++;
    return false;
  }

  const res = await fetch('https://api.notion.com/v1/users/me', {
    headers: notionHeaders(),
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`  Authenticated as: ${data.name || data.bot?.owner?.user?.name || 'Integration'} (${data.type})`);
    console.log('PASS: API authentication works');
    passed++;
    return true;
  } else {
    const text = await res.text();
    console.log(`FAIL: HTTP ${res.status} — ${text}`);
    failed++;
    return false;
  }
}

// ── Test 2: Append block to E2E Testing page ────────────────────────

async function testAppendBlock() {
  console.log('\n--- Test 2: Append Block to E2E Testing Page ---');

  if (!E2E_PAGE_ID) {
    console.log('SKIP: NOTION_E2E_PAGE_ID not set');
    return;
  }

  const res = await fetch(`https://api.notion.com/v1/blocks/${E2E_PAGE_ID}/children`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify({
      children: [
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '🧪' },
            rich_text: [
              { text: { content: `E2E test run by ${DISPLAY_NAME} at ${timestamp}` } },
            ],
          },
        },
      ],
    }),
  });

  if (res.ok) {
    console.log('PASS: Block appended to E2E Testing page');
    passed++;
  } else {
    const text = await res.text();
    console.log(`FAIL: HTTP ${res.status} — ${text}`);
    failed++;
  }
}

// ── Test 3: Insert milestone row ────────────────────────────────────

async function testInsertMilestone() {
  console.log('\n--- Test 3: Insert Milestone Row ---');

  if (!DATABASE_ID) {
    console.log('SKIP: NOTION_DATABASE_ID not set');
    return;
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { database_id: DATABASE_ID },
      properties: {
        Title: {
          title: [{ text: { content: `[E2E Test] ${DISPLAY_NAME} — ${timestamp}` } }],
        },
        Event: {
          select: { name: 'Started' },
        },
        Priority: {
          select: { name: 'P4' },
        },
        Timestamp: {
          date: { start: timestamp },
        },
      },
    }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`  Row created: ${data.id}`);
    console.log('PASS: Milestone row inserted');
    passed++;
  } else {
    const text = await res.text();
    console.log(`FAIL: HTTP ${res.status} — ${text}`);
    failed++;
  }
}

// ── Run ─────────────────────────────────────────────────────────────

console.log('=== Notion E2E Test ===');
console.log(`Timestamp: ${timestamp}`);
console.log(`Display name: ${DISPLAY_NAME}`);
console.log(`API key: ${API_KEY ? 'configured' : 'NOT SET'}`);
console.log(`Database ID: ${DATABASE_ID || 'NOT SET'}`);
console.log(`E2E Page ID: ${E2E_PAGE_ID || 'NOT SET'}`);

const authOk = await testAuth();
if (authOk) {
  await testAppendBlock();
  await testInsertMilestone();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
