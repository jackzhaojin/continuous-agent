/**
 * State management - MOSTLY DETERMINISTIC
 * Updates workspace files (goals.md, needs-you.md, ledgers)
 */

import { readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import {
  updateStepStatus,
  updateTaskProgressFromSteps,
} from '../agentic/work-selection/work-selector.js';
import type { WorkItem, WorkStep } from '../core/types.js';
import { logDeterministic, log, logAgentic } from '../core/logging.js';
import {
  markPracticeCompleted,
  markRetrospectiveCompleted,
  markReferenceRefreshCompleted,
} from './self-improvement-state.js';
import { reportMilestone } from './notion-reporter.js';
import { parsePromptMd, updateFrontmatter } from './prompt-md-parser.js';
import { generateGoalsIndex } from './goal-index-generator.js';
import { appendProjectMemory, type ProjectMemoryEntry } from './project-memory-store.js';
import { registerProject, generateProjectSlug, findProjectBySlug, type ProjectRegistryEntry } from './project-registry.js';

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
 * Update PROMPT.md frontmatter for a goal bundle
 * V1.2: Updates the PROMPT.md file directly instead of regex on goals.md
 */
export async function updatePromptMdStatus(
  sourcePath: string,
  updates: Record<string, string>
): Promise<boolean> {
  const promptPath = path.join(sourcePath, 'PROMPT.md');

  try {
    if (!existsSync(promptPath)) {
      log(`  Warning: No PROMPT.md at ${promptPath}`);
      return false;
    }

    const content = await readFile(promptPath, 'utf-8');
    const updated = updateFrontmatter(content, updates);
    await writeFile(promptPath, updated, 'utf-8');
    log(`  Updated PROMPT.md at ${sourcePath}`);
    return true;
  } catch (error) {
    log(`  Failed to update PROMPT.md: ${error}`);
    return false;
  }
}

/**
 * Update task state after execution
 * V1.2: PROMPT.md is the source of truth. goals.md update is best-effort.
 * DETERMINISTIC: File I/O and pattern matching
 */
export async function updateTaskState(
  item: WorkItem,
  success: boolean,
  errorInfo?: string,
  outputPath?: string,
  contractId?: string,
  workerOutput?: string
): Promise<void> {
  logDeterministic('Updating task state...');

  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');

  // --- V1.2 primary operations (independent of goals.md) ---

  if (success) {
    // Log to work ledger
    const entry = JSON.stringify({
      event: 'TASK_COMPLETED',
      ts: new Date().toISOString(),
      task_id: item.id,
      title: item.title,
      output_path: outputPath || null,
    });
    await appendFile(ledgerPath, entry + '\n', 'utf-8');

    // Report milestone to Notion (fire-and-forget)
    await reportMilestone('Completed', item, contractId, { outputPath });

    // V1.2: Record project memory entry
    try {
      const memoryEntry: ProjectMemoryEntry = {
        id: item.id || `task-${Date.now()}`,
        name: item.title,
        category: detectProjectCategory(item),
        completed: new Date().toISOString().split('T')[0],
        output_path: outputPath || '',
        archive_path: item.source_path ? item.source_path.replace(/in-progress\/P\d\//, 'archive/') : undefined,
        capabilities_exercised: inferProjectCapabilities(item),
        features_built: extractFeaturesFromOutput(workerOutput),
        lessons: extractLessonsFromOutput(workerOutput),
      };
      appendProjectMemory(memoryEntry);
      logDeterministic('  Recorded project memory entry');
    } catch (memErr) {
      log(`  Warning: Failed to record project memory: ${memErr}`);
    }

    // V1.2: Register project in registry for reuse
    try {
      if (outputPath) {
        const regEntry: ProjectRegistryEntry = {
          slug: generateProjectSlug(item.title),
          title: item.title,
          output_path: outputPath,
          completed: new Date().toISOString().split('T')[0],
          category: detectProjectCategory(item),
          capabilities: inferProjectCapabilities(item),
          reusable: true,
        };
        registerProject(regEntry);
        logDeterministic('  Registered project in registry');
      }
    } catch (regErr) {
      log(`  Warning: Failed to register project: ${regErr}`);
    }

    // Track self-improvement completions
    if (item.title.includes('[SELF-ENHANCE] Practice')) {
      await markPracticeCompleted();
      logDeterministic('  Marked practice loop as completed in self-improvement state');
    } else if (item.title.includes('[SELF-ENHANCE] Weekly Retrospective') || item.title.includes('[SELF-ENHANCE] Retrospective')) {
      await markRetrospectiveCompleted();
      logDeterministic('  Marked retrospective as completed in self-improvement state');
    } else if (item.title.includes('[SELF-ENHANCE] Reference Refresh')) {
      await markReferenceRefreshCompleted();
      logDeterministic('  Marked reference refresh as completed in self-improvement state');
    }

    // Self-enhance tasks need human review before merge
    if (item.selfEnhance && item.branch) {
      await requestSelfEnhanceReview(item);
    }

    // V1.2: Multi-project patch generation and approval
    if (item.source_project && outputPath) {
      try {
        const sourceEntry = findProjectBySlug(item.source_project);
        if (sourceEntry && existsSync(sourceEntry.output_path)) {
          const patchContent = execSync(
            `git diff --no-index "${sourceEntry.output_path}" "${outputPath}" || true`,
            { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
          );
          const patchPath = path.join(outputPath, 'source-project-changes.patch');
          await writeFile(patchPath, patchContent, 'utf-8');
          log(`  Generated multi-project patch: ${patchPath}`);

          // Request human approval for copy-back
          await requestMultiProjectApproval(item, outputPath);
        } else {
          log(`  Warning: Source project "${item.source_project}" not found or path missing, skipping patch generation`);
        }
      } catch (patchError) {
        log(`  Failed to generate multi-project patch: ${patchError}`);
      }
    }
  } else {
    // Report failure milestone to Notion (fire-and-forget)
    await reportMilestone('Failed', item, contractId, {
      errorSummary: errorInfo,
    });
  }

  // V1.2: Update PROMPT.md (source of truth for goal bundles)
  if (item.source_path) {
    await updatePromptMdStatus(item.source_path, {
      status: success ? 'complete' : 'in_progress',
      ...(outputPath ? { output_path: outputPath } : {}),
    });
  }

  // Legacy: Best-effort update of goals.md (auto-generated index)
  try {
    const goalsPath = path.join(WORKSPACE_DIR, 'goals.md');
    if (existsSync(goalsPath)) {
      const content = await readFile(goalsPath, 'utf-8');
      const newStatus = success ? 'Complete' : 'In Progress';
      const titlePattern = new RegExp(
        `(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`,
        'i'
      );
      if (titlePattern.test(content)) {
        const updatedContent = content.replace(titlePattern, `$1 ${newStatus}`);
        await writeFile(goalsPath, updatedContent, 'utf-8');
        log(`  Updated goals.md index: ${item.title} → ${newStatus}`);
      }
    }
  } catch (goalsErr) {
    log(`  Warning: Failed to update goals.md index: ${goalsErr}`);
  }

  // Regenerate goals.md index from folder tree
  await generateGoalsIndex();
}

/**
 * Request human review for completed self-enhance task
 * Adds entry to needs-you.md with branch info
 */
async function requestSelfEnhanceReview(item: WorkItem): Promise<void> {
  const needsYouPath = path.join(WORKSPACE_DIR, 'needs-you.md');
  const today = new Date().toISOString().split('T')[0];

  try {
    let content = await readFile(needsYouPath, 'utf-8');

    const reviewEntry = `| Review & merge: ${item.title} | Branch \`${item.branch}\` ready for review. Run: \`git checkout ${item.branch} && git diff main...HEAD\` | | HIGH | ${today} |`;

    // Insert after the Actions Needed table header
    const tablePattern = /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|)\n(\| \*None\* \||\|[^\n]+\|)/;
    if (tablePattern.test(content)) {
      content = content.replace(tablePattern, `$1\n${reviewEntry}`);
      await writeFile(needsYouPath, content, 'utf-8');
      log(`  Added review request to needs-you.md for branch: ${item.branch}`);
    }
  } catch (error) {
    log(`  Failed to add review request: ${error}`);
  }
}

/**
 * Request human approval for copying multi-project changes back to source
 * Adds entry to needs-you.md with patch file reference
 * DETERMINISTIC: File I/O
 */
async function requestMultiProjectApproval(item: WorkItem, outputPath: string): Promise<void> {
  const needsYouPath = path.join(WORKSPACE_DIR, 'needs-you.md');
  const today = new Date().toISOString().split('T')[0];

  try {
    let content = await readFile(needsYouPath, 'utf-8');

    const approvalEntry = `| Copy-back: ${item.title} to ${item.source_project} | Diff in: ${outputPath}/source-project-changes.patch | | BLOCKING | ${today} |`;

    // Insert after the Actions Needed table header
    const tablePattern = /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|)\n(\| \*None\* \||\|[^\n]+\|)/;
    if (tablePattern.test(content)) {
      content = content.replace(tablePattern, `$1\n${approvalEntry}`);
      await writeFile(needsYouPath, content, 'utf-8');
      log(`  Added multi-project approval request to needs-you.md for source: ${item.source_project}`);
    }
  } catch (error) {
    log(`  Failed to add multi-project approval request: ${error}`);
  }
}

/**
 * Set the output path for a task
 * V1.2: Updates PROMPT.md frontmatter (source of truth) + goals.md index (best-effort)
 * DETERMINISTIC: File I/O and pattern matching
 */
export async function setTaskOutputPath(
  taskTitle: string,
  outputPath: string,
  sourcePath?: string
): Promise<boolean> {
  log(`  Persisting output path: ${outputPath}`);

  // V1.2: Update PROMPT.md frontmatter (source of truth)
  if (sourcePath) {
    const updated = await updatePromptMdStatus(sourcePath, { output_path: outputPath });
    if (updated) {
      logDeterministic(`  Updated PROMPT.md output_path for "${taskTitle}"`);
    }
  }

  // Legacy: Best-effort update of goals.md index
  const goalsPath = path.join(WORKSPACE_DIR, 'goals.md');
  if (!existsSync(goalsPath)) {
    logDeterministic('  goals.md not found — skipping legacy output path update');
    return true; // PROMPT.md is the source of truth
  }

  try {
    let content = await readFile(goalsPath, 'utf-8');
    const escapedTitle = escapeRegex(taskTitle);

    // Check if Output line already exists for this task
    const existingOutputPattern = new RegExp(
      `(###\\s+${escapedTitle}[\\s\\S]*?)(- \\*\\*Output:\\*\\*)\\s*[^\\n]+`,
      'i'
    );

    if (existingOutputPattern.test(content)) {
      content = content.replace(existingOutputPattern, `$1$2 ${outputPath}`);
      logDeterministic(`  Updated existing Output path in goals.md for "${taskTitle}"`);
    } else {
      const addAfterDescPattern = new RegExp(
        `(###\\s+${escapedTitle}[\\s\\S]*?- \\*\\*Description:\\*\\*\\s*[^\\n]+)`,
        'i'
      );
      const addAfterStatusPattern = new RegExp(
        `(###\\s+${escapedTitle}[\\s\\S]*?- \\*\\*Status:\\*\\*\\s*[^\\n]+)`,
        'i'
      );

      if (addAfterDescPattern.test(content)) {
        content = content.replace(addAfterDescPattern, `$1\n- **Output:** ${outputPath}`);
      } else if (addAfterStatusPattern.test(content)) {
        content = content.replace(addAfterStatusPattern, `$1\n- **Output:** ${outputPath}`);
      } else {
        return true; // PROMPT.md was updated, goals.md pattern not found is fine
      }
    }

    await writeFile(goalsPath, content, 'utf-8');
    return true;
  } catch (error) {
    log(`  Warning: Failed to update goals.md index output path: ${error}`);
    return true; // PROMPT.md is the source of truth
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
  outputPath?: string,
  contractId?: string
): Promise<void> {
  logDeterministic('Updating step status...');

  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');
  const now = new Date().toISOString();

  try {
    if (success) {
      // Update the step status in goals.md
      // This writes the individual step's status to the file
      log(`  [DEBUG] About to call updateStepStatus with: "${item.title}", ${step.step_number}, "complete"`);
      try {
        await updateStepStatus(item.title, step.step_number, 'complete');
        log(`  [DEBUG] updateStepStatus returned successfully`);
      } catch (updateErr) {
        log(`  [ERROR] updateStepStatus failed: ${updateErr}`);
      }

      // Update the step in the local copy for progress calculation
      const stepToUpdate = item.steps?.[step.step_number];
      if (stepToUpdate) {
        stepToUpdate.status = 'complete';
        stepToUpdate.completed_at = now;
      }

      // Update the parent task's progress status
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

      // Report step completion milestone to Notion (fire-and-forget)
      await reportMilestone('Step Completed', item, contractId, {
        stepTitle: step.title,
        stepNumber: step.step_number + 1,
        outputPath,
      });

      log(`  ✓ Step ${step.step_number + 1} complete`);

      // Check if this was the last step
      if (item.steps) {
        const remainingSteps = item.steps.filter((s) => s.status !== 'complete');
        if (remainingSteps.length === 0) {
          log(`  ✓ All steps complete! Marking task as complete.`);
          await updateTaskState(item, true, undefined, outputPath, contractId);
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
  lastError: string,
  contractId?: string
): Promise<void> {
  logAgentic('Escalating to needs-you.md (human intervention required)');

  const needsYouPath = path.join(WORKSPACE_DIR, 'needs-you.md');

  try {
    let content = await readFile(needsYouPath, 'utf-8');
    const today = new Date().toISOString().split('T')[0];

    // Enhanced error message with better truncation (preserve context)
    // Extract first 300 chars, but try to break at sentence/line boundary
    let errorSnippet = lastError.slice(0, 300);
    const lastPeriod = errorSnippet.lastIndexOf('.');
    const lastNewline = errorSnippet.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > 100) {
      // Only break early if we have substantial content before the break
      errorSnippet = errorSnippet.slice(0, breakPoint + 1);
    }

    // Add log reference if contract ID available
    const logReference = contractId
      ? ` See ledgers/${today}/worker-${contractId}.log for details.`
      : '';

    const errorMessage = `Failed after ${attempts} attempts.${logReference} Error: ${errorSnippet}`;
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
  diagnosis: string,
  contractId?: string
): Promise<void> {
  logAgentic('Escalating with diagnostic details...');

  const needsYouPath = path.join(WORKSPACE_DIR, 'needs-you.md');

  try {
    let content = await readFile(needsYouPath, 'utf-8');
    const today = new Date().toISOString().split('T')[0];

    // Add log reference if contract ID available
    const logReference = contractId
      ? ` See ledgers/${today}/worker-${contractId}.log for full context.`
      : '';

    const enhancedDiagnosis = `${diagnosis}${logReference}`;
    const newEntry = `| ${item.title} | ${enhancedDiagnosis} | | BLOCKING | ${today} |`;

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
 * Mark task as blocked
 * V1.2: PROMPT.md is source of truth. goals.md update is best-effort.
 * DETERMINISTIC: File I/O
 */
export async function markTaskBlocked(item: WorkItem): Promise<void> {
  logDeterministic('Marking task as blocked...');

  // Report blocked milestone to Notion (fire-and-forget)
  await reportMilestone('Blocked', item);

  // V1.2: Update PROMPT.md (source of truth)
  if (item.source_path) {
    await updatePromptMdStatus(item.source_path, { status: 'blocked' });
  }

  // Legacy: Best-effort update of goals.md index
  try {
    const goalsPath = path.join(WORKSPACE_DIR, 'goals.md');
    if (existsSync(goalsPath)) {
      const content = await readFile(goalsPath, 'utf-8');
      const titlePattern = new RegExp(
        `(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`,
        'i'
      );
      if (titlePattern.test(content)) {
        const updatedContent = content.replace(titlePattern, `$1 Blocked`);
        await writeFile(goalsPath, updatedContent, 'utf-8');
        log(`  Updated goals.md index: ${item.title} → Blocked`);
      }
    }
  } catch (goalsErr) {
    log(`  Warning: Failed to update goals.md index: ${goalsErr}`);
  }

  // Regenerate goals.md index from folder tree
  await generateGoalsIndex();
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

/**
 * Extract features built from worker output
 * DETERMINISTIC: Simple heuristic keyword matching on output text
 */
function extractFeaturesFromOutput(output?: string): string[] {
  if (!output) return [];
  const features: string[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('created') ||
      lower.includes('implemented') ||
      lower.includes('built') ||
      lower.includes('added feature')
    ) {
      const clean = line.trim().slice(0, 100);
      if (clean.length > 10) features.push(clean);
    }
    if (features.length >= 5) break;
  }
  return features;
}

/**
 * Extract lessons from worker output
 * DETERMINISTIC: Simple heuristic keyword matching on output text
 */
function extractLessonsFromOutput(output?: string): string[] {
  if (!output) return [];
  const lessons: string[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('warning:') ||
      lower.includes('note:') ||
      lower.includes('lesson') ||
      lower.includes('workaround')
    ) {
      const clean = line.trim().slice(0, 100);
      if (clean.length > 10) lessons.push(clean);
    }
    if (lessons.length >= 5) break;
  }
  return lessons;
}

/**
 * Detect project category from work item
 * V1.2: Used for project memory categorization
 */
function detectProjectCategory(item: WorkItem): string {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  if (text.includes('next.js') || text.includes('nextjs')) return 'nextjs';
  if (text.includes('react')) return 'react';
  if (text.includes('node')) return 'node';
  if (text.includes('python')) return 'python';
  if (text.includes('notion')) return 'misc';
  return 'misc';
}

/**
 * Infer capabilities from work item
 * V1.2: Used for project memory
 */
function inferProjectCapabilities(item: WorkItem): string[] {
  const capabilities: string[] = [];
  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  if (text.includes('next.js') || text.includes('nextjs')) capabilities.push('deliver.nextjs.app.basic');
  if (text.includes('notion')) capabilities.push('deliver.notion.integration');
  if (text.includes('react')) capabilities.push('deliver.react.component');
  if (text.includes('git')) capabilities.push('git.commit');
  if (text.includes('npm') || text.includes('package')) capabilities.push('npm.install');

  return capabilities.length > 0 ? capabilities : ['general.implementation'];
}
