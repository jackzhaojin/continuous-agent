/**
 * One-time setup: Add "Duration" (number) property to the Agent Milestones database.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-notion-endtask/setup-duration-property.ts
 */

import { Client } from '@notionhq/client';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
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
const DATABASE_ID = env.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_ID;

if (!API_KEY || !DATABASE_ID) {
  console.error('NOTION_API_KEY or NOTION_DATABASE_ID not found');
  process.exit(1);
}

async function main() {
  // Use old API version for database schema modification (returns properties)
  const client = new Client({ auth: API_KEY, notionVersion: '2022-06-28' });

  // Check current schema
  console.log('Checking current database schema...');
  const db = await client.databases.retrieve({ database_id: DATABASE_ID });
  const props = (db as unknown as { properties: Record<string, { type: string }> }).properties;

  if (props['Duration']) {
    console.log(`Duration property already exists (type: ${props['Duration'].type})`);
    console.log('No action needed.');
    return;
  }

  console.log('Duration property not found. Adding...');
  const updated = await client.databases.update({
    database_id: DATABASE_ID,
    properties: {
      Duration: { number: {} } as never,
    },
  });

  const updatedProps = (updated as unknown as { properties: Record<string, { type: string }> }).properties;
  if (updatedProps['Duration']) {
    console.log(`SUCCESS: Duration property added (type: ${updatedProps['Duration'].type})`);
  } else {
    console.error('FAILED: Duration property not found after update');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
