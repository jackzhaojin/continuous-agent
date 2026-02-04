#!/usr/bin/env npx tsx
/**
 * setup-notion-workspace.ts
 *
 * Automates the Notion workspace setup described in:
 *   ai-docs/v1/2026-01-28-v1.2/notion-setup-steps.md
 *
 * Creates:
 *   1. "Agent Milestones" database with all required properties and select options
 *   2. "Agent Summaries — {Month} {Year}" page with initial content
 *
 * CANNOT automate (must be done manually in Notion UI):
 *   - Granting integration access/connections to the parent page
 *   - Creating database views (table sort, board grouping, filtered views)
 *
 * Prerequisites:
 *   - NOTION_API_KEY in .env.executive (with an integration that has Read + Update + Insert content capabilities)
 *   - The integration must already be connected to the PARENT PAGE (done via Notion UI)
 *   - Node.js 18+ (for native fetch)
 *
 * Usage:
 *   npm install                                          # Install dependencies first
 *   npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID>
 *
 * The PARENT_PAGE_ID is the Notion page under which the database and summaries page
 * will be created. Find it in the page URL:
 *   https://www.notion.so/workspace/Page-Name-<PAGE_ID>
 *
 * After running, the script outputs the env vars to add to .env.executive.
 * Use --write-env to automatically append them.
 *
 *   npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> --write-env
 *
 * API Version: Uses Notion API 2022-06-28 (legacy, simpler format).
 * This avoids the initial_data_source nesting required by 2025-09-03.
 * The 2022-06-28 version is still fully supported by Notion's API.
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Configuration ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATHS = [path.join(PROJECT_ROOT, '.env.executive'), path.join(PROJECT_ROOT, '.env')];
const NOTION_API_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';

// ── Load .env manually (avoid dotenv import issues with tsx) ─────────────────

function loadEnv(): { env: Record<string, string>; sourcePath: string | null } {
  const env: Record<string, string> = {};
  const envPath = ENV_PATHS.find((candidate) => existsSync(candidate)) ?? null;
  if (!envPath) return { env, sourcePath: null };

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return { env, sourcePath: envPath };
}

// ── Notion API helpers ───────────────────────────────────────────────────────

async function notionRequest(
  endpoint: string,
  method: string,
  body: unknown,
  apiKey: string
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${NOTION_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

// ── Database creation ────────────────────────────────────────────────────────

/**
 * Creates the "Agent Milestones" database with all required properties.
 *
 * Properties match what notion-reporter.ts expects:
 *   - Title (title) — task name
 *   - Event (select) — Started, Completed, Failed, Blocked, Step Completed
 *   - Priority (select) — P0 through P4
 *   - Timestamp (date) — when the event occurred
 *   - Duration (number) — minutes
 *   - Contract ID (rich_text) — links to worker log
 *   - Output Path (rich_text) — project directory path
 *   - Error Summary (rich_text) — first 200 chars of error
 */
