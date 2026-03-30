/**
 * E2E Test: Discord messaging via agent identity
 *
 * Tests:
 *   1. Webhook message to a channel (if DISCORD_WEBHOOK_URL is set)
 *   2. Bot channel message (if DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID are set)
 *   3. Bot DM to a user (if DISCORD_BOT_TOKEN + DISCORD_DM_USER_ID are set)
 *
 * All credentials and identity info come from env files — nothing is hardcoded.
 *
 * Usage:
 *   node tests/e2e/executive-accounts/discord-test.mjs
 *
 * Env vars (from .env.executive):
 *   AGENT_DISPLAY_NAME         — display name for webhook messages
 *   DISCORD_WEBHOOK_URL        — webhook URL for channel messages
 *   DISCORD_BOT_TOKEN          — bot token (falls back to local-only/tokens/)
 *   DISCORD_CHANNEL_ID         — channel to post bot messages to
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

  // Fall back to token file for bot token
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
const WEBHOOK_URL = env.DISCORD_WEBHOOK_URL || '';
const CHANNEL_ID = env.DISCORD_CHANNEL_ID || '';
const DM_USER_ID = env.DISCORD_DM_USER_ID || '';

const timestamp = new Date().toISOString();
let passed = 0;
let failed = 0;

// ── Test 1: Webhook message ─────────────────────────────────────────

async function testWebhook() {
  console.log('\n--- Test 1: Discord Webhook ---');

  if (!WEBHOOK_URL) {
    console.log('SKIP: DISCORD_WEBHOOK_URL not set');
    return;
  }

  const payload = {
    username: DISPLAY_NAME,
    content: `E2E test from ${DISPLAY_NAME} — ${timestamp}`,
    embeds: [{
      title: 'E2E Test: Webhook',
      description: 'If you see this, the Discord webhook integration is working.',
      color: 0x5865f2,
      fields: [
        { name: 'Source', value: '`tests/e2e/executive-accounts/discord-test.mjs`', inline: true },
        { name: 'Timestamp', value: timestamp, inline: true },
      ],
    }],
  };

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok || res.status === 204) {
    console.log('PASS: Webhook message sent');
    passed++;
  } else {
    const text = await res.text();
    console.log(`FAIL: HTTP ${res.status} — ${text}`);
    failed++;
  }
}

// ── Test 2: Bot channel message ─────────────────────────────────────

async function testBotChannel() {
  console.log('\n--- Test 2: Discord Bot Channel Message ---');

  if (!BOT_TOKEN) {
    console.log('SKIP: DISCORD_BOT_TOKEN not set');
    return;
  }

  if (!CHANNEL_ID) {
    console.log('SKIP: DISCORD_CHANNEL_ID not set');
    return;
  }

  const headers = {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Verify auth
  const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers });
  if (!meRes.ok) {
    console.log(`FAIL: Bot auth failed — HTTP ${meRes.status}`);
    failed++;
    return;
  }
  const me = await meRes.json();
  console.log(`  Bot authenticated as: ${me.username} (${me.id})`);

  // Send to channel
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: `E2E test at ${timestamp} — bot channel message works!`,
      embeds: [{
        title: 'E2E Test: Bot Channel',
        description: `Sent by ${DISPLAY_NAME} bot to verify channel messaging.`,
        color: 0x5865f2,
      }],
    }),
  });

  if (msgRes.ok) {
    console.log('PASS: Channel message sent');
    passed++;
  } else {
    const text = await msgRes.text();
    console.log(`FAIL: HTTP ${msgRes.status} — ${text}`);
    failed++;
  }
}

// ── Test 3: Bot DM ──────────────────────────────────────────────────

async function testBotDM() {
  console.log('\n--- Test 3: Discord Bot DM ---');

  if (!BOT_TOKEN) {
    console.log('SKIP: DISCORD_BOT_TOKEN not set');
    return;
  }

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
      content: `E2E test at ${timestamp} — if you see this, DM integration works!`,
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
console.log(`Webhook URL: ${WEBHOOK_URL ? 'configured' : 'NOT SET'}`);
console.log(`Bot token: ${BOT_TOKEN ? 'configured' : 'NOT SET'}`);
console.log(`Channel ID: ${CHANNEL_ID || 'NOT SET'}`);
console.log(`DM User ID: ${DM_USER_ID || 'NOT SET'}`);

await testWebhook();
await testBotChannel();
await testBotDM();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
