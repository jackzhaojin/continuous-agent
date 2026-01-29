/**
 * Human Input Processor
 *
 * Detects and processes human responses in needs-you.md:
 * - Parses markdown table for human responses
 * - Unblocks tasks when responses received
 * - Moves resolved items to "Resolved" section
 * - Logs human interactions for traceability
 */

import { readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { appendInputLog } from './inputs-log.js';

export interface HumanResponse {
  action: string;
  reason: string;
  response: string;
  responseType: 'APPROVED' | 'DECISION' | 'INFO' | 'SKIP' | 'OTHER';
  blocking: string;
  since: string;
  responseDetails?: string;
}

interface ProcessedInput {
  responsesFound: number;
  tasksUnblocked: string[];
}

/**
 * Parse response column to extract type and details
 *
 * Expected formats:
 * - "[APPROVED] Token: sk_abc123..."
 * - "[DECISION] Use OAuth flow"
 * - "[INFO] Here's the required data"
 * - "[SKIP] Not needed anymore"
 * - "Yes, proceed with X"
 */
function parseResponse(responseText: string): { type: HumanResponse['responseType']; details?: string } {
  const trimmed = responseText.trim();

  if (!trimmed || trimmed === '') {
    return { type: 'OTHER' };
  }

  // Check for tagged format: [TYPE] details
  const taggedMatch = trimmed.match(/^\[([A-Z]+)\]\s*(.*)$/);
  if (taggedMatch) {
    const tag = taggedMatch[1];
    const details = taggedMatch[2].trim();

    if (tag === 'APPROVED' || tag === 'DECISION' || tag === 'INFO' || tag === 'SKIP') {
      return { type: tag, details: details || undefined };
    }
  }

  // Anything non-empty is treated as OTHER response
  return { type: 'OTHER', details: trimmed };
}

/**
 * Parse needs-you.md and extract human responses
 */
function parseNeedsYouResponses(content: string): HumanResponse[] {
  const responses: HumanResponse[] = [];
  const lines = content.split('\n');

  let inActionsTable = false;
  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect "Actions Needed" section
    if (trimmed.includes('## Actions Needed')) {
      inActionsTable = true;
      headerFound = false;
      continue;
    }

    // Exit Actions Needed section when we hit another heading
    if (inActionsTable && trimmed.startsWith('##')) {
      inActionsTable = false;
      continue;
    }

    // Skip table header and separator
    if (inActionsTable && !headerFound) {
      if (trimmed.startsWith('|') && trimmed.includes('Action')) {
        headerFound = true;
        continue;
      }
      if (trimmed.startsWith('|') && trimmed.includes('---')) {
        continue;
      }
    }

    // Parse table rows
    if (inActionsTable && headerFound && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');

      // Expected: | Action | Why Agent Can't Do It | Response | Blocking | Since |
      if (cells.length >= 5) {
        const [action, reason, response, blocking, since] = cells;

        // Skip placeholder rows
        if (action.includes('*None*') || action === '') {
          continue;
        }

        // Only process rows with non-empty responses
        if (response && response !== '') {
          const parsed = parseResponse(response);
          responses.push({
            action,
            reason,
            response,
            responseType: parsed.type,
            blocking,
            since,
            responseDetails: parsed.details,
          });
        }
      }
    }
  }

  return responses;
}

/**
 * Unblock a task in its goal bundle's PROMPT.md
 * Blocked goals stay in-place in workspace/in-progress/P{n}/ — just update status from blocked to pending.
 */
