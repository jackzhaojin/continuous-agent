/**
 * Gmail Client — Agent Identity Email Integration
 *
 * OAuth2 refresh token flow for Gmail API.
 * All operations are gated by IDENTITY_ENABLED and GMAIL_ENABLED env vars (both default false).
 * If disabled or credentials missing, functions return gracefully (no-op, not error).
 *
 * Env vars:
 *   IDENTITY_ENABLED=false
 *   GMAIL_ENABLED=false
 *   AGENT_EMAIL=
 *   GMAIL_REFRESH_TOKEN=
 *   GMAIL_CLIENT_ID=
 *   GMAIL_CLIENT_SECRET=
 */

import type {
  IdentityConfig,
  FetchedEmail,
  ParsedEmailIntent,
  EmailIntentType,
} from './identity-types.js';
import { log, logDeterministic } from '../core/logging.js';

// ── Configuration ───────────────────────────────────────────────────

/**
 * Load identity config from environment variables.
 * All values default to disabled/empty.
 */
export function loadIdentityConfig(): IdentityConfig {
  return {
    identityEnabled: process.env.IDENTITY_ENABLED === 'true',
    gmailEnabled: process.env.GMAIL_ENABLED === 'true',
    discordEnabled: process.env.DISCORD_ENABLED === 'true',
    agentEmail: process.env.AGENT_EMAIL || '',
    agentDisplayName: process.env.AGENT_DISPLAY_NAME || 'Agent',
    gmailRefreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    gmailClientId: process.env.GMAIL_CLIENT_ID || '',
    gmailClientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
    discordDmUserId: process.env.DISCORD_DM_USER_ID || '',
    discordMaxMessagesPerHour: parseInt(process.env.DISCORD_MAX_MESSAGES_PER_HOUR || '10', 10),
    inboxCheckInterval: parseInt(process.env.INBOX_CHECK_INTERVAL || '1', 10),
  };
}

/**
 * Check if Gmail is fully enabled and has valid credentials.
 */
export function isGmailEnabled(config?: IdentityConfig): boolean {
  const c = config || loadIdentityConfig();
  return (
    c.identityEnabled &&
    c.gmailEnabled &&
    c.gmailRefreshToken !== '' &&
    c.gmailClientId !== '' &&
    c.gmailClientSecret !== ''
  );
}

// ── OAuth2 Token Management ─────────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Exchange refresh token for a fresh access token via Google OAuth2.
 * Returns null if credentials are missing or request fails.
 */
async function getAccessToken(config: IdentityConfig): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.gmailClientId,
        client_secret: config.gmailClientSecret,
        refresh_token: config.gmailRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      log(`  Gmail OAuth2 token refresh failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return cachedAccessToken;
  } catch (error) {
    log(`  Gmail OAuth2 error: ${error}`);
    return null;
  }
}

// ── Gmail API Operations ────────────────────────────────────────────

/**
 * Fetch unread emails from the agent's Gmail inbox.
 * Returns empty array if disabled or credentials missing.
 */
export async function fetchUnreadEmails(config?: IdentityConfig): Promise<FetchedEmail[]> {
  const c = config || loadIdentityConfig();
  if (!isGmailEnabled(c)) {
    return [];
  }

  const token = await getAccessToken(c);
  if (!token) {
    log('  Gmail: Could not obtain access token — skipping inbox check');
    return [];
  }

  try {
    // List unread messages
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listResponse.ok) {
      log(`  Gmail: List messages failed: ${listResponse.status}`);
      return [];
    }

    const listData = (await listResponse.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
    };

    if (!listData.messages || listData.messages.length === 0) {
      return [];
    }

    const emails: FetchedEmail[] = [];

    for (const msg of listData.messages) {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!msgResponse.ok) continue;

        const msgData = (await msgResponse.json()) as {
          id: string;
          threadId: string;
          payload: {
            headers: Array<{ name: string; value: string }>;
            body?: { data?: string };
            parts?: Array<{ mimeType: string; body?: { data?: string } }>;
          };
          internalDate: string;
        };

        const headers = msgData.payload.headers;
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';

        // Decode body (base64url encoded)
        let body = '';
        if (msgData.payload.body?.data) {
          body = decodeBase64Url(msgData.payload.body.data);
        } else if (msgData.payload.parts) {
          const textPart = msgData.payload.parts.find(p => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = decodeBase64Url(textPart.body.data);
          }
        }

        emails.push({
          messageId: msg.id,
          from,
          subject,
          body,
          receivedAt: new Date(parseInt(msgData.internalDate, 10)).toISOString(),
          threadId: msg.threadId,
        });
      } catch (error) {
        log(`  Gmail: Error fetching message ${msg.id}: ${error}`);
      }
    }

    logDeterministic(`Gmail: Fetched ${emails.length} unread email(s)`);
    return emails;
  } catch (error) {
    log(`  Gmail: Fetch unread error: ${error}`);
    return [];
  }
}

/**
 * Send an email from the agent's Gmail address.
 * No-op if disabled.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  config?: IdentityConfig
): Promise<boolean> {
  const c = config || loadIdentityConfig();
  if (!isGmailEnabled(c)) {
    return false;
  }

  const token = await getAccessToken(c);
  if (!token) return false;

  try {
    const rawMessage = [
      `From: ${c.agentEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encoded = encodeBase64Url(rawMessage);

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!response.ok) {
      log(`  Gmail: Send failed: ${response.status} ${response.statusText}`);
      return false;
    }

    logDeterministic(`Gmail: Sent email to ${to} — Subject: ${subject}`);
    return true;
  } catch (error) {
    log(`  Gmail: Send error: ${error}`);
    return false;
  }
}

