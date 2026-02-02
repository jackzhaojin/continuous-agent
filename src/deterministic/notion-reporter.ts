/**
 * Notion Reporting - DETERMINISTIC
 * Fire-and-forget integration with Notion for milestone events and summaries.
 * Local ledgers remain the source of truth. Notion failures are logged and ignored.
 */

import { Client } from '@notionhq/client';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { WorkItem } from '../core/types.js';
import { logDeterministic, log, normalizeLedgerEvent } from '../core/logging.js';

// === CONFIGURATION ===
// Read env vars lazily (not at module load time) because this module is statically
// imported before dotenv config() runs in executive-loop.ts.
function getApiKey(): string | undefined { return process.env.NOTION_API_KEY; }
function getDatabaseId(): string | undefined { return process.env.NOTION_DATABASE_ID; }
function getMonthlyPageId(): string | undefined { return process.env.NOTION_MONTHLY_PAGE_ID; }
function isReportingEnabled(): boolean { return process.env.NOTION_REPORTING_ENABLED !== 'false'; }

let notionClient: Client | null = null;

function getNotionClient(): Client | null {
  if (!isReportingEnabled() || !getApiKey()) return null;
  if (!notionClient) {
    notionClient = new Client({ auth: getApiKey() });
  }
  return notionClient;
}

// === EVENT TYPES ===
type MilestoneEvent = 'Started' | 'Completed' | 'Failed' | 'Blocked' | 'Step Completed';

interface MilestoneExtra {
  outputPath?: string;
  errorSummary?: string;
  stepTitle?: string;
  stepNumber?: number;
}

// === MILESTONE REPORTING ===

/**
 * Report a milestone event to the Notion Milestones database.
 * Fire-and-forget: logs errors but never throws.
 * DETERMINISTIC: Mechanical API call with structured data.
 */
export async function reportMilestone(
  event: MilestoneEvent,
  workItem: WorkItem,
  contractId?: string,
  extra?: MilestoneExtra
): Promise<void> {
  try {
    const client = getNotionClient();
    if (!client || !getDatabaseId()) return;

    const properties: Record<string, unknown> = {
      Goal: {
        title: [{ text: { content: workItem.title } }],
      },
      Event: {
        select: { name: event },
      },
      Priority: {
        select: { name: workItem.priority },
      },
      Timestamp: {
        date: { start: new Date().toISOString() },
      },
    };

    if (extra?.stepTitle) {
      properties['Step'] = {
        rich_text: [{ text: { content: extra.stepTitle } }],
      };
    }

    if (contractId) {
      properties['Contract ID'] = {
        rich_text: [{ text: { content: contractId } }],
      };
    }

    if (extra?.outputPath) {
      properties['Output Path'] = {
        rich_text: [{ text: { content: extra.outputPath } }],
      };
    }

    if (extra?.errorSummary) {
      properties['Error Summary'] = {
        rich_text: [{ text: { content: extra.errorSummary.slice(0, 200) } }],
      };
    }

    await client.pages.create({
      parent: { database_id: getDatabaseId()! },
      properties: properties as Parameters<Client['pages']['create']>[0]['properties'],
    });

    const logTitle = extra?.stepTitle
      ? `${workItem.title} - ${extra.stepTitle}`
      : workItem.title;
    logDeterministic(`  Notion milestone reported: ${event} - ${logTitle}`);
  } catch (e) {
    log(`  Notion milestone report failed (non-blocking): ${e}`);
  }
}

// === MILESTONE CLOSURE ===

/**
 * Close a previously-reported "Started" milestone by adding an end date and duration.
 * Queries the Milestones DB for the Started row matching the given contractId,
 * then updates its Timestamp (date range) and Duration (minutes).
 *
 * Uses raw fetch against the Notion REST API (v2022-06-28) for the query step because
 * the SDK v5.8.0 maps database queries to the /data_sources/ endpoint which the Notion
 * API does not yet support. The update step uses the SDK's pages.update() which works fine.
 *
 * Fire-and-forget: logs errors but never throws.
 * DETERMINISTIC: Mechanical API call with structured data.
 */
