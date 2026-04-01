/**
 * E2E Test: Discord bot DM
 *
 * Tests:
 *   1. Bot authentication
 *   2. DM to the configured user (DISCORD_DM_USER_ID)
 *
 * All credentials come from .env.executive — nothing is hardcoded.
 *
 * Usage:
 *   node tests/e2e/executive-accounts/discord-test.mjs
 *
 * Env vars (from .env.executive):
 *   AGENT_DISPLAY_NAME        — display name for messages
 *   DISCORD_BOT_TOKEN          — bot token (falls back to local-only/tokens/)
 *   DISCORD_DM_USER_ID         — user ID to send a test DM to
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

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

  if (!env.DISCORD_BOT_TOKEN) {
    try {
      env.DISCORD_BOT_TOKEN = readFileSync(resolve(ROOT, 'local-only/tokens/discord-bot-token.txt'), 'utf-8').trim();
    } catch { /* ignore */ }
  }

  return env;
}

const env = loadEnv();
const DISPLAY_NAME = env.AGENT_DISPLAY_NAME || 'Agent';
const BOT_TOKEN = env.DISCORD_BOT_TOKEN || '';
const DM_USER_ID = env.DISCORD_DM_USER_ID || '';

const timestamp = new Date().toISOString();
let passed = 0;
let failed = 0;

// ── Test 1: Bot auth ────────────────────────────────────────────────

async function testAuth() {
  console.log('\n--- Test 1: Discord Bot Authentication ---');

  if (!BOT_TOKEN) {
    console.log('FAIL: DISCORD_BOT_TOKEN not set');
    failed++;
    return false;
  }

  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });

  if (res.ok) {
    const me = await res.json();
    console.log(`  Authenticated as: ${me.username} (${me.id})`);
    console.log('PASS: Bot authentication works');
    passed++;
    return true;
  } else {
    console.log(`FAIL: HTTP ${res.status}`);
    failed++;
    return false;
  }
}

// ── Test 2: Bot DM ──────────────────────────────────────────────────

async function testBotDM() {
  console.log('\n--- Test 2: Discord Bot DM ---');

  if (!DM_USER_ID) {
    console.log('SKIP: DISCORD_DM_USER_ID not set');
    return;
  }

  const headers = {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Open DM channel
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipient_id: DM_USER_ID }),
  });

  if (!dmRes.ok) {
    const text = await dmRes.text();
    console.log(`FAIL: Could not open DM channel — HTTP ${dmRes.status} ${text}`);
    failed++;
    return;
  }

  const dmChannel = await dmRes.json();
  console.log(`  DM channel opened: ${dmChannel.id}`);

  // Send DM
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: `E2E test at ${timestamp} — DM from ${DISPLAY_NAME}`,
      embeds: [{
        title: 'E2E Test: Bot DM',
        description: `Direct message from ${DISPLAY_NAME} bot.`,
        color: 0x00cc66,
      }],
    }),
  });

  if (msgRes.ok) {
    console.log('PASS: DM sent successfully');
    passed++;
  } else {
    const text = await msgRes.text();
    console.log(`FAIL: DM send failed — HTTP ${msgRes.status} ${text}`);
    failed++;
  }
}

// ── Run ─────────────────────────────────────────────────────────────

console.log('=== Discord E2E Test ===');
console.log(`Timestamp: ${timestamp}`);
console.log(`Display name: ${DISPLAY_NAME}`);
console.log(`Bot token: ${BOT_TOKEN ? 'configured' : 'NOT SET'}`);
console.log(`DM User ID: ${DM_USER_ID || 'NOT SET'}`);

const authOk = await testAuth();
if (authOk) {
  await testBotDM();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
