/**
 * Slack Client — Agent Identity Slack Integration
 *
 * Slack Web API for sending structured messages.
 * All operations are gated by IDENTITY_ENABLED and SLACK_ENABLED env vars (both default false).
 * If disabled or credentials missing, functions return gracefully (no-op, not error).
 *
 * Throttle: max N messages per hour (configurable via SLACK_MAX_MESSAGES_PER_HOUR, default 10).
 *
 * Env vars:
 *   IDENTITY_ENABLED=false
 *   SLACK_ENABLED=false
 *   SLACK_BOT_TOKEN=
 *   SLACK_CHANNEL_ID=
 *   SLACK_MAX_MESSAGES_PER_HOUR=10
 */

import type { IdentityConfig, SlackMessage, SlackBlock } from './identity-types.js';
import { loadIdentityConfig } from './gmail-client.js';
import { log, logDeterministic } from '../core/logging.js';

// ── Throttle State ──────────────────────────────────────────────────

/** Timestamps of messages sent in the current hour window */
const messageTimestamps: number[] = [];

/**
 * Check if Slack is fully enabled and has valid credentials.
 */
export function isSlackEnabled(config?: IdentityConfig): boolean {
  const c = config || loadIdentityConfig();
  return c.identityEnabled && c.slackEnabled && c.slackBotToken !== '' && c.slackChannelId !== '';
}

/**
 * Check if we've exceeded the throttle limit.
 * Cleans up timestamps older than 1 hour.
 */
export function isThrottled(config?: IdentityConfig): boolean {
  const c = config || loadIdentityConfig();
  const oneHourAgo = Date.now() - 3_600_000;

  // Prune old timestamps
  while (messageTimestamps.length > 0 && messageTimestamps[0] < oneHourAgo) {
    messageTimestamps.shift();
  }

  return messageTimestamps.length >= c.slackMaxMessagesPerHour;
}

/**
 * Record a sent message timestamp for throttling.
 */
function recordMessage(): void {
  messageTimestamps.push(Date.now());
}

/**
 * Get current throttle status (for testing/monitoring).
 */
export function getThrottleStatus(config?: IdentityConfig): {
  messagesInWindow: number;
  maxPerHour: number;
  isThrottled: boolean;
} {
  const c = config || loadIdentityConfig();
  const oneHourAgo = Date.now() - 3_600_000;
  while (messageTimestamps.length > 0 && messageTimestamps[0] < oneHourAgo) {
    messageTimestamps.shift();
  }
  return {
    messagesInWindow: messageTimestamps.length,
    maxPerHour: c.slackMaxMessagesPerHour,
    isThrottled: messageTimestamps.length >= c.slackMaxMessagesPerHour,
  };
}

/**
 * Reset throttle state (for testing).
 */
export function resetThrottle(): void {
  messageTimestamps.length = 0;
}

// ── Core Send ───────────────────────────────────────────────────────

/**
 * Send a Slack message via the Web API.
 * Returns true if sent, false if disabled/throttled/error.
 */
export async function sendSlackMessage(message: SlackMessage, config?: IdentityConfig): Promise<boolean> {
  const c = config || loadIdentityConfig();

  if (!isSlackEnabled(c)) {
    return false;
  }

  if (isThrottled(c)) {
    log(`  Slack: Throttled — ${messageTimestamps.length}/${c.slackMaxMessagesPerHour} messages in last hour`);
    return false;
  }

  const channel = message.channel || c.slackChannelId;

  try {
    const payload: Record<string, unknown> = {
      channel,
      text: message.text,
    };

    if (message.blocks && message.blocks.length > 0) {
      payload.blocks = message.blocks;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      log(`  Slack: HTTP error: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      log(`  Slack: API error: ${data.error}`);
      return false;
    }

    recordMessage();
    logDeterministic(`Slack: Sent message to ${channel}`);
    return true;
  } catch (error) {
    log(`  Slack: Send error: ${error}`);
    return false;
  }
}

// ── Notification Helpers ────────────────────────────────────────────

/**
 * Send a goal completion notification.
 * Fire-and-forget: catches errors, never blocks the loop.
 */
export async function sendCompletionNotification(
  goalTitle: string,
  priority: string,
  outputPath?: string,
  config?: IdentityConfig
): Promise<boolean> {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Goal Completed' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Goal:*\n${goalTitle}` },
        { type: 'mrkdwn', text: `*Priority:*\n${priority}` },
      ],
    },
  ];

  if (outputPath) {
    blocks.push({
      type: 'context',
      text: { type: 'mrkdwn', text: `Output: \`${outputPath}\`` },
    });
  }

  return sendSlackMessage(
    {
      text: `Goal completed: ${goalTitle} [${priority}]`,
      blocks,
    },
    config
  );
}

/**
 * Send a goal blocked notification.
 * Fire-and-forget: catches errors, never blocks the loop.
 */
export async function sendBlockedNotification(
  goalTitle: string,
  priority: string,
  reason: string,
  attempts: number,
  config?: IdentityConfig
): Promise<boolean> {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Goal Blocked — Needs Your Input' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Goal:*\n${goalTitle}` },
        { type: 'mrkdwn', text: `*Priority:*\n${priority}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Reason:*\n${reason.slice(0, 500)}`,
      },
    },
    {
      type: 'context',
      text: {
        type: 'mrkdwn',
        text: `Failed after ${attempts} attempt(s). Check \`workspace/needs-you.md\` for details.`,
      },
    },
  ];

  return sendSlackMessage(
    {
      text: `BLOCKED: ${goalTitle} [${priority}] — ${reason.slice(0, 100)}`,
      blocks,
    },
    config
  );
}

/**
 * Send a daily summary to Slack.
 * Fire-and-forget.
 */
export async function sendDailySummary(
  summary: {
    goalsCompleted: number;
    goalsFailed: number;
    goalsBlocked: number;
    totalIterations: number;
  },
  config?: IdentityConfig
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Daily Summary — ${today}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Completed:*\n${summary.goalsCompleted}` },
        { type: 'mrkdwn', text: `*Failed:*\n${summary.goalsFailed}` },
        { type: 'mrkdwn', text: `*Blocked:*\n${summary.goalsBlocked}` },
        { type: 'mrkdwn', text: `*Iterations:*\n${summary.totalIterations}` },
      ],
    },
  ];

  return sendSlackMessage(
    {
      text: `Daily summary ${today}: ${summary.goalsCompleted} completed, ${summary.goalsFailed} failed, ${summary.goalsBlocked} blocked`,
      blocks,
    },
    config
  );
}
