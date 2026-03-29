/**
 * Ad-hoc tests: V2 Agent Identity (Gmail + Slack)
 *
 * Tests identity features without requiring actual Gmail/Slack credentials.
 * All tests mock environment variables and validate:
 * - Kill switch behavior (disabled → no-op)
 * - Email intent parsing
 * - Slack throttle logic
 * - Graceful degradation when credentials missing
 *
 * Run: npx tsx tests/adhoc/v2-identity/v2-identity.adhoc.ts
 */

import type { FetchedEmail, IdentityConfig } from '../../../src/identity/identity-types.js';
import { parseEmailIntent, loadIdentityConfig, isGmailEnabled, _decodeBase64Url, _encodeBase64Url } from '../../../src/identity/gmail-client.js';
import { isSlackEnabled, isThrottled, resetThrottle, getThrottleStatus, sendSlackMessage, sendCompletionNotification, sendBlockedNotification } from '../../../src/identity/slack-client.js';
import { checkInbox } from '../../../src/identity/inbox-checker.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ── Helper: create a mock IdentityConfig ────────────────────────────

function mockConfig(overrides: Partial<IdentityConfig> = {}): IdentityConfig {
  return {
    identityEnabled: false,
    gmailEnabled: false,
    slackEnabled: false,
    agentEmail: '',
    gmailRefreshToken: '',
    gmailClientId: '',
    gmailClientSecret: '',
    slackBotToken: '',
    slackChannelId: '',
    slackMaxMessagesPerHour: 10,
    inboxCheckInterval: 1,
    ...overrides,
  };
}

