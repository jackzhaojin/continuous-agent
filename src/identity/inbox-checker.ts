/**
 * Inbox Checker — Phase 0.5 of the Executive Loop
 *
 * AGENTIC communication module. The LLM is the agent driving all email
 * decisions — this TypeScript is just plumbing that fetches emails,
 * hands them to Claude, and executes Claude's decisions.
 *
 * Flow:
 * 1. Fetch unread emails from Gmail API
 * 2. Bail early on obvious self-replies (only deterministic check)
 * 3. Hand ALL emails to the LLM in a single batch for triage
 * 4. Execute the LLM's decisions: queue actionable intents, send replies, archive
 * 5. Hard throttle on outbound sends as a safety net (max 3/hour)
 *
 * If identity is disabled, this is a complete no-op.
 * Configurable: runs every N iterations (INBOX_CHECK_INTERVAL, default 1).
 */

import type { InboxCheckResult, ParsedEmailIntent, FetchedEmail } from './identity-types.js';
import {
  loadIdentityConfig,
  isGmailEnabled,
  fetchUnreadEmails,
  sendEmail,
  archiveEmail,
  labelEmail,
} from './gmail-client.js';
import { log, logDeterministic } from '../core/logging.js';
import { getChatCompletionProvider, resolveChatModel } from '../core/vendor/index.js';

// ── Outbound Send Throttle ─────────────────────────────────────────
// Hard safety limit: max 3 outbound emails per hour.
// This is a safety net, not the primary filter — the LLM should be
// making smart decisions above this. But if something goes wrong,
// this prevents a 297-email flood.

const SEND_MAX_PER_HOUR = 3;
const sendTimestamps: number[] = [];

function isSendThrottled(): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  while (sendTimestamps.length > 0 && sendTimestamps[0] < oneHourAgo) {
    sendTimestamps.shift();
  }
  return sendTimestamps.length >= SEND_MAX_PER_HOUR;
}

function recordSend(): void {
  sendTimestamps.push(Date.now());
}

// ── Agentic Email Triage ───────────────────────────────────────────

interface TriagedEmail {
  /** Index into the emails array */
  index: number;
  action: 'queue' | 'reply' | 'archive';
  intentType?: string;
  confidence?: string;
  reasoning: string;
  /** For queue: extracted data (goal description, priority, response text) */
  extractedData?: Record<string, string>;
  /** For reply: what to say (LLM-authored, context-aware) */
  replyBody?: string;
  replySubject?: string;
}

interface TriageBatchResult {
  decisions: TriagedEmail[];
}

/**
 * Hand a batch of emails to the LLM for triage.
 * The LLM decides what to do with each one — queue, reply, or archive.
 * Returns structured decisions for the orchestrator to execute.
 */
async function triageEmails(emails: FetchedEmail[], agentEmail: string): Promise<TriagedEmail[]> {
  const chatProvider = getChatCompletionProvider();
  const model = resolveChatModel();

  const emailSummaries = emails.map((e, i) => (
    `[${i}] From: ${e.from}\n    Subject: ${e.subject}\n    Body: ${e.body.slice(0, 800)}${e.body.length > 800 ? '...' : ''}`
  )).join('\n\n');

  const prompt = `You are the communications agent for an autonomous executive AI system. You manage all inbound email for the agent's mailbox (${agentEmail}).

Your job: look at each email below and decide what to do with it.

## EMAILS

${emailSummaries}

## YOUR OPTIONS (per email)

- **"archive"** — Silently archive. Use for: automated notifications, bounces, delivery failures, marketing, newsletters, system alerts, no-reply senders, emails from services (Notion, Discord, GitHub, etc.), anything that isn't a human trying to communicate with this agent. **When in doubt, archive.**
- **"queue"** — This is a human with an actionable request. Extract the intent. Valid intents: new_goal, priority_change, approval, question_answer, skip.
- **"reply"** — This is a human trying to communicate but the intent is unclear. Write a helpful, specific reply. **Use sparingly** — only when you're confident it's a real person who needs guidance. Never reply to automated systems. Never reply to bounce notifications.

## SAFETY RULES

1. NEVER reply to emails from: mailer-daemon, postmaster, noreply, no-reply, notifications@, or any automated service
2. NEVER reply to delivery failure / bounce notifications — always archive
3. NEVER reply to emails from ${agentEmail} (that's us)
4. When in doubt between "reply" and "archive", choose "archive"
5. Max 1-2 replies per batch — if many emails are unclear, archive most and reply to the most important one only

Respond with JSON:
{
  "decisions": [
    {
      "index": 0,
      "action": "archive" | "queue" | "reply",
      "intentType": "new_goal" | "priority_change" | "approval" | "question_answer" | "skip",
      "confidence": "high" | "medium" | "low",
      "reasoning": "brief explanation",
      "extractedData": { "goalDescription": "...", "newPriority": "P2", "responseText": "..." },
      "replyBody": "only if action is reply",
      "replySubject": "only if action is reply"
    }
  ]
}`;

  const result = await chatProvider.complete({
    model,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1500,
    temperature: 0.1,
  });

  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in triage response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as TriageBatchResult;
  return parsed.decisions || [];
}