async function unblockTaskInBundle(taskTitle: string): Promise<boolean> {
  const workspaceDir = path.join(process.cwd(), 'workspace');

  try {
    const { readdir } = await import('fs/promises');

    // Search in-progress/P{0-4}/ for bundles with status: blocked
    for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
      const priorityDir = path.join(workspaceDir, 'in-progress', priority);
      if (!existsSync(priorityDir)) continue;

      const dirs = await readdir(priorityDir, { withFileTypes: true });

      for (const dir of dirs) {
        if (!dir.isDirectory() || dir.name.startsWith('.')) continue;

        const bundlePath = path.join(priorityDir, dir.name);
        const promptPath = path.join(bundlePath, 'PROMPT.md');
        if (!existsSync(promptPath)) continue;

        const content = await readFile(promptPath, 'utf-8');
        // Check if this bundle's title matches
        const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
        if (titleMatch && titleMatch[1].trim() === taskTitle.trim()) {
          // Verify it's actually blocked
          const statusMatch = content.match(/^status:\s*(\S+)/m);
          if (statusMatch && statusMatch[1].toLowerCase() !== 'blocked') continue;

          // Update status from blocked to pending
          const { updateFrontmatter } = await import('./prompt-md-parser.js');
          const updated = updateFrontmatter(content, { status: 'pending' });
          await writeFile(promptPath, updated, 'utf-8');

          console.log(`  Unblocked task "${taskTitle}" in in-progress/${priority}/ (status set to pending)`);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error(`Failed to unblock task "${taskTitle}" in bundle:`, error);
    return false;
  }
}

/**
 * Move resolved entry from Actions Needed to Resolved section
 */
async function moveToResolved(response: HumanResponse): Promise<void> {
  const needsYouPath = path.join(process.cwd(), 'workspace', 'needs-you.md');

  try {
    let content = await readFile(needsYouPath, 'utf-8');
    const today = new Date().toISOString().split('T')[0];

    // Create resolved entry with more context
    let resolutionSummary = response.response;
    if (response.responseType === 'SKIP') {
      resolutionSummary = `Skipped by human request`;
    } else if (response.responseType === 'APPROVED') {
      resolutionSummary = `Approved${response.responseDetails ? ': ' + response.responseDetails.slice(0, 50) : ''}`;
    } else if (response.responseType === 'DECISION') {
      resolutionSummary = `Decision: ${response.responseDetails || 'provided'}`;
    } else if (response.responseType === 'INFO') {
      resolutionSummary = `Info provided${response.responseDetails ? ': ' + response.responseDetails.slice(0, 50) : ''}`;
    }

    const resolvedEntry = `| ${response.action} | ${resolutionSummary} | ${today} |`;

    // Insert into Resolved section
    const resolvedTable = /(\| Item \| Resolution \| Resolved Date \|\n\|[-|]+\|)/;
    if (resolvedTable.test(content)) {
      content = content.replace(resolvedTable, `$1\n${resolvedEntry}`);

      // Remove *None* placeholder if present in Resolved section
      content = content.replace(/\| \*None\* \| \| \|(\n|$)/, '');
    }

    // Remove from Actions Needed table
    // Match the entire row containing this action
    const rowPattern = new RegExp(
      `\\|\\s*${escapeRegex(response.action)}\\s*\\|[^\\n]+\\n`,
      'i'
    );
    content = content.replace(rowPattern, '');

    // If Actions Needed is now empty, add back the *None* placeholder
    const actionsTableEmpty = /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|\n\|[-|]+\|\n)(?=\n|##)/;
    if (actionsTableEmpty.test(content)) {
      content = content.replace(
        actionsTableEmpty,
        '$1| *None* | | | | |\n'
      );
    }

    await writeFile(needsYouPath, content, 'utf-8');
  } catch (error) {
    console.error(`Failed to move response to resolved:`, error);
  }
}

/**
 * Log human interaction to work ledger
 */
async function logHumanInteraction(response: HumanResponse): Promise<void> {
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');

  const entry = JSON.stringify({
    event: 'HUMAN_INPUT_RECEIVED',
    ts: new Date().toISOString(),
    action: response.action,
    response_type: response.responseType,
    response: response.response,
    blocking_level: response.blocking,
  });

  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}

/**
 * Main entry point: Process all human inputs from needs-you.md
 */
export async function processHumanInputs(): Promise<ProcessedInput> {
  const needsYouPath = path.join(process.cwd(), 'workspace', 'needs-you.md');

  if (!existsSync(needsYouPath)) {
    return { responsesFound: 0, tasksUnblocked: [] };
  }

  try {
    const content = await readFile(needsYouPath, 'utf-8');
    const responses = parseNeedsYouResponses(content);

    if (responses.length === 0) {
      return { responsesFound: 0, tasksUnblocked: [] };
    }

    const tasksUnblocked: string[] = [];

    for (const response of responses) {
      console.log(`[${new Date().toISOString()}] Processing human response: ${response.action}`);
      console.log(`  Type: ${response.responseType}`);
      console.log(`  Response: ${response.response}`);

      // Validate response format and provide warnings
      if (response.responseType === 'OTHER') {
        console.log(`  ⚠️  Warning: Response not tagged with [APPROVED]/[DECISION]/[INFO]/[SKIP]`);
        console.log(`     Will treat as general approval, but consider using explicit tags for clarity`);
      }

      // Log the interaction
      await logHumanInteraction(response);
      await appendInputLog({
        source: 'needs-you',
        ts: new Date().toISOString(),
        raw_input: response.response,
        priority: response.blocking,
        scope_allowed: ['workspace/needs-you.md'],
        intent_type: response.responseType.toLowerCase(),
        metadata: {
          action: response.action,
          reason: response.reason,
          response_type: response.responseType,
        },
      });

      // Handle based on response type
      if (response.responseType === 'SKIP') {
        // Just move to resolved, don't unblock
        console.log(`  Action: Skipping task as requested`);
        await moveToResolved(response);
      } else {
        // All other response types: unblock the task
        const unblocked = await unblockTaskInBundle(response.action);
        if (unblocked) {
          console.log(`  Action: Unblocked task in goal bundle`);
          console.log(`  Task will be retried with fresh context (10 new attempts)`);
          tasksUnblocked.push(response.action);
        } else {
          console.log(`  Warning: Could not find matching task in goal bundles`);
          console.log(`     Task may have been renamed or removed. Check workspace/blocked/ manually.`);
        }

        // Move to resolved section
        await moveToResolved(response);
      }
    }

    return {
      responsesFound: responses.length,
      tasksUnblocked,
    };
  } catch (error) {
    console.error(`Failed to process human inputs:`, error);
    return { responsesFound: 0, tasksUnblocked: [] };
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