export async function closeMilestone(contractId: string): Promise<void> {
  try {
    const client = getNotionClient();
    const dbId = getDatabaseId();
    const apiKey = getApiKey();
    if (!client || !dbId || !apiKey || !contractId) return;

    // Query for the Started row via raw REST API (SDK dataSources.query uses unsupported endpoint)
    const queryRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
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

    if (!queryRes.ok) {
      log(`  Notion milestone closure: query failed HTTP ${queryRes.status}`);
      return;
    }

    const queryData = (await queryRes.json()) as {
      results: Array<{
        id: string;
        properties: Record<string, unknown>;
      }>;
    };

    if (queryData.results.length === 0) {
      log(`  Notion milestone closure: no Started row found for ${contractId} (Notion may have been down at start)`);
      return;
    }

    const page = queryData.results[0];

    // Extract existing start timestamp from the page properties
    const timestampProp = page.properties['Timestamp'] as { date?: { start?: string } } | undefined;
    const existingStart = timestampProp?.date?.start;

    if (!existingStart) {
      log(`  Notion milestone closure: no start date found on Started row for ${contractId}`);
      return;
    }

    // Update the page with end date (Timestamp becomes a date range)
    const endTime = new Date().toISOString();

    await client.pages.update({
      page_id: page.id,
      properties: {
        Timestamp: {
          date: { start: existingStart, end: endTime },
        },
      } as Parameters<Client['pages']['update']>[0]['properties'],
    });

    logDeterministic(`  Notion milestone closed: ${contractId} (${existingStart} → ${endTime})`);
  } catch (e) {
    log(`  Notion milestone closure failed (non-blocking): ${e}`);
  }
}

// === LEDGER PARSING ===

interface LedgerEntry {
  event: string;
  ts: string;
  task_id?: string;
  goal_id?: string;
  title?: string;
  task_title?: string;
  goal_title?: string;
  contract_id?: string;
  output_path?: string;
  step_number?: number;
  step_title?: string;
  error?: string;
  capabilities?: string[];
  result?: string;
}

/**
 * Parse work-ledger.jsonl and return entries for a given date range.
 */
function parseLedgerEntries(content: string, startDate: string, endDate: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LedgerEntry;
      const entryDate = entry.ts?.split('T')[0];
      if (entryDate && entryDate >= startDate && entryDate <= endDate) {
        entries.push(entry);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Compute summary statistics from ledger entries.
 */
function computeStats(entries: LedgerEntry[]): {
  goalsStarted: number;
  goalsCompleted: number;
  goalsFailed: number;
  stepsCompleted: number;
  totalEntries: number;
  uniqueGoals: Set<string>;
} {
  let goalsStarted = 0;
  let goalsCompleted = 0;
  let goalsFailed = 0;
  let stepsCompleted = 0;
  const uniqueGoals = new Set<string>();

  for (const entry of entries) {
    const goalName = entry.title || entry.goal_title || entry.task_title || 'unknown';
    uniqueGoals.add(goalName);

    switch (normalizeLedgerEvent(entry.event)) {
      case 'GOAL_STARTED':
        goalsStarted++;
        break;
      case 'GOAL_COMPLETED':
        goalsCompleted++;
        break;
      case 'GOAL_FAILED':
        goalsFailed++;
        break;
      case 'STEP_COMPLETED':
        stepsCompleted++;
        break;
      case 'STEP_ATTEMPT_FAILED':
        goalsFailed++;
        break;
    }
  }

  return {
    goalsStarted,
    goalsCompleted,
    goalsFailed,
    stepsCompleted,
    totalEntries: entries.length,
    uniqueGoals,
  };
}

// === DAILY SUMMARY ===

/**
 * Generate and post a daily summary to the Notion monthly page.
 * Reads work-ledger.jsonl for today's entries and appends markdown blocks.
 * Fire-and-forget: logs errors but never throws.
 * DETERMINISTIC: Reads local ledger, formats data, posts to Notion.
 */
export async function reportDailySummary(ledgerDir: string): Promise<void> {
  try {
    const client = getNotionClient();
    if (!client || !getMonthlyPageId()) return;

    const today = new Date().toISOString().split('T')[0];
    const ledgerPath = path.join(ledgerDir, 'work-ledger.jsonl');

    if (!existsSync(ledgerPath)) {
      log('  Notion daily summary: no work-ledger.jsonl found');
      return;
    }

    const content = await readFile(ledgerPath, 'utf-8');
    const entries = parseLedgerEntries(content, today, today);

    if (entries.length === 0) {
      log('  Notion daily summary: no entries for today');
      return;
    }

    const stats = computeStats(entries);

    // Build markdown blocks for Notion
    const blocks = [
      {
        object: 'block' as const,
        type: 'heading_2' as const,
        heading_2: {
          rich_text: [{ type: 'text' as const, text: { content: `Daily Summary: ${today}` } }],
        },
      },
      {
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [
            {
              type: 'text' as const,
              text: {
                content: [
                  `Goals touched: ${stats.uniqueGoals.size}`,
                  `Goals started: ${stats.goalsStarted}`,
                  `Goals completed: ${stats.goalsCompleted}`,
                  `Steps completed: ${stats.stepsCompleted}`,
                  `Failures/retries: ${stats.goalsFailed}`,
                  `Total ledger entries: ${stats.totalEntries}`,
                ].join('\n'),
              },
            },
          ],
        },
      },
      {
        object: 'block' as const,
        type: 'divider' as const,
        divider: {},
      },
    ];

    // Add goal list
    const goalNames = Array.from(stats.uniqueGoals);
    if (goalNames.length > 0) {
      blocks.push({
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [
            {
              type: 'text' as const,
              text: {
                content: `Goals: ${goalNames.join(', ')}`,
              },
            },
          ],
        },
      } as typeof blocks[number]);
    }

    await client.blocks.children.append({
      block_id: getMonthlyPageId()!,
      children: blocks as Parameters<Client['blocks']['children']['append']>[0]['children'],
    });

    logDeterministic(`  Notion daily summary posted for ${today}`);
  } catch (e) {
    log(`  Notion daily summary failed (non-blocking): ${e}`);
  }
}