async function createMilestonesDatabase(
  parentPageId: string,
  apiKey: string
): Promise<{ id: string }> {
  console.log('\n📦 Creating "Agent Milestones" database...');

  const payload = {
    parent: {
      type: 'page_id',
      page_id: parentPageId,
    },
    title: [
      {
        type: 'text',
        text: { content: 'Agent Milestones' },
      },
    ],
    is_inline: false,
    properties: {
      // Title is the default title property (every database has one)
      Title: {
        title: {},
      },
      Event: {
        select: {
          options: [
            { name: 'Started', color: 'blue' },
            { name: 'Completed', color: 'green' },
            { name: 'Failed', color: 'red' },
            { name: 'Blocked', color: 'orange' },
            { name: 'Step Completed', color: 'purple' },
          ],
        },
      },
      Priority: {
        select: {
          options: [
            { name: 'P0', color: 'red' },
            { name: 'P1', color: 'orange' },
            { name: 'P2', color: 'yellow' },
            { name: 'P3', color: 'blue' },
            { name: 'P4', color: 'gray' },
          ],
        },
      },
      Timestamp: {
        date: {},
      },
      Duration: {
        number: {
          format: 'number',
        },
      },
      'Contract ID': {
        rich_text: {},
      },
      'Output Path': {
        rich_text: {},
      },
      'Error Summary': {
        rich_text: {},
      },
    },
  };

  const result = await notionRequest('/databases', 'POST', payload, apiKey);

  if (!result.ok) {
    console.error('Failed to create database:', JSON.stringify(result.data, null, 2));
    if (result.status === 403) {
      console.error(
        '\nHTTP 403: The integration lacks access to the parent page.',
        '\n  1. Open the parent page in Notion',
        '\n  2. Click "..." menu > "Connections"',
        '\n  3. Add your integration',
        '\n  4. Re-run this script'
      );
    }
    if (result.status === 400) {
      console.error(
        '\nHTTP 400: Bad request. This may mean:',
        '\n  - The parent page ID is invalid',
        '\n  - The API version mismatch (this script uses 2022-06-28)',
        '\n  - A property name conflict'
      );
    }
    process.exit(1);
  }

  const databaseId = result.data.id as string;
  console.log(`  Database created: ${databaseId}`);
  console.log(`  URL: ${result.data.url}`);
  return { id: databaseId };
}

// ── Summaries page creation ──────────────────────────────────────────────────

/**
 * Creates the "Agent Summaries — {Month} {Year}" page with initial content.
 *
 * The agent's reportDailySummary() and reportWeeklySummary() append blocks to
 * this page. Daily summaries are heading_2 + paragraph blocks appended directly.
 * Weekly summaries are child pages created underneath.
 */
async function createSummariesPage(
  parentPageId: string,
  apiKey: string
): Promise<{ id: string }> {
  const now = new Date();
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
  const pageTitle = `Agent Summaries — ${monthName} ${year}`;

  console.log(`\n📄 Creating "${pageTitle}" page...`);

  const payload = {
    parent: {
      type: 'page_id',
      page_id: parentPageId,
    },
    properties: {
      title: {
        title: [
          {
            type: 'text',
            text: { content: pageTitle },
          },
        ],
      },
    },
    children: [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [
            {
              type: 'text',
              text: { content: pageTitle },
            },
          ],
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
                content:
                  'Daily and weekly summaries auto-generated by the executive agent.',
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
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: [
                  'How this page works:',
                  '• Daily summaries are appended as ## headings with stats',
                  '• Weekly summaries are created as child pages underneath',
                  '• Local JSONL ledgers remain the source of truth',
                ].join('\n'),
              },
            },
          ],
          icon: { type: 'emoji', emoji: '📊' },
        },
      },
    ],
  };

  const result = await notionRequest('/pages', 'POST', payload, apiKey);

  if (!result.ok) {
    console.error('Failed to create summaries page:', JSON.stringify(result.data, null, 2));
    if (result.status === 403) {
      console.error(
        '\nHTTP 403: The integration lacks access to the parent page.',
        '\n  See instructions above for granting access.'
      );
    }
    process.exit(1);
  }

  const pageId = result.data.id as string;
  console.log(`  Page created: ${pageId}`);
  console.log(`  URL: ${result.data.url}`);
  return { id: pageId };
}

// ── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify the database was created correctly by querying it and checking properties.
 */
async function verifyDatabase(
  databaseId: string,
  apiKey: string
): Promise<boolean> {
  console.log('\n🔍 Verifying database schema...');

  const response = await fetch(`${NOTION_BASE_URL}/databases/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_API_VERSION,
    },
  });

  if (!response.ok) {
    console.error('  Failed to retrieve database for verification');
    return false;
  }

  const data = (await response.json()) as Record<string, unknown>;
  const properties = data.properties as Record<string, { type: string }> | undefined;

  if (!properties) {
    console.error('  No properties found in database response');
    return false;
  }

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

  let allGood = true;
  for (const [name, expectedType] of Object.entries(expected)) {
    const prop = properties[name];
    if (!prop) {
      console.error(`  MISSING property: ${name}`);
      allGood = false;
    } else if (prop.type !== expectedType) {
      console.error(`  WRONG TYPE for ${name}: expected ${expectedType}, got ${prop.type}`);
      allGood = false;
    } else {
      console.log(`  ✓ ${name} (${expectedType})`);
    }
  }

  return allGood;
}

/**
 * Verify the summaries page exists and is accessible.
 */
async function verifyPage(
  pageId: string,
  apiKey: string
): Promise<boolean> {
  console.log('\n🔍 Verifying summaries page...');

  const response = await fetch(`${NOTION_BASE_URL}/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_API_VERSION,
    },
  });

  if (!response.ok) {
    console.error('  Failed to retrieve page for verification');
    return false;
  }

  const data = (await response.json()) as Record<string, unknown>;
  console.log(`  ✓ Page accessible: ${data.url}`);
  return true;
}

