/**
 * Identity Types — Interfaces for Agent Identity (Gmail + Slack)
 *
 * All identity features are opt-in, disabled by default via env vars:
 *   IDENTITY_ENABLED=false   (master kill switch)
 *   GMAIL_ENABLED=false
 *   SLACK_ENABLED=false
 *
 * Env vars for Gmail:
 *   AGENT_EMAIL=
 *   GMAIL_REFRESH_TOKEN=
 *   GMAIL_CLIENT_ID=
 *   GMAIL_CLIENT_SECRET=
 *
 * Env vars for Slack:
 *   SLACK_BOT_TOKEN=
 *   SLACK_CHANNEL_ID=
 *   SLACK_MAX_MESSAGES_PER_HOUR=10
 *
 * Env vars for inbox checking:
 *   INBOX_CHECK_INTERVAL=1
 */

// ── Identity Configuration ──────────────────────────────────────────

export interface IdentityConfig {
  /** Master kill switch — both Gmail and Slack require this to be true */
  identityEnabled: boolean;

  /** Gmail-specific enable flag */
  gmailEnabled: boolean;

  /** Slack-specific enable flag */
  slackEnabled: boolean;

  /** Agent's Gmail address */
  agentEmail: string;

  /** Gmail OAuth2 credentials */
  gmailRefreshToken: string;
  gmailClientId: string;
  gmailClientSecret: string;

  /** Slack bot token (xoxb-...) */
  slackBotToken: string;

  /** Default Slack channel for notifications */
  slackChannelId: string;

  /** Max Slack messages per hour (throttle) */
  slackMaxMessagesPerHour: number;

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

// ── Slack Message ───────────────────────────────────────────────────

export interface SlackMessage {
  /** Channel to send to (defaults to configured SLACK_CHANNEL_ID) */
  channel?: string;

  /** Plain text fallback */
  text: string;

  /** Block Kit blocks for rich formatting */
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: 'section' | 'header' | 'divider' | 'context';
  text?: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
  };
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
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