function mockEmail(overrides: Partial<FetchedEmail> = {}): FetchedEmail {
  return {
    messageId: 'msg-123',
    from: 'jack@example.com',
    subject: 'Test email',
    body: 'Test body',
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// TEST 1: Kill Switch — Disabled identity returns no-op
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 1: Kill Switch Behavior ===\n');

// 1a: Gmail disabled by default
console.log('[1a] Gmail disabled when IDENTITY_ENABLED=false');
{
  const config = mockConfig();
  assert(!isGmailEnabled(config), 'Gmail should be disabled');
}

// 1b: Gmail disabled when only IDENTITY_ENABLED=true but GMAIL_ENABLED=false
console.log('\n[1b] Gmail disabled when GMAIL_ENABLED=false');
{
  const config = mockConfig({ identityEnabled: true });
  assert(!isGmailEnabled(config), 'Gmail should be disabled without GMAIL_ENABLED=true');
}

// 1c: Gmail disabled when credentials missing
console.log('\n[1c] Gmail disabled when credentials missing');
{
  const config = mockConfig({ identityEnabled: true, gmailEnabled: true });
  assert(!isGmailEnabled(config), 'Gmail should be disabled without credentials');
}

// 1d: Gmail enabled only when all credentials present
console.log('\n[1d] Gmail enabled with all credentials');
{
  const config = mockConfig({
    identityEnabled: true,
    gmailEnabled: true,
    gmailRefreshToken: 'token',
    gmailClientId: 'client-id',
    gmailClientSecret: 'client-secret',
  });
  assert(isGmailEnabled(config), 'Gmail should be enabled with all credentials');
}

// 1e: Slack disabled by default
console.log('\n[1e] Slack disabled when IDENTITY_ENABLED=false');
{
  const config = mockConfig();
  assert(!isSlackEnabled(config), 'Slack should be disabled');
}

// 1f: Slack disabled without bot token
console.log('\n[1f] Slack disabled without SLACK_BOT_TOKEN');
{
  const config = mockConfig({ identityEnabled: true, slackEnabled: true });
  assert(!isSlackEnabled(config), 'Slack should be disabled without bot token');
}

// 1g: Slack enabled with all credentials
console.log('\n[1g] Slack enabled with all credentials');
{
  const config = mockConfig({
    identityEnabled: true,
    slackEnabled: true,
    slackBotToken: 'xoxb-test',
    slackChannelId: 'C12345',
  });
  assert(isSlackEnabled(config), 'Slack should be enabled with all credentials');
}

// ══════════════════════════════════════════════════════════════════════
// TEST 2: Email Intent Parsing
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 2: Email Intent Parsing ===\n');

// 2a: Priority change
console.log('[2a] Priority change intent');
{
  const email = mockEmail({
    subject: 'Reprioritize dashboard to P1',
    body: 'Please reprioritize the dashboard goal to P1, it is urgent.',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'priority_change', `Expected priority_change, got ${intent.type}`);
  assert(intent.newPriority === 'P1', `Expected P1, got ${intent.newPriority}`);
}

// 2b: New goal
console.log('\n[2b] New goal intent');
{
  const email = mockEmail({
    subject: 'New goal: Build a landing page',
    body: 'Please build a landing page for the product launch with hero section and pricing.',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'new_goal', `Expected new_goal, got ${intent.type}`);
  assert(intent.confidence === 'high', `Expected high confidence, got ${intent.confidence}`);
  assert(intent.goalDescription !== undefined, 'Should have goalDescription');
}

// 2c: Approval
console.log('\n[2c] Approval intent');
{
  const email = mockEmail({
    subject: 'Re: Need your decision on auth approach',
    body: '[APPROVED] Go ahead with OAuth flow.',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'approval', `Expected approval, got ${intent.type}`);
  assert(intent.confidence === 'high', `Expected high confidence, got ${intent.confidence}`);
}

// 2d: Skip intent
console.log('\n[2d] Skip intent');
{
  const email = mockEmail({
    subject: 'Re: Blocked on API integration',
    body: '[SKIP] Cancel this, we are going a different direction.',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'skip', `Expected skip, got ${intent.type}`);
}

// 2e: Question answer (reply thread)
console.log('\n[2e] Question answer intent');
{
  const email = mockEmail({
    subject: 'Re: Which database should I use?',
    body: 'Use Supabase with the free tier. Here are the connection details: ...',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'question_answer', `Expected question_answer, got ${intent.type}`);
  assert(intent.confidence === 'medium', `Expected medium confidence, got ${intent.confidence}`);
}

// 2f: Unclear intent → needs_clarification
console.log('\n[2f] Unclear intent → needs_clarification');
{
  const email = mockEmail({
    subject: 'Hey',
    body: 'What is up?',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'needs_clarification', `Expected needs_clarification, got ${intent.type}`);
  assert(intent.confidence === 'low', `Expected low confidence, got ${intent.confidence}`);
}

// 2g: Another approval format
console.log('\n[2g] "Go ahead" approval');
{
  const email = mockEmail({
    subject: 'Re: Permission to deploy',
    body: 'Yes, go ahead with the deployment.',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'approval', `Expected approval, got ${intent.type}`);
}

// 2h: Priority change with P0
console.log('\n[2h] Priority change to P0');
{
  const email = mockEmail({
    subject: 'Move auth fix to P0',
    body: 'This is critical, move it to P0 now.',
  });
  const intent = parseEmailIntent(email);
  assert(intent.type === 'priority_change', `Expected priority_change, got ${intent.type}`);
  assert(intent.newPriority === 'P0', `Expected P0, got ${intent.newPriority}`);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 3: Slack Throttle Logic
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 3: Slack Throttle Logic ===\n');

// 3a: Fresh state — not throttled
console.log('[3a] Fresh state is not throttled');
{
  resetThrottle();
  const config = mockConfig({ slackMaxMessagesPerHour: 3 });
  assert(!isThrottled(config), 'Should not be throttled with no messages');
}

// 3b: getThrottleStatus shows correct state
console.log('\n[3b] Throttle status shows correct counts');
{
  resetThrottle();
  const config = mockConfig({ slackMaxMessagesPerHour: 5 });
  const status = getThrottleStatus(config);
  assert(status.messagesInWindow === 0, `Expected 0 messages, got ${status.messagesInWindow}`);
  assert(status.maxPerHour === 5, `Expected max 5, got ${status.maxPerHour}`);
  assert(!status.isThrottled, 'Should not be throttled');
}

// 3c: Sending when disabled returns false without error
console.log('\n[3c] Disabled Slack send returns false');
{
  resetThrottle();
  const config = mockConfig(); // everything disabled
  const result = await sendSlackMessage({ text: 'test' }, config);
  assert(result === false, 'Should return false when disabled');
}

// 3d: Completion notification returns false when disabled
console.log('\n[3d] Completion notification no-op when disabled');
{
  const config = mockConfig();
  const result = await sendCompletionNotification('Test Goal', 'P2', '/some/path', config);
  assert(result === false, 'Should return false when disabled');
}

// 3e: Blocked notification returns false when disabled
console.log('\n[3e] Blocked notification no-op when disabled');
{
  const config = mockConfig();
  const result = await sendBlockedNotification('Test Goal', 'P1', 'Auth failed', 5, config);
  assert(result === false, 'Should return false when disabled');
}

// ══════════════════════════════════════════════════════════════════════
// TEST 4: Graceful Degradation
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 4: Graceful Degradation ===\n');

// 4a: loadIdentityConfig with no env vars
console.log('[4a] Default config from empty env');
{
  // Save current env, clear identity vars
  const saved = { ...process.env };
  delete process.env.IDENTITY_ENABLED;
  delete process.env.GMAIL_ENABLED;
  delete process.env.SLACK_ENABLED;
  delete process.env.AGENT_EMAIL;
  delete process.env.GMAIL_REFRESH_TOKEN;
  delete process.env.GMAIL_CLIENT_ID;
  delete process.env.GMAIL_CLIENT_SECRET;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;

  const config = loadIdentityConfig();
  assert(config.identityEnabled === false, 'identityEnabled should default false');
  assert(config.gmailEnabled === false, 'gmailEnabled should default false');
  assert(config.slackEnabled === false, 'slackEnabled should default false');
  assert(config.slackMaxMessagesPerHour === 10, `Default throttle should be 10, got ${config.slackMaxMessagesPerHour}`);
  assert(config.inboxCheckInterval === 1, `Default inbox interval should be 1, got ${config.inboxCheckInterval}`);

  // Restore
  Object.assign(process.env, saved);
}

// 4b: checkInbox returns no-op when disabled
console.log('\n[4b] checkInbox no-op when identity disabled');
{
  const saved = { ...process.env };
  delete process.env.IDENTITY_ENABLED;

  const result = await checkInbox(1);
  assert(result.emailsFetched === 0, 'Should fetch 0 emails');
  assert(result.actionableIntents === 0, 'Should have 0 actionable intents');
  assert(result.intents.length === 0, 'Should have empty intents array');

  Object.assign(process.env, saved);
}

// 4c: checkInbox respects interval gating
console.log('\n[4c] checkInbox interval gating');
{
  const saved = { ...process.env };
  process.env.IDENTITY_ENABLED = 'true';
  process.env.GMAIL_ENABLED = 'true';
  process.env.INBOX_CHECK_INTERVAL = '5';
  // Still no credentials, so would be no-op even if interval passes,
  // but the interval gate runs first
  const result = await checkInbox(3); // iteration 3 not divisible by 5
  assert(result.emailsFetched === 0, 'Should skip non-interval iteration');

  Object.assign(process.env, saved);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 5: Base64url Encoding/Decoding
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 5: Base64url Helpers ===\n');

// 5a: Round-trip encode/decode
console.log('[5a] Base64url round-trip');
{
  const original = 'Hello, World! This is a test email body with special chars: <>&"\'';
  const encoded = _encodeBase64Url(original);
  const decoded = _decodeBase64Url(encoded);
  assert(decoded === original, 'Round-trip should preserve content');
  assert(!encoded.includes('+'), 'Encoded should not contain +');
  assert(!encoded.includes('/'), 'Encoded should not contain /');
  assert(!encoded.includes('='), 'Encoded should not contain padding =');
}

// 5b: Decode known value
console.log('\n[5b] Decode known base64url value');
{
  // "Hello" in base64url is "SGVsbG8"
  const decoded = _decodeBase64Url('SGVsbG8');
  assert(decoded === 'Hello', `Expected "Hello", got "${decoded}"`);
}

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log(`V2 Identity Tests: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