// ── Insert a test row (optional smoke test) ──────────────────────────────────

/**
 * Insert a test milestone row to verify the database schema works end-to-end.
 * This mirrors what notion-reporter.ts does in production.
 */
async function insertTestRow(
  databaseId: string,
  apiKey: string
): Promise<void> {
  console.log('\n🧪 Inserting test milestone row...');

  const payload = {
    parent: {
      database_id: databaseId,
    },
    properties: {
      Title: {
        title: [{ text: { content: '[Test] Setup Verification' } }],
      },
      Event: {
        select: { name: 'Started' },
      },
      Priority: {
        select: { name: 'P3' },
      },
      Timestamp: {
        date: { start: new Date().toISOString() },
      },
      Duration: {
        number: 0,
      },
      'Contract ID': {
        rich_text: [{ text: { content: 'setup-test' } }],
      },
      'Output Path': {
        rich_text: [{ text: { content: '/test/setup-verification' } }],
      },
      'Error Summary': {
        rich_text: [{ text: { content: '' } }],
      },
    },
  };

  const result = await notionRequest('/pages', 'POST', payload, apiKey);

  if (!result.ok) {
    console.error('  Test row insertion failed:', JSON.stringify(result.data, null, 2));
    console.error(
      '  This means the database schema may not match what notion-reporter.ts expects.',
      '\n  Check property names are exact (case-sensitive).'
    );
  } else {
    console.log('  ✓ Test row inserted successfully');
    console.log('  You can delete the "[Test] Setup Verification" row in Notion.');
  }
}

// ── .env update ──────────────────────────────────────────────────────────────

