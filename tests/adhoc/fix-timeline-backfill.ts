#!/usr/bin/env npx tsx
/**
 * Fix timeline view: Update all existing milestone rows to use date ranges
 * on the Timestamp property (start + end), and remove the Duration column.
 *
 * For each task, computes duration from first STEP_STARTED/TASK_STARTED to
 * last STEP_COMPLETED/TASK_COMPLETED in the ledger, then updates the
 * corresponding Notion rows.
 *
 * Also removes the Duration property from the database schema.
 *
 * Usage:
 *   npx tsx tests/adhoc/fix-timeline-backfill.ts              # Dry run
 *   npx tsx tests/adhoc/fix-timeline-backfill.ts --execute     # Write to Notion
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const LEDGER_PATH = path.join(PROJECT_ROOT, 'ledgers', 'work-ledger.jsonl');

const EXECUTE = process.argv.includes('--execute');

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
const API_KEY = env.NOTION_API_KEY!;
const DATABASE_ID = env.NOTION_DATABASE_ID!;
const API_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Compute task durations from ledger ─────────────────────────────────────

interface TaskTiming {
  firstEvent: string;  // ISO timestamp
  lastEvent: string;   // ISO timestamp
  durationMin: number;
}

function computeTaskTimings(): Map<string, TaskTiming> {
  const taskEvents = new Map<string, string[]>(); // title -> [timestamps]

  const content = readFileSync(LEDGER_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const e = JSON.parse(trimmed) as Record<string, unknown>;
      const event = e.event as string;
      const ts = e.ts as string;
      const title = (e.title || e.task_title || '') as string;
      const stepTitle = (e.step_title || '') as string;

      if (!title || !ts) continue;

      // We care about events that mark start/end of work
      if (!['TASK_STARTED', 'TASK_COMPLETED', 'STEP_STARTED', 'STEP_COMPLETED',
            'TASK_ATTEMPT_FAILED', 'STEP_ATTEMPT_FAILED', 'TASK_BLOCKED'].includes(event)) continue;

      // Build the full title as it appears in Notion
      const notionTitle = stepTitle ? `${title} - ${stepTitle}` : title;

      if (!taskEvents.has(notionTitle)) taskEvents.set(notionTitle, []);
      taskEvents.get(notionTitle)!.push(ts);

      // Also track at the parent task level
      if (stepTitle) {
        if (!taskEvents.has(title)) taskEvents.set(title, []);
        taskEvents.get(title)!.push(ts);
      }
    } catch { /* skip */ }
  }

  const timings = new Map<string, TaskTiming>();
  for (const [title, timestamps] of taskEvents) {
    timestamps.sort();
    const first = timestamps[0];
    const last = timestamps[timestamps.length - 1];
    const dur = (new Date(last).getTime() - new Date(first).getTime()) / 60000;
    timings.set(title, { firstEvent: first, lastEvent: last, durationMin: Math.round(dur) });
  }

  return timings;
}

// ── Query all rows from Notion database ────────────────────────────────────

interface NotionPage {
  id: string;
  title: string;
  timestamp: string;
  event: string;
}

async function queryAllRows(): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${BASE_URL}/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`Query failed: HTTP ${res.status}`);
      break;
    }

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        properties: Record<string, unknown>;
      }>;
      has_more: boolean;
      next_cursor?: string;
    };

    for (const page of data.results) {
      const props = page.properties as Record<string, { type: string; title?: Array<{ plain_text: string }>; date?: { start: string }; select?: { name: string } }>;

      const titleProp = props['Title'];
      const title = titleProp?.title?.[0]?.plain_text || '';
      const timestamp = (props['Timestamp'] as { date?: { start: string } })?.date?.start || '';
      const event = (props['Event'] as { select?: { name: string } })?.select?.name || '';

      pages.push({ id: page.id, title, timestamp, event });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    await sleep(350);
  } while (cursor);

  return pages;
}

// ── Update a row's Timestamp to a date range ───────────────────────────────

async function updateTimestamp(pageId: string, start: string, end: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': API_VERSION,
    },
    body: JSON.stringify({
      properties: {
        Timestamp: {
          date: { start, end: end !== start ? end : null },
        },
      },
    }),
  });

  return res.ok;
}

