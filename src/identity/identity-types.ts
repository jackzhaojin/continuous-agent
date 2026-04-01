/**
 * Identity Types — Interfaces for Agent Identity (Gmail + Discord)
 *
 * All identity features are opt-in, disabled by default via env vars:
 *   IDENTITY_ENABLED=false   (master kill switch)
 *   GMAIL_ENABLED=false
 *   DISCORD_ENABLED=false
 *
 * Env vars for Gmail:
 *   AGENT_EMAIL=
 *   GMAIL_REFRESH_TOKEN=
 *   GMAIL_CLIENT_ID=
 *   GMAIL_CLIENT_SECRET=
 *
 * Env vars for Discord:
 *   DISCORD_BOT_TOKEN=
 *   DISCORD_CHANNEL_ID=
 *   DISCORD_MAX_MESSAGES_PER_HOUR=10
 *
 * Env vars for inbox checking:
 *   INBOX_CHECK_INTERVAL=1
 */

// ── Identity Configuration ──────────────────────────────────────────

export interface IdentityConfig {
  /** Master kill switch — both Gmail and Discord require this to be true */
  identityEnabled: boolean;

  /** Gmail-specific enable flag */
  gmailEnabled: boolean;

  /** Discord-specific enable flag */
  discordEnabled: boolean;

  /** Agent's Gmail address */
  agentEmail: string;

  /** Agent's display name (used in Discord webhooks, etc.) */
  agentDisplayName: string;

  /** Gmail OAuth2 credentials */
  gmailRefreshToken: string;
  gmailClientId: string;
  gmailClientSecret: string;

  /** Discord webhook URL (posts as agent display name) */
  discordWebhookUrl: string;

  /** Discord bot token (for DM support) */
  discordBotToken: string;

  /** Discord user ID to send DMs to */
  discordDmUserId: string;

  /** Max Discord messages per hour (throttle) */
  discordMaxMessagesPerHour: number;

  /** How often to check inbox (every N iterations, default 1) */
  inboxCheckInterval: number;
}

// ── Email Intent Parsing ────────────────────────────────────────────

export type EmailIntentType =
  | 'priority_change'
  | 'new_goal'
  | 'approval'
  | 'question_answer'
  | 'skip'
  | 'needs_clarification';

export interface ParsedEmailIntent {
  /** Classified intent type */
  type: EmailIntentType;

  /** Confidence level: how certain the parser is about the intent */
  confidence: 'high' | 'medium' | 'low';

  /** Extracted subject line */
  subject: string;

  /** Sender email address */
  from: string;

  /** Raw body text */
  body: string;

  /** Gmail message ID for archiving/labeling */
  messageId: string;

  /** For priority_change: the new priority */
  newPriority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

  /** For priority_change or question_answer: which goal this refers to */
  goalTitle?: string;

  /** For new_goal: the goal description */
  goalDescription?: string;

  /** For approval or question_answer: the response text */
  responseText?: string;
}

// ── Fetched Email ───────────────────────────────────────────────────

export interface FetchedEmail {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  threadId?: string;
}

// ── Discord Message ─────────────────────────────────────────────────

export interface DiscordMessage {
  /** Plain text content */
  content: string;

  /** Rich embeds */
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

// ── Inbox Check Result ──────────────────────────────────────────────

export interface InboxCheckResult {
  /** Number of emails fetched */
  emailsFetched: number;

  /** Number of actionable intents parsed */
  actionableIntents: number;

  /** Number of clarification replies sent */
  clarificationsSent: number;

  /** The parsed intents (for Phase 2 processing) */
  intents: ParsedEmailIntent[];
}
