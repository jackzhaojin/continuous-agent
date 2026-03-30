/**
 * Discord Client — Agent Identity Discord Integration
 *
 * Uses Discord webhooks to post messages as the agent's display name.
 * All operations are gated by IDENTITY_ENABLED and DISCORD_ENABLED env vars (both default false).
 * If disabled or webhook URL missing, functions return gracefully (no-op, not error).
 *
 * Throttle: max N messages per hour (configurable via DISCORD_MAX_MESSAGES_PER_HOUR, default 10).
 *
 * Env vars:
 *   IDENTITY_ENABLED=false
 *   DISCORD_ENABLED=false
 *   DISCORD_WEBHOOK_URL=         # Full webhook URL (includes token)
 *   DISCORD_MAX_MESSAGES_PER_HOUR=10
 */

import type { IdentityConfig, DiscordMessage, DiscordEmbed } from './identity-types.js';
import { loadIdentityConfig } from './gmail-client.js';
import { log, logDeterministic } from '../core/logging.js';

// ── Throttle State ──────────────────────────────────────────────────

/** Timestamps of messages sent in the current hour window */
const messageTimestamps: number[] = [];

/**
 * Check if Discord is fully enabled and has a valid webhook URL.
 */
export function isDiscordEnabled(config?: IdentityConfig): boolean {
  const c = config || loadIdentityConfig();
  return c.identityEnabled && c.discordEnabled && c.discordWebhookUrl !== '';
}

/**
 * Check if we've exceeded the throttle limit.
 * Cleans up timestamps older than 1 hour.
 */
export function isThrottled(config?: IdentityConfig): boolean {
  const c = config || loadIdentityConfig();
  const oneHourAgo = Date.now() - 3_600_000;

  while (messageTimestamps.length > 0 && messageTimestamps[0] < oneHourAgo) {
    messageTimestamps.shift();
  }

  return messageTimestamps.length >= c.discordMaxMessagesPerHour;
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
    maxPerHour: c.discordMaxMessagesPerHour,
    isThrottled: messageTimestamps.length >= c.discordMaxMessagesPerHour,
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
 * Send a Discord message via webhook.
 * Messages appear as the agent's display name in the channel.
 * Returns true if sent, false if disabled/throttled/error.
 */
export async function sendDiscordMessage(message: DiscordMessage, config?: IdentityConfig): Promise<boolean> {
  const c = config || loadIdentityConfig();

  if (!isDiscordEnabled(c)) {
    return false;
  }

  if (isThrottled(c)) {
    log(`  Discord: Throttled — ${messageTimestamps.length}/${c.discordMaxMessagesPerHour} messages in last hour`);
    return false;
  }

  try {
    const payload: Record<string, unknown> = {
      content: message.content,
      username: c.agentDisplayName,
    };

    if (message.embeds && message.embeds.length > 0) {
      payload.embeds = message.embeds;
    }

    const response = await fetch(c.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`  Discord: HTTP error: ${response.status} ${errorText}`);
      return false;
    }

    recordMessage();
    logDeterministic('Discord: Sent webhook message');
    return true;
  } catch (error) {
    log(`  Discord: Send error: ${error}`);
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
  const embed: DiscordEmbed = {
    title: 'Goal Completed',
    color: 0x00cc66, // green
    fields: [
      { name: 'Goal', value: goalTitle, inline: true },
      { name: 'Priority', value: priority, inline: true },
    ],
  };

  if (outputPath) {
    embed.fields!.push({ name: 'Output', value: `\`${outputPath}\`` });
  }

  return sendDiscordMessage(
    {
      content: `Goal completed: ${goalTitle} [${priority}]`,
      embeds: [embed],
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
  const embed: DiscordEmbed = {
    title: 'Goal Blocked — Needs Your Input',
    color: 0xff4444, // red
    fields: [
      { name: 'Goal', value: goalTitle, inline: true },
      { name: 'Priority', value: priority, inline: true },
      { name: 'Reason', value: reason.slice(0, 1024) },
      { name: 'Attempts', value: `Failed after ${attempts} attempt(s). Check \`workspace/needs-you.md\` for details.` },
    ],
  };

  return sendDiscordMessage(
    {
      content: `BLOCKED: ${goalTitle} [${priority}] — ${reason.slice(0, 100)}`,
      embeds: [embed],
    },
    config
  );
}

/**
 * Send a daily summary to Discord.
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

  const embed: DiscordEmbed = {
    title: `Daily Summary — ${today}`,
    color: 0x5865f2, // discord blurple
    fields: [
      { name: 'Completed', value: `${summary.goalsCompleted}`, inline: true },
      { name: 'Failed', value: `${summary.goalsFailed}`, inline: true },
      { name: 'Blocked', value: `${summary.goalsBlocked}`, inline: true },
      { name: 'Iterations', value: `${summary.totalIterations}`, inline: true },
    ],
  };

  return sendDiscordMessage(
    {
      content: `Daily summary ${today}: ${summary.goalsCompleted} completed, ${summary.goalsFailed} failed, ${summary.goalsBlocked} blocked`,
      embeds: [embed],
    },
    config
  );
}
