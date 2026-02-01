#!/usr/bin/env npx tsx
/**
 * Backfill Notion Milestones database from historical work-ledger.jsonl data.
 *
 * Reads all entries from work-ledger.jsonl and creates corresponding rows in the
 * Agent Milestones database. This is a one-time script for importing data that
 * was generated before Notion reporting was wired up.
 *
 * Usage:
 *   npx tsx tests/adhoc/backfill-notion-from-ledger.ts                # Dry run (preview only)
 *   npx tsx tests/adhoc/backfill-notion-from-ledger.ts --execute      # Actually write to Notion
 *
 * Rate limit: Notion allows ~3 requests/sec. Script adds 400ms delay between writes.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const LEDGER_PATH = path.join(PROJECT_ROOT, 'ledgers', 'work-ledger.jsonl');

const EXECUTE = process.argv.includes('--execute');

// ── Load .env ──────────────────────────────────────────────────────────────

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

if (!API_KEY) { console.error('NOTION_API_KEY not found'); process.exit(1); }
if (!DATABASE_ID) { console.error('NOTION_DATABASE_ID not found'); process.exit(1); }

// ── Event mapping ──────────────────────────────────────────────────────────

// Map ledger events to Notion milestone events (supports both old TASK_ and new GOAL_ prefixes)
const EVENT_MAP: Record<string, string> = {
  TASK_STARTED: 'Started',
  GOAL_STARTED: 'Started',
  TASK_COMPLETED: 'Completed',
  GOAL_COMPLETED: 'Completed',
  TASK_ATTEMPT_FAILED: 'Failed',
  GOAL_ATTEMPT_FAILED: 'Failed',
  STEP_ATTEMPT_FAILED: 'Failed',
  TASK_BLOCKED: 'Blocked',
  GOAL_BLOCKED: 'Blocked',
  STEP_COMPLETED: 'Step Completed',
};

// Events we skip (not milestone-worthy)
const SKIP_EVENTS = new Set([
  'TASK_BREAKDOWN',
  'STEP_STARTED',
  'GOAL_PROMOTED',
  'HUMAN_INPUT_RECEIVED',
  'SYSTEM_UPGRADE',
]);

// ── Parse ledger ───────────────────────────────────────────────────────────

interface LedgerEntry {
  event: string;
  ts: string;
  task_id?: string;
  title?: string;
  task_title?: string;
  contract_id?: string | null;
  output_path?: string;
  step_number?: number;
  step_title?: string;
  error?: string;
  last_error?: string;
  attempt?: number;
  total_attempts?: number;
}

function parseLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER_PATH)) {
    console.error(`Ledger not found: ${LEDGER_PATH}`);
    process.exit(1);
  }

  const entries: LedgerEntry[] = [];
  const lines = readFileSync(LEDGER_PATH, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('{') === false) continue;
    try {
      entries.push(JSON.parse(trimmed) as LedgerEntry);
    } catch {
      // Skip malformed
    }
  }

  return entries;
}

// ── Build Notion row ───────────────────────────────────────────────────────

interface NotionRow {
  title: string;
  event: string;
  priority: string;
  timestamp: string;
  duration: number;
  contractId: string;
  outputPath: string;
  errorSummary: string;
}

function entryToRow(entry: LedgerEntry): NotionRow | null {
  const notionEvent = EVENT_MAP[entry.event];
  if (!notionEvent) return null;

  const taskTitle = entry.title || entry.goal_title || entry.task_title || 'Unknown Task';
  const title = entry.step_title
    ? `${taskTitle} - ${entry.step_title}`
    : taskTitle;

  // Infer priority from task_id pattern or default to P3
  // (ledger doesn't store priority directly for most events)
  const priority = 'P3';

  const errorMsg = entry.error || entry.last_error || '';

  return {
    title,
    event: notionEvent,
    priority,
    timestamp: entry.ts,
    duration: 0,
    contractId: entry.contract_id || '',
    outputPath: entry.output_path || '',
    errorSummary: errorMsg.slice(0, 200),
  };
}

// ── Write to Notion ────────────────────────────────────────────────────────

async function writeRow(row: NotionRow): Promise<boolean> {
  const properties: Record<string, unknown> = {
    Title: { title: [{ text: { content: row.title } }] },
    Event: { select: { name: row.event } },
    Priority: { select: { name: row.priority } },
    Timestamp: { date: { start: row.timestamp } },
    Duration: { number: row.duration },
  };

  if (row.contractId) {
    properties['Contract ID'] = { rich_text: [{ text: { content: row.contractId } }] };
  }
  if (row.outputPath) {
    properties['Output Path'] = { rich_text: [{ text: { content: row.outputPath } }] };
  }
  if (row.errorSummary) {
    properties['Error Summary'] = { rich_text: [{ text: { content: row.errorSummary } }] };
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: DATABASE_ID },
      properties,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  FAIL (HTTP ${res.status}): ${body.slice(0, 200)}`);
    return false;
  }

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Notion Backfill from work-ledger.jsonl            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (writing to Notion)' : 'DRY RUN (preview only)'}`);
  console.log('');

  const entries = parseLedger();
  console.log(`Ledger entries: ${entries.length}`);

  // Filter to milestone-worthy events
  const rows: NotionRow[] = [];
  let skipped = 0;
  let unmapped = 0;

  for (const entry of entries) {
    if (SKIP_EVENTS.has(entry.event)) {
      skipped++;
      continue;
    }

    const row = entryToRow(entry);
    if (row) {
      rows.push(row);
    } else {
      unmapped++;
      console.log(`  Unmapped event: ${entry.event}`);
    }
  }

  console.log(`Milestone rows to write: ${rows.length}`);
  console.log(`Skipped (non-milestone): ${skipped}`);
  if (unmapped > 0) console.log(`Unmapped events: ${unmapped}`);
  console.log('');

  // Preview
  const eventCounts: Record<string, number> = {};
  const dateCounts: Record<string, number> = {};
  for (const row of rows) {
    eventCounts[row.event] = (eventCounts[row.event] || 0) + 1;
    const date = row.timestamp.split('T')[0];
    dateCounts[date] = (dateCounts[date] || 0) + 1;
  }

  console.log('By event type:');
  for (const [event, count] of Object.entries(eventCounts).sort()) {
    console.log(`  ${event}: ${count}`);
  }
  console.log('');

  console.log('By date:');
  for (const [date, count] of Object.entries(dateCounts).sort()) {
    console.log(`  ${date}: ${count}`);
  }
  console.log('');

  if (!EXECUTE) {
    console.log('--- DRY RUN COMPLETE ---');
    console.log('Run with --execute to write to Notion.');
    console.log(`Estimated time: ~${Math.ceil(rows.length * 0.4)}s (400ms rate limit per write)`);
    return;
  }

  // Execute
  let written = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;
    process.stdout.write(`${progress} ${row.event.padEnd(15)} ${row.title.slice(0, 50)}... `);

    const ok = await writeRow(row);
    if (ok) {
      written++;
      console.log('OK');
    } else {
      failed++;
    }

    // Rate limit: 400ms between writes (~2.5 req/s, under Notion's 3/s limit)
    if (i < rows.length - 1) {
      await sleep(400);
    }
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Written: ${written}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${rows.length}`);
  console.log('═'.repeat(60));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