/**
 * Archive an email (remove INBOX label).
 * No-op if disabled.
 */
export async function archiveEmail(messageId: string, config?: IdentityConfig): Promise<boolean> {
  const c = config || loadIdentityConfig();
  if (!isGmailEnabled(c)) return false;

  const token = await getAccessToken(c);
  if (!token) return false;

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
      }
    );

    return response.ok;
  } catch (error) {
    log(`  Gmail: Archive error: ${error}`);
    return false;
  }
}

/**
 * Add a label to an email.
 * No-op if disabled.
 */
export async function labelEmail(
  messageId: string,
  labelId: string,
  config?: IdentityConfig
): Promise<boolean> {
  const c = config || loadIdentityConfig();
  if (!isGmailEnabled(c)) return false;

  const token = await getAccessToken(c);
  if (!token) return false;

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ addLabelIds: [labelId] }),
      }
    );

    return response.ok;
  } catch (error) {
    log(`  Gmail: Label error: ${error}`);
    return false;
  }
}

// ── Email Intent Parser ─────────────────────────────────────────────

/**
 * Parse intent from email subject and body.
 * Conservative: if intent is unclear, returns "needs_clarification".
 */
export function parseEmailIntent(email: FetchedEmail): ParsedEmailIntent {
  const subject = email.subject.toLowerCase();
  const body = email.body.toLowerCase();
  const combined = `${subject} ${body}`;

  const base: Pick<ParsedEmailIntent, 'subject' | 'from' | 'body' | 'messageId'> = {
    subject: email.subject,
    from: email.from,
    body: email.body,
    messageId: email.messageId,
  };

  // Priority change: "reprioritize X to P1", "change priority of X to P0"
  const priorityMatch = combined.match(
    /(?:reprioritize|priority|change.*priority|set.*priority|move.*to)\s+.*?(p[0-4])/i
  );
  if (priorityMatch) {
    const newPriority = priorityMatch[1].toUpperCase() as ParsedEmailIntent['newPriority'];
    // Try to extract goal title
    const goalMatch = combined.match(
      /(?:reprioritize|priority.*(?:of|for))\s+"?([^"]+?)"?\s+(?:to|as)\s+p[0-4]/i
    );
    return {
      ...base,
      type: 'priority_change',
      confidence: goalMatch ? 'high' : 'medium',
      newPriority,
      goalTitle: goalMatch?.[1]?.trim(),
    };
  }

  // New goal: "new goal:", "new task:", "please build", "create a"
  if (
    /\b(?:new\s+(?:goal|task)|please\s+(?:build|create|make|implement)|add\s+(?:goal|task))\b/.test(combined)
  ) {
    return {
      ...base,
      type: 'new_goal',
      confidence: 'high',
      goalDescription: email.body.trim(),
    };
  }

  // Approval: "[APPROVED]", "approved", "go ahead", "yes proceed"
  if (/\[approved\]|\bapproved?\b|\bgo\s+ahead\b|\byes[\s,]+proceed\b/.test(combined)) {
    return {
      ...base,
      type: 'approval',
      confidence: 'high',
      responseText: email.body.trim(),
    };
  }

  // Skip: "[SKIP]", "skip this", "cancel", "never mind"
  if (/\[skip\]|\bskip\s+this\b|\bcancel\b|\bnever\s*mind\b/.test(combined)) {
    return {
      ...base,
      type: 'skip',
      confidence: 'high',
      responseText: email.body.trim(),
    };
  }

  // Question answer: looks like a reply with substantive content
  // Check for "Re:" in subject and body has content
  if (subject.startsWith('re:') && email.body.trim().length > 10) {
    return {
      ...base,
      type: 'question_answer',
      confidence: 'medium',
      responseText: email.body.trim(),
    };
  }

  // Default: unclear intent → needs_clarification
  return {
    ...base,
    type: 'needs_clarification',
    confidence: 'low',
  };
}

// ── Base64url helpers ───────────────────────────────────────────────

function decodeBase64Url(encoded: string): string {
  // Replace URL-safe chars and add padding
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function encodeBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Exports for testing ─────────────────────────────────────────────

export { decodeBase64Url as _decodeBase64Url, encodeBase64Url as _encodeBase64Url };