function updateEnvFile(databaseId: string, monthlyPageId: string, envPath: string): void {
  console.log(`\n📝 Appending to ${path.basename(envPath)}...`);

  if (!existsSync(envPath)) {
    console.error(`  Env file not found at ${envPath}`);
    console.error('  Copy .env.executive.example to .env.executive first, then re-run with --write-env');
    process.exit(1);
  }

  const existingContent = readFileSync(envPath, 'utf-8');

  // Check if vars already exist
  const hasDbId = existingContent.includes('NOTION_DATABASE_ID=');
  const hasPageId = existingContent.includes('NOTION_MONTHLY_PAGE_ID=');
  const hasEnabled = existingContent.includes('NOTION_REPORTING_ENABLED=');

  if (hasDbId || hasPageId || hasEnabled) {
    console.warn(
      `  WARNING: Some NOTION_* vars already exist in ${path.basename(envPath)}.`,
      '\n  Appending new values — you may need to remove duplicates manually.',
      '\n  Existing values will take precedence if loaded by dotenv.'
    );
  }

  const additions = [
    '',
    '# Notion Reporting (auto-generated by setup-notion-workspace.ts)',
    `NOTION_DATABASE_ID=${databaseId}`,
    `NOTION_MONTHLY_PAGE_ID=${monthlyPageId}`,
    'NOTION_REPORTING_ENABLED=true',
    '',
  ].join('\n');

  appendFileSync(envPath, additions, 'utf-8');
  console.log('  ✓ Added NOTION_DATABASE_ID, NOTION_MONTHLY_PAGE_ID, NOTION_REPORTING_ENABLED');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         Notion Workspace Setup for V1.2 Reporting       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Parse args
  const args = process.argv.slice(2);
  const writeEnv = args.includes('--write-env');
  const skipTest = args.includes('--skip-test');
  const parentPageId = args.find((a) => !a.startsWith('--'));

  if (!parentPageId) {
    console.error(`
Usage:
  npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> [options]

Arguments:
  PARENT_PAGE_ID    The Notion page ID under which to create the database and
                    summaries page. Find it in the page URL:
                    https://www.notion.so/workspace/Page-Name-<PAGE_ID>

Options:
  --write-env       Append the generated env vars to .env.executive automatically
  --skip-test       Skip the test row insertion

Prerequisites:
  1. Create a Notion internal integration at https://www.notion.so/my-integrations
     - Enable: Read content, Update content, Insert content
     - Copy the API key to NOTION_API_KEY in .env.executive
  2. Create or choose a parent page in your Notion workspace
  3. Connect the integration to that parent page:
     - Open the page > "..." menu > "Connections" > add your integration
  4. Copy the parent page ID from the URL

What this script creates:
  - "Agent Milestones" database (8 properties matching notion-reporter.ts)
  - "Agent Summaries — {current month}" page (with initial content)

What must still be done manually in Notion UI:
  - Database views (table sorted by Timestamp, board by Event, filtered view)
  - The integration connection to the parent page (step 3 above)
`);
    process.exit(1);
  }

  // Load API key
  const { env, sourcePath } = loadEnv();
  const apiKey = env.NOTION_API_KEY || process.env.NOTION_API_KEY;

  if (!apiKey) {
    console.error(
      '\nError: NOTION_API_KEY not found.',
      '\n  Set it in .env.executive or as an environment variable.',
      '\n  Get it from: https://www.notion.so/my-integrations'
    );
    process.exit(1);
  }

  // Clean the parent page ID (remove dashes if present — API accepts both)
  const cleanParentId = parentPageId.replace(/-/g, '');
  console.log(`\nParent page ID: ${cleanParentId}`);
  console.log(`API key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

  // Step 1: Create the Milestones database
  const database = await createMilestonesDatabase(cleanParentId, apiKey);

  // Step 2: Create the Summaries page
  const summariesPage = await createSummariesPage(cleanParentId, apiKey);

  // Step 3: Verify both resources
  const dbOk = await verifyDatabase(database.id, apiKey);
  const pageOk = await verifyPage(summariesPage.id, apiKey);

  if (!dbOk || !pageOk) {
    console.error('\n⚠️  Verification found issues. Check errors above.');
  }

  // Step 4: Optional test row
  if (!skipTest) {
    await insertTestRow(database.id, apiKey);
  }

  // Step 5: Output env vars
  // Format IDs without dashes (consistent with Notion URL format)
  const dbId = database.id.replace(/-/g, '');
  const pageId = summariesPage.id.replace(/-/g, '');

  console.log('\n' + '═'.repeat(60));
  console.log('ADD THESE TO YOUR .env.executive FILE:');
  console.log('═'.repeat(60));
  console.log(`NOTION_DATABASE_ID=${dbId}`);
  console.log(`NOTION_MONTHLY_PAGE_ID=${pageId}`);
  console.log('NOTION_REPORTING_ENABLED=true');
  console.log('═'.repeat(60));

  if (writeEnv) {
    const envPath = sourcePath ?? ENV_PATHS[0];
    updateEnvFile(dbId, pageId, envPath);
  } else {
    console.log('\nTip: Re-run with --write-env to auto-append to .env.executive');
  }

  // Summary of manual steps remaining
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  MANUAL STEPS REMAINING (cannot be automated via API):  ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  1. Open the "Agent Milestones" database in Notion       ║
║  2. Create these views:                                  ║
║     a. Default table: sort by Timestamp descending       ║
║     b. Board view: group by Event                        ║
║     c. Filtered view: Event = Started or Step Completed  ║
║                                                          ║
║  3. Verify the integration connection:                   ║
║     - "..." menu > Connections on both database & page   ║
║     - (Should be inherited from parent page)             ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

  console.log('Done! The agent will start writing to Notion on its next task execution.');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