// ── Main Entry Point ───────────────────────────────────────────────

/**
 * Check inbox and return parsed intents.
 * This is the main entry point for Phase 0.5.
 */
export async function checkInbox(currentIteration: number): Promise<InboxCheckResult> {
  const config = loadIdentityConfig();

  const noopResult: InboxCheckResult = {
    emailsFetched: 0,
    actionableIntents: 0,
    clarificationsSent: 0,
    intents: [],
  };

  // Kill switch check
  if (!config.identityEnabled || !config.gmailEnabled) {
    return noopResult;
  }

  // Interval gating: only check every N iterations
  if (config.inboxCheckInterval > 1 && currentIteration % config.inboxCheckInterval !== 0) {
    return noopResult;
  }

  // Credential check
  if (!isGmailEnabled(config)) {
    return noopResult;
  }

  logDeterministic('PHASE 0.5: Check Inbox (Gmail) [AGENTIC]');

  try {
    const emails = await fetchUnreadEmails(config);

    if (emails.length === 0) {
      log('  No unread emails');
      return noopResult;
    }

    log(`  Found ${emails.length} unread email(s)`);

    // Only deterministic check: skip our own emails before LLM call
    const externalEmails: FetchedEmail[] = [];
    for (const email of emails) {
      const from = email.from.toLowerCase();
      if (config.agentEmail && from.includes(config.agentEmail.toLowerCase())) {
        log(`  [SELF] Archiving self-sent email: "${email.subject}"`);
        await archiveEmail(email.messageId, config);
      } else {
        externalEmails.push(email);
      }
    }

    if (externalEmails.length === 0) {
      log('  All emails were self-sent — nothing to triage');
      return noopResult;
    }

    // ── Agentic triage: hand emails to the LLM ──
    let decisions: TriagedEmail[];
    try {
      decisions = await triageEmails(externalEmails, config.agentEmail);
      log(`  [AGENTIC] LLM returned ${decisions.length} decision(s)`);
    } catch (error) {
      // LLM unavailable — archive everything rather than risk spamming
      log(`  [AGENTIC] Triage LLM call failed (${error}) — archiving all emails as safety fallback`);
      for (const email of externalEmails) {
        await archiveEmail(email.messageId, config);
      }
      return { ...noopResult, emailsFetched: emails.length };
    }

    // ── Execute the LLM's decisions ──
    const intents: ParsedEmailIntent[] = [];
    let actionableCount = 0;
    let repliesSent = 0;
    let archivedCount = 0;

    for (const decision of decisions) {
      const email = externalEmails[decision.index];
      if (!email) {
        log(`  [WARN] LLM referenced invalid email index ${decision.index} — skipping`);
        continue;
      }

      log(`  [${decision.action.toUpperCase()}] ${email.from}: "${email.subject}" — ${decision.reasoning}`);

      if (decision.action === 'queue' && decision.intentType) {
        // Actionable — build intent and queue for Phase 2
        const intent: ParsedEmailIntent = {
          type: decision.intentType as ParsedEmailIntent['type'],
          confidence: (decision.confidence || 'medium') as ParsedEmailIntent['confidence'],
          subject: email.subject,
          from: email.from,
          body: email.body,
          messageId: email.messageId,
          goalDescription: decision.extractedData?.goalDescription,
          newPriority: decision.extractedData?.newPriority as ParsedEmailIntent['newPriority'],
          responseText: decision.extractedData?.responseText,
        };
        intents.push(intent);
        actionableCount++;
        await labelEmail(email.messageId, 'PROCESSED', config);
        await archiveEmail(email.messageId, config);

      } else if (decision.action === 'reply' && decision.replyBody) {
        // Reply — but only if not throttled
        if (isSendThrottled()) {
          log(`  [THROTTLED] Skipping reply to ${email.from} — max ${SEND_MAX_PER_HOUR}/hour reached, archiving instead`);
          await archiveEmail(email.messageId, config);
          continue;
        }

        const subject = decision.replySubject || `Re: ${email.subject}`;
        const sent = await sendEmail(email.from, subject, decision.replyBody, config);
        if (sent) {
          repliesSent++;
          recordSend();
          log(`  Sent reply to ${email.from}`);
        }
        await archiveEmail(email.messageId, config);

      } else {
        // Archive — silent
        await archiveEmail(email.messageId, config);
        archivedCount++;
      }
    }

    // Archive any emails the LLM didn't mention (defensive)
    const mentionedIndices = new Set(decisions.map(d => d.index));
    for (let i = 0; i < externalEmails.length; i++) {
      if (!mentionedIndices.has(i)) {
        log(`  [UNMENTIONED] LLM skipped email ${i} — archiving as safety fallback`);
        await archiveEmail(externalEmails[i].messageId, config);
        archivedCount++;
      }
    }

    logDeterministic(
      `  Inbox check complete: ${actionableCount} queued, ${repliesSent} replies, ${archivedCount} archived`
    );

    return {
      emailsFetched: emails.length,
      actionableIntents: actionableCount,
      clarificationsSent: repliesSent,
      intents,
    };
  } catch (error) {
    log(`  Inbox check error (non-blocking): ${error}`);
    return noopResult;
  }
}