// ── Remove Duration property from database ─────────────────────────────────

async function removeDurationProperty(): Promise<boolean> {
  // Notion API doesn't support deleting properties directly via the database update endpoint
  // with API version 2022-06-28. We need to use a workaround or just leave it.
  // Actually, setting a property to null in the update payload removes it.
  const res = await fetch(`${BASE_URL}/databases/${DATABASE_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': API_VERSION,
    },
    body: JSON.stringify({
      properties: {
        Duration: null,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to remove Duration: HTTP ${res.status} - ${text.slice(0, 200)}`);
    return false;
  }
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Fix Timeline: Add Date Ranges + Remove Duration   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}\n`);

  // Step 1: Compute timings from ledger
  console.log('1. Computing task timings from ledger...');
  const timings = computeTaskTimings();
  console.log(`   Found timings for ${timings.size} unique titles\n`);

  // Step 2: Query all rows from Notion
  console.log('2. Querying all rows from Notion...');
  const pages = await queryAllRows();
  console.log(`   Found ${pages.length} rows\n`);

  // Step 3: Match and compute end dates
  console.log('3. Matching rows to timings...');
  let matched = 0;
  let unmatched = 0;
  const updates: Array<{ pageId: string; title: string; start: string; end: string }> = [];

  for (const page of pages) {
    // For individual events (Started, Completed, Failed, etc.), use the event's own timestamp
    // as start, and find the end from the task's overall timing
    const timing = timings.get(page.title);

    if (timing && timing.durationMin > 0) {
      // For "Started" events: start = event timestamp, end = task's last event
      // For "Completed" events: start = task's first event, end = event timestamp
      // For "Step Completed": start = event timestamp, end = event timestamp + proportional duration
      // For "Failed": just the point in time (no range)

      let start = page.timestamp;
      let end = page.timestamp;

      if (page.event === 'Started') {
        end = timing.lastEvent;
      } else if (page.event === 'Completed') {
        start = timing.firstEvent;
        end = page.timestamp;
      } else if (page.event === 'Step Completed') {
        // Use this step's timing if available
        const stepTiming = timings.get(page.title);
        if (stepTiming) {
          start = stepTiming.firstEvent;
          end = stepTiming.lastEvent;
        }
      }
      // Failed/Blocked: leave as point-in-time (start = end)

      updates.push({ pageId: page.id, title: page.title, start, end });
      matched++;
    } else {
      unmatched++;
    }
  }

  console.log(`   Matched: ${matched}, Unmatched (point-in-time): ${unmatched}\n`);

  // Preview some updates
  console.log('Sample updates:');
  for (const u of updates.slice(0, 5)) {
    const durMin = Math.round((new Date(u.end).getTime() - new Date(u.start).getTime()) / 60000);
    console.log(`   ${u.title.slice(0, 50).padEnd(50)} ${durMin}min`);
  }
  console.log('   ...\n');

  if (!EXECUTE) {
    console.log('--- DRY RUN COMPLETE ---');
    console.log(`Would update ${updates.length} rows and remove Duration property.`);
    console.log(`Estimated time: ~${Math.ceil(updates.length * 0.4)}s`);
    return;
  }

  // Step 4: Update rows
  console.log('4. Updating Notion rows...');
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    process.stdout.write(`   [${i + 1}/${updates.length}] ${u.title.slice(0, 45)}... `);

    const ok = await updateTimestamp(u.pageId, u.start, u.end);
    if (ok) {
      updated++;
      console.log('OK');
    } else {
      failed++;
      console.log('FAIL');
    }
    await sleep(400);
  }

  console.log(`\n   Updated: ${updated}, Failed: ${failed}\n`);

  // Step 5: Remove Duration property
  console.log('5. Removing Duration property from database...');
  const removed = await removeDurationProperty();
  console.log(`   ${removed ? 'OK — Duration property removed' : 'FAILED — may need manual removal'}\n`);

  console.log('═'.repeat(60));
  console.log('DONE');
  console.log('═'.repeat(60));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
