/**
 * State management - MOSTLY DETERMINISTIC
 * Updates workspace files (goals.md, needs-you.md, ledgers)
 */

import { readFile, writeFile, appendFile } from 'fs/promises';
import path from 'path';
import {
  updateStepStatus,
  updateTaskProgressFromSteps,
} from './work-selector.js';
import type { WorkItem, WorkStep } from './types.js';
import { logDeterministic, log, logAgentic } from './logging.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');
const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');

/**
 * Escape special regex characters
 * DETERMINISTIC: String manipulation
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update task state in goals.md
 * DETERMINISTIC: File I/O and pattern matching
 */
export async function updateTaskState(
  item: WorkItem,
  success: boolean,
  errorInfo?: string,
  outputPath?: string
): Promise<void> {
  logDeterministic('Updating goals.md...');

  const goalsPath = path.join(WORKSPACE_DIR, 'goals.md');
  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');

  try {
    const content = await readFile(goalsPath, 'utf-8');
    const newStatus = success ? 'Complete' : 'In Progress';

    // Update status line
    const titlePattern = new RegExp(
      `(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`,
      'i'
    );

    if (titlePattern.test(content)) {
      const updatedContent = content.replace(titlePattern, `$1 ${newStatus}`);
      await writeFile(goalsPath, updatedContent, 'utf-8');
      log(`  Updated: ${item.title} → ${newStatus}`);
    }

    // Log to work ledger
    if (success) {
      const entry = JSON.stringify({
        event: 'TASK_COMPLETED',
        ts: new Date().toISOString(),
        task_id: item.id,
        title: item.title,
        output_path: outputPath || null,
      });
      await appendFile(ledgerPath, entry + '\n', 'utf-8');
    }
  } catch (error) {
    log(`  Failed to update goals.md: ${error}`);
  }
}

/**
 * Update step state in goals.md
 * DETERMINISTIC: File I/O and pattern matching
 */
export async function updateStepState(
  item: WorkItem,
  step: WorkStep,
  success: boolean,
  errorInfo?: string,
  outputPath?: string
): Promise<void> {
  logDeterministic('Updating step status...');

  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');
  const now = new Date().toISOString();

  try {
    if (success) {
      // Update the step in the local copy
      const stepToUpdate = item.steps?.[step.step_number];
      if (stepToUpdate) {
        stepToUpdate.status = 'complete';
        stepToUpdate.completed_at = now;
      }
      await updateTaskProgressFromSteps(item.title, item.steps || []);

      // Log step completion
      const entry = JSON.stringify({
        event: 'STEP_COMPLETED',
        ts: now,
        task_id: item.id,
        task_title: item.title,
        step_number: step.step_number + 1,
        step_title: step.title,
        output_path: outputPath || null,
      });
      await appendFile(ledgerPath, entry + '\n', 'utf-8');

      log(`  ✓ Step ${step.step_number + 1} complete`);

      // Check if this was the last step
      if (item.steps) {
        const remainingSteps = item.steps.filter((s) => s.status !== 'complete');
        if (remainingSteps.length === 0) {
          log(`  ✓ All steps complete! Marking task as complete.`);
          await updateTaskState(item, true, undefined, outputPath);
        } else {
          log(`  ${remainingSteps.length} steps remaining`);
        }
      }
    } else {
      // Log step failure
      const entry = JSON.stringify({
        event: 'STEP_ATTEMPT_FAILED',
        ts: now,
        task_id: item.id,
        task_title: item.title,
        step_number: step.step_number + 1,
        step_title: step.title,
        error: errorInfo?.slice(0, 500) || 'Unknown error',
      });
      await appendFile(ledgerPath, entry + '\n', 'utf-8');
    }
  } catch (error) {
    log(`  Failed to update step state: ${error}`);
  }
}

/**
 * Write to needs-you.md when task is blocked
 * DETERMINISTIC: File I/O
 */
export async function writeToNeedsYou(
  item: WorkItem,
  attempts: number,
  lastError: string
): Promise<void> {
  logAgentic('Escalating to needs-you.md (human intervention required)');

  const needsYouPath = path.join(WORKSPACE_DIR, 'needs-you.md');

  try {
    let content = await readFile(needsYouPath, 'utf-8');
    const today = new Date().toISOString().split('T')[0];

    const errorMessage = `Failed after ${attempts} attempts. Last error: ${lastError.slice(0, 200)}`;
    const newEntry = `| ${item.title} | ${errorMessage} | | BLOCKING | ${today} |`;

    // Insert after the "Actions Needed" table header
    const actionsTable =
      /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|\n\|[-|]+\|)/;
    if (actionsTable.test(content)) {
      content = content.replace(actionsTable, `$1\n${newEntry}`);
      // Remove "None" placeholder if present
      content = content.replace(/\| \*None\* \| \| \| \| \|/, '');
      await writeFile(needsYouPath, content, 'utf-8');
      log(`  ✓ Added entry to needs-you.md`);
    }
  } catch (error) {
    log(`  Failed to write to needs-you.md: ${error}`);
  }
}

/**
 * Escalate with diagnostic pattern details
 * AGENTIC: Uses diagnostic agent's analysis
 */
export async function escalateWithDiagnosis(
  item: WorkItem,
  attempts: number,
  diagnosis: string
): Promise<void> {
  logAgentic('Escalating with diagnostic details...');

  const needsYouPath = path.join(WORKSPACE_DIR, 'needs-you.md');

  try {
    let content = await readFile(needsYouPath, 'utf-8');
    const today = new Date().toISOString().split('T')[0];

    const newEntry = `| ${item.title} | ${diagnosis} | | BLOCKING | ${today} |`;

    const actionsTable =
      /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|\n\|[-|]+\|)/;
    if (actionsTable.test(content)) {
      content = content.replace(actionsTable, `$1\n${newEntry}`);
      content = content.replace(/\| \*None\* \| \| \| \| \|/, '');
      await writeFile(needsYouPath, content, 'utf-8');
      log(`  ✓ Escalated to needs-you.md with diagnostic`);
    }
  } catch (error) {
    log(`  Failed to escalate to needs-you.md: ${error}`);
  }
}

/**
 * Mark task as blocked in goals.md
 * DETERMINISTIC: File I/O
 */
export async function markTaskBlocked(item: WorkItem): Promise<void> {
  logDeterministic('Marking task as blocked in goals.md...');

  const goalsPath = path.join(WORKSPACE_DIR, 'goals.md');

  try {
    const content = await readFile(goalsPath, 'utf-8');
    const titlePattern = new RegExp(
      `(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`,
      'i'
    );

    if (titlePattern.test(content)) {
      const updatedContent = content.replace(titlePattern, `$1 Blocked`);
      await writeFile(goalsPath, updatedContent, 'utf-8');
      log(`  Updated: ${item.title} → Blocked`);
    }
  } catch (error) {
    log(`  Failed to mark task as blocked: ${error}`);
  }
}

/**
 * Mark step as blocked in goals.md
 * DETERMINISTIC: File I/O
 */
export async function markStepBlocked(item: WorkItem, stepNumber: number): Promise<void> {
  logDeterministic(`Marking step ${stepNumber + 1} as blocked...`);

  try {
    await updateStepStatus(item.title, stepNumber, 'blocked');
    log(`  ✓ Step ${stepNumber + 1} marked as blocked`);
  } catch (error) {
    log(`  Failed to mark step as blocked: ${error}`);
  }
}
