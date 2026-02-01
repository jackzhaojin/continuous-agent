/**
 * One-time setup: Add "Duration" (number) property to the Agent Milestones database.
 * Uses raw fetch API for reliable schema modification.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-notion-endtask/setup-duration-raw.ts
 */

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

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
};

async function main() {
  // Check current schema
  console.log('Checking current database schema...');
  const getRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Notion-Version': '2022-06-28' },
  });

  if (!getRes.ok) {
    console.error(`GET failed: ${getRes.status} ${await getRes.text()}`);
    process.exit(1);
  }

  const dbData = await getRes.json() as { properties: Record<string, { type: string }> };
  console.log('Current properties:');
  for (const [name, prop] of Object.entries(dbData.properties)) {
    console.log(`  ${name}: ${prop.type}`);
  }

  if (dbData.properties['Duration']) {
    console.log('\nDuration already exists. Done.');
    return;
  }

  // Add Duration
  console.log('\nAdding Duration property...');
  const patchRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      properties: {
        Duration: { number: { format: 'number' } },
      },
    }),
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error(`PATCH failed: ${patchRes.status} ${errText}`);
    process.exit(1);
  }

  const patchData = await patchRes.json() as { properties: Record<string, { type: string }> };
  if (patchData.properties['Duration']) {
    console.log(`SUCCESS: Duration added (type: ${patchData.properties['Duration'].type})`);
  } else {
    console.log('WARNING: Duration not in response. Verifying...');
    // Re-fetch to verify
    const verifyRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Notion-Version': '2022-06-28' },
    });
    const verifyData = await verifyRes.json() as { properties: Record<string, { type: string }> };
    if (verifyData.properties['Duration']) {
      console.log(`VERIFIED: Duration exists (type: ${verifyData.properties['Duration'].type})`);
    } else {
      console.error('FAILED: Duration still not found');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
