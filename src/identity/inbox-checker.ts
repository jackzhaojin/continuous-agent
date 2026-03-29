/**
 * Inbox Checker — Phase 0.5 of the Executive Loop
 *
 * Fetches unread emails, parses intents, and queues actionable items.
 * Non-actionable emails get a clarification reply sent back.
 * If identity is disabled, this is a complete no-op.
 *
 * Configurable: runs every N iterations (INBOX_CHECK_INTERVAL, default 1).
 */

import type { InboxCheckResult, ParsedEmailIntent } from './identity-types.js';
import {
  loadIdentityConfig,
  isGmailEnabled,
  fetchUnreadEmails,
  parseEmailIntent,
  sendEmail,
  archiveEmail,
  labelEmail,
} from './gmail-client.js';
import { log, logDeterministic } from '../core/logging.js';

/**
 * Check inbox and return parsed intents.
 * This is the main entry point for Phase 0.5.
 *
 * @param currentIteration - Current loop iteration number (for interval gating)
 * @returns InboxCheckResult with parsed intents for Phase 2 processing
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

  logDeterministic('PHASE 0.5: Check Inbox (Gmail)');

  try {
    const emails = await fetchUnreadEmails(config);

    if (emails.length === 0) {
      log('  No unread emails');
      return noopResult;
    }

    log(`  Found ${emails.length} unread email(s)`);

    const intents: ParsedEmailIntent[] = [];
    let actionableCount = 0;
    let clarificationCount = 0;

    for (const email of emails) {
      const intent = parseEmailIntent(email);
      log(`  Email from ${email.from}: "${email.subject}" → intent: ${intent.type} (${intent.confidence})`);

      if (intent.type === 'needs_clarification') {
        // Send clarification reply and archive
        const replyBody = [
          `Hello,`,
          ``,
          `I received your email but couldn't determine a clear action from it.`,
          ``,
          `I can help with:`,
          `- Priority changes: "Reprioritize [goal name] to P1"`,
          `- New goals: "New goal: Build a landing page for X"`,
          `- Approvals: "[APPROVED] Go ahead with the OAuth approach"`,
          `- Answers: Reply to a thread I started with your decision`,
          ``,
          `Could you rephrase your request using one of these formats?`,
          ``,
          `— Executive Agent`,
        ].join('\n');

        const sent = await sendEmail(
          email.from,
          `Re: ${email.subject}`,
          replyBody,
          config
        );

        if (sent) {
          clarificationCount++;
          log(`  Sent clarification reply to ${email.from}`);
        }

        // Archive the unclear email
        await archiveEmail(email.messageId, config);
      } else {
        // Actionable intent — add to queue
        intents.push(intent);
        actionableCount++;

        // Label as processed and archive
        await labelEmail(email.messageId, 'PROCESSED', config);
        await archiveEmail(email.messageId, config);
      }
    }

    logDeterministic(`  Inbox check complete: ${actionableCount} actionable, ${clarificationCount} clarifications sent`);

    return {
      emailsFetched: emails.length,
      actionableIntents: actionableCount,
      clarificationsSent: clarificationCount,
      intents,
    };
  } catch (error) {
    log(`  Inbox check error (non-blocking): ${error}`);
    return noopResult;
  }
}