// === WEEKLY SUMMARY ===

/**
 * Generate and post a weekly summary as a child page under the monthly page.
 * Aggregates the past 7 days of work-ledger.jsonl data.
 * Fire-and-forget: logs errors but never throws.
 * DETERMINISTIC: Reads local ledger, formats data, posts to Notion.
 */
export async function reportWeeklySummary(ledgerDir: string): Promise<void> {
  try {
    const client = getNotionClient();
    if (!client || !getMonthlyPageId()) return;

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    const startDateObj = new Date(now);
    startDateObj.setDate(startDateObj.getDate() - 7);
    const startDate = startDateObj.toISOString().split('T')[0];

    const ledgerPath = path.join(ledgerDir, 'work-ledger.jsonl');

    if (!existsSync(ledgerPath)) {
      log('  Notion weekly summary: no work-ledger.jsonl found');
      return;
    }

    const content = await readFile(ledgerPath, 'utf-8');
    const entries = parseLedgerEntries(content, startDate, endDate);

    if (entries.length === 0) {
      log('  Notion weekly summary: no entries for this week');
      return;
    }

    const stats = computeStats(entries);

    // Create a child page under the monthly page
    const pageTitle = `Weekly Summary: ${startDate} to ${endDate}`;

    const children = [
      {
        object: 'block' as const,
        type: 'heading_2' as const,
        heading_2: {
          rich_text: [{ type: 'text' as const, text: { content: 'Overview' } }],
        },
      },
      {
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [
            {
              type: 'text' as const,
              text: {
                content: [
                  `Period: ${startDate} to ${endDate}`,
                  `Unique goals touched: ${stats.uniqueGoals.size}`,
                  `Goals started: ${stats.goalsStarted}`,
                  `Goals completed: ${stats.goalsCompleted}`,
                  `Steps completed: ${stats.stepsCompleted}`,
                  `Failures/retries: ${stats.goalsFailed}`,
                  `Total ledger entries: ${stats.totalEntries}`,
                ].join('\n'),
              },
            },
          ],
        },
      },
      {
        object: 'block' as const,
        type: 'divider' as const,
        divider: {},
      },
    ];

    // Add goal breakdown
    const goalNames = Array.from(stats.uniqueGoals);
    if (goalNames.length > 0) {
      children.push({
        object: 'block' as const,
        type: 'heading_2' as const,
        heading_2: {
          rich_text: [{ type: 'text' as const, text: { content: 'Goals Worked On' } }],
        },
      } as typeof children[number]);

      for (const goalName of goalNames) {
        const goalEntries = entries.filter(
          (e) => (e.title || e.goal_title || e.task_title) === goalName
        );
        const completed = goalEntries.some((e) =>
          normalizeLedgerEvent(e.event) === 'GOAL_COMPLETED'
        );
        const status = completed ? 'Completed' : 'In Progress';

        children.push({
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [
              {
                type: 'text' as const,
                text: {
                  content: `- ${goalName} [${status}]`,
                },
              },
            ],
          },
        } as typeof children[number]);
      }
    }

    await client.pages.create({
      parent: { page_id: getMonthlyPageId()! },
      properties: {
        title: {
          title: [{ text: { content: pageTitle } }],
        },
      },
      children: children as Parameters<Client['pages']['create']>[0]['children'],
    });

    logDeterministic(`  Notion weekly summary posted: ${pageTitle}`);
  } catch (e) {
    log(`  Notion weekly summary failed (non-blocking): ${e}`);
  }
}
