#!/usr/bin/env npx tsx
/**
 * Creates a retroactive "Agent Summaries — January 2026" page with daily
 * summaries and a weekly summary, based on work-ledger.jsonl data.
 *
 * Usage:
 *   npx tsx tests/adhoc/create-january-summary.ts
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const LEDGER_PATH = path.join(PROJECT_ROOT, 'ledgers', 'work-ledger.jsonl');

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
// Parent = Agent Dashboard page
const DASHBOARD_PAGE_ID = '2fa321bd663180c185e2dd402b1bb3ed';
const API_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';

if (!API_KEY) { console.error('NOTION_API_KEY not found'); process.exit(1); }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionPost(endpoint: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': API_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function notionPatch(endpoint: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': API_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ── Parse ledger ───────────────────────────────────────────────────────────

interface DayStats {
  started: number;
  completed: number;
  failed: number;
  stepCompleted: number;
  blocked: number;
  tasks: Set<string>;
  completedTasks: Set<string>;
  entries: number;
}

function parseLedgerByDay(): Map<string, DayStats> {
  const days = new Map<string, DayStats>();

  const content = readFileSync(LEDGER_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith('{')) continue;

    let entry: Record<string, unknown>;
    try { entry = JSON.parse(trimmed); } catch { continue; }

    const ts = (entry.ts as string) || '';
    const date = ts.slice(0, 10);
    if (!date.startsWith('2026-01')) continue;

    if (!days.has(date)) {
      days.set(date, { started: 0, completed: 0, failed: 0, stepCompleted: 0, blocked: 0, tasks: new Set(), completedTasks: new Set(), entries: 0 });
    }
    const day = days.get(date)!;
    day.entries++;

    const taskName = (entry.title || (entry as Record<string, unknown>).goal_title || entry.task_title || '') as string;
    if (taskName) day.tasks.add(taskName);

    const event = entry.event as string;
    switch (event) {
      case 'TASK_STARTED': case 'GOAL_STARTED': day.started++; break;
      case 'TASK_COMPLETED': case 'GOAL_COMPLETED': day.completed++; if (taskName) day.completedTasks.add(taskName); break;
      case 'TASK_ATTEMPT_FAILED': case 'GOAL_ATTEMPT_FAILED': case 'STEP_ATTEMPT_FAILED': day.failed++; break;
      case 'STEP_COMPLETED': day.stepCompleted++; break;
      case 'TASK_BLOCKED': case 'GOAL_BLOCKED': day.blocked++; break;
    }
  }

  return days;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Creating "Agent Summaries — January 2026" page...\n');

  const days = parseLedgerByDay();
  const sortedDates = Array.from(days.keys()).sort();

  // Compute monthly totals
  let totalStarted = 0, totalCompleted = 0, totalFailed = 0, totalSteps = 0, totalBlocked = 0, totalEntries = 0;
  const allTasks = new Set<string>();
  const allCompletedTasks = new Set<string>();

  for (const [, stats] of days) {
    totalStarted += stats.started;
    totalCompleted += stats.completed;
    totalFailed += stats.failed;
    totalSteps += stats.stepCompleted;
    totalBlocked += stats.blocked;
    totalEntries += stats.entries;
    for (const t of stats.tasks) allTasks.add(t);
    for (const t of stats.completedTasks) allCompletedTasks.add(t);
  }

  // Step 1: Create the January summaries page
  const pageResult = await notionPost('/pages', {
    parent: { page_id: DASHBOARD_PAGE_ID },
    properties: {
      title: { title: [{ text: { content: 'Agent Summaries — January 2026' } }] },
    },
    children: [
      {
        object: 'block', type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: 'Agent Summaries — January 2026' } }] },
      },
      {
        object: 'block', type: 'callout',
        callout: {
          rich_text: [{ type: 'text', text: { content: 'Retroactively generated from work-ledger.jsonl on 2026-02-01. This covers the agent\'s first operational days (Jan 25-29, 2026).' } }],
          icon: { type: 'emoji', emoji: '📊' },
        },
      },
      {
        object: 'block', type: 'divider', divider: {},
      },
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Monthly Overview' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text', text: {
              content: [
                `Active days: ${sortedDates.length} (${sortedDates.join(', ')})`,
                `Unique tasks touched: ${allTasks.size}`,
                `Tasks completed: ${totalCompleted}`,
                `Steps completed: ${totalSteps}`,
                `Failures/retries: ${totalFailed}`,
                `Tasks blocked: ${totalBlocked}`,
                `Total ledger entries: ${totalEntries}`,
              ].join('\n'),
            },
          }],
        },
      },
      {
        object: 'block', type: 'divider', divider: {},
      },
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Tasks Completed' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text', text: {
              content: Array.from(allCompletedTasks).sort().map(t => `- ${t}`).join('\n') || '(none)',
            },
          }],
        },
      },
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'All Tasks Touched' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text', text: {
              content: Array.from(allTasks).sort().map(t => {
                const completed = allCompletedTasks.has(t);
                return `- ${t} [${completed ? 'Completed' : 'In Progress/Blocked'}]`;
              }).join('\n'),
            },
          }],
        },
      },
      {
        object: 'block', type: 'divider', divider: {},
      },
    ],
  });

  const pageId = (pageResult.id as string);
  const pageUrl = pageResult.url as string;
  console.log(`Page created: ${pageUrl}\n`);
  await sleep(400);

  // Step 2: Append daily summaries
  for (const date of sortedDates) {
    const stats = days.get(date)!;
    console.log(`Appending daily summary for ${date}...`);

    const taskList = Array.from(stats.tasks).sort();
    const completedList = Array.from(stats.completedTasks);

    await notionPatch(`/blocks/${pageId}/children`, {
      children: [
        {
          object: 'block', type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: `Daily Summary: ${date}` } }] },
        },
        {
          object: 'block', type: 'paragraph',
          paragraph: {
            rich_text: [{
              type: 'text', text: {
                content: [
                  `Tasks touched: ${stats.tasks.size}`,
                  `Tasks started: ${stats.started}`,
                  `Tasks completed: ${stats.completed}${completedList.length > 0 ? ` (${completedList.join(', ')})` : ''}`,
                  `Steps completed: ${stats.stepCompleted}`,
                  `Failures/retries: ${stats.failed}`,
                  `Tasks blocked: ${stats.blocked}`,
                  `Total ledger entries: ${stats.entries}`,
                ].join('\n'),
              },
            }],
          },
        },
        {
          object: 'block', type: 'paragraph',
          paragraph: {
            rich_text: [{
              type: 'text', text: { content: `Tasks: ${taskList.join(', ')}` },
            }],
          },
        },
        {
          object: 'block', type: 'divider', divider: {},
        },
      ],
    });

    await sleep(400);
  }

  // Step 3: Create weekly summary as child page
  console.log('\nCreating weekly summary child page...');
  const weeklyResult = await notionPost('/pages', {
    parent: { page_id: pageId },
    properties: {
      title: { title: [{ text: { content: 'Weekly Summary: 2026-01-25 to 2026-01-31' } }] },
    },
    children: [
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Overview' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text', text: {
              content: [
                'Period: 2026-01-25 to 2026-01-31',
                `Active days: ${sortedDates.filter(d => d >= '2026-01-25' && d <= '2026-01-31').length}`,
                `Unique tasks touched: ${allTasks.size}`,
                `Tasks started: ${totalStarted}`,
                `Tasks completed: ${totalCompleted}`,
                `Steps completed: ${totalSteps}`,
                `Failures/retries: ${totalFailed}`,
                `Total ledger entries: ${totalEntries}`,
              ].join('\n'),
            },
          }],
        },
      },
      {
        object: 'block', type: 'divider', divider: {},
      },
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Narrative' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text', text: {
              content: [
                'The agent\'s first operational week. Day 1 (Jan 25) was rough — the Build Next.js task hit max retries and got blocked after 19 failures. The Notion Integration POC also struggled with repeated step failures.',
                '',
                'Day 2 (Jan 26) was a breakthrough — the agent completed 3 tasks: Notion Integration POC, Self-Enhance Human Interface, and POC New Capabilities. The self-enhancement pipeline worked end-to-end for the first time.',
                '',
                'Day 3 (Jan 29) showed the agent hitting its stride — completed the Full-Stack Conversational Chat Application and Retro Analytics Dashboard, both multi-step tasks executed cleanly. Started work on Music Player and Recipe Discovery platforms.',
              ].join('\n'),
            },
          }],
        },
      },
      {
        object: 'block', type: 'divider', divider: {},
      },
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Tasks Worked On' } }] },
      },
      {
        object: 'block', type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text', text: {
              content: Array.from(allTasks).sort().map(t => {
                const completed = allCompletedTasks.has(t);
                return `- ${t} [${completed ? 'Completed' : 'In Progress'}]`;
              }).join('\n'),
            },
          }],
        },
      },
    ],
  });

  console.log(`Weekly summary: ${weeklyResult.url}`);

  console.log('\n--- DONE ---');
  console.log(`\nJanuary summaries page: ${pageUrl}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
