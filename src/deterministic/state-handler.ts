/**
 * State management - MOSTLY DETERMINISTIC
 * Updates workspace files (PROMPT.md bundles, needs-you.md, ledgers)
 */

import { readFile, writeFile, appendFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import type { WorkItem, WorkStep } from '../core/types.js';
import { logDeterministic, log, logAgentic } from '../core/logging.js';
import {
  markPracticeCompleted,
  markRetrospectiveCompleted,
  markReferenceRefreshCompleted,
} from './self-improvement-state.js';
import { reportMilestone } from './notion-reporter.js';
import { parsePromptMd, updateFrontmatter } from './prompt-md-parser.js';
import { appendProjectMemory, type ProjectMemoryEntry } from './project-memory-store.js';
import { registerProject, generateProjectSlug, findProjectBySlug, type ProjectRegistryEntry } from './project-registry.js';
import { readTasksJson, writeTasksJson, updateStepStatus as updateStepInTasksJson, stepId } from './tasks-json-handler.js';
import { logStepCompletedProgress, logStepBlockedProgress } from './progress-log-writer.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');
const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');

/**
 * Update PROMPT.md frontmatter for a goal bundle
 * V1.2: Updates the PROMPT.md file directly
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
 * Move a goal bundle directory to workspace/completed/
 * DETERMINISTIC: File I/O
 */
async function moveBundleToCompleted(sourcePath: string): Promise<boolean> {
  const slug = path.basename(sourcePath);
  const completedDir = path.join(WORKSPACE_DIR, 'completed');
  const destPath = path.join(completedDir, slug);

  // Don't move if already in completed/
  if (sourcePath.includes('/completed/')) {
    log(`  Bundle already in completed/ — skipping move`);
    return true;
  }

  try {
    await mkdir(completedDir, { recursive: true });
    await rename(sourcePath, destPath);
    log(`  Moved bundle to completed/: ${sourcePath} → ${destPath}`);
    return true;
  } catch (error) {
    log(`  Failed to move bundle to completed/: ${error}`);
    return false;
  }
}

/**
 * Update task state after execution
 * V1.2: PROMPT.md is the source of truth.
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

  // --- V1.2 primary operations ---

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
        archive_path: item.source_path ? item.source_path.replace(/in-progress\/P\d\//, 'completed/') : undefined,
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

    // Move completed bundles to workspace/completed/
    if (success) {
      await moveBundleToCompleted(item.source_path);
    }
  }

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
 * V1.2: Updates PROMPT.md frontmatter + TASKS.json (if exists)
 * DETERMINISTIC: File I/O and pattern matching
 */
export async function setTaskOutputPath(
  taskTitle: string,
  outputPath: string,
  sourcePath?: string
): Promise<boolean> {
  log(`  Persisting output path: ${outputPath}`);

  if (sourcePath) {
    // V1.2: Update PROMPT.md frontmatter (source of truth)
    const updated = await updatePromptMdStatus(sourcePath, { output_path: outputPath });
    if (updated) {
      logDeterministic(`  Updated PROMPT.md output_path for "${taskTitle}"`);
    }
  } else {
    log(`  Warning: No source_path for "${taskTitle}" — output_path not persisted to PROMPT.md`);
    return false;
  }

  return true;
}

/**
 * Update step state in PROMPT.md and ledgers
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
      // Update the step in the local copy for progress calculation
      const stepToUpdate = item.steps?.[step.step_number];
      if (stepToUpdate) {
        stepToUpdate.status = 'complete';
        stepToUpdate.completed_at = now;
      }

      if (item.source_path) {
        // Primary: update TASKS.json (source of truth for step status)
        await updateStepInTasksJson(item.source_path, stepId(step.step_number), 'complete', {
          completed_at: now,
          completed_by_contract: contractId,
        });

        // Append to PROGRESS_LOG.md
        await logStepCompletedProgress(
          item.source_path,
          stepId(step.step_number),
          step.step_number + 1,
          item.steps?.length || 1,
          step.title,
          contractId,
          outputPath,
        );
      }

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

      // Write step handoff file for human visibility and next-step context
      if (item.source_path) {
        await writeStepHandoff(item, step, outputPath, contractId);
      }

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

      // Report step failure milestone to Notion (fire-and-forget)
      await reportMilestone('Failed', item, contractId, {
        stepTitle: step.title,
        stepNumber: step.step_number + 1,
        errorSummary: errorInfo?.slice(0, 200) || 'Unknown error',
      });
    }
  } catch (error) {
    log(`  Failed to update step state: ${error}`);
  }
}

/**
 * Write a step handoff file to the goal bundle directory.
 * This serves two purposes:
 * 1. Human visibility — see what each step accomplished
 * 2. AI continuity — next step reads previous handoff to resume intelligently
 *
 * File: {goal-bundle}/step-{N}-handoff.md
 */
export async function writeStepHandoff(
  item: WorkItem,
  step: WorkStep,
  outputPath?: string,
  contractId?: string
): Promise<void> {
  if (!item.source_path) return;

  const stepNum = step.step_number + 1;
  const handoffPath = path.join(item.source_path, `step-${stepNum}-handoff.md`);
  const now = new Date().toISOString();

  // Find worker log for this step
  const today = now.split('T')[0];
  const workerLogPath = contractId
    ? path.join(process.cwd(), 'ledgers', today, `worker-${contractId}.log`)
    : null;

  // Extract final output summary from worker log (last assistant text)
  let workerSummary = '(no summary available)';
  if (workerLogPath && existsSync(workerLogPath)) {
    try {
      const logContent = await readFile(workerLogPath, 'utf-8');
      // Look for PROJECT_SUMMARY or final text output
      const summaryMatch = logContent.match(/PROJECT_SUMMARY[\s\S]*?(?=\[MSG\]|\[TURN\]|=== WORKER|$)/i);
      if (summaryMatch) {
        workerSummary = summaryMatch[0].slice(0, 2000);
      } else {
        // Grab last few substantial text outputs
        const textBlocks = logContent.match(/\[TURN \d+\][\s\S]*?(?=\[TURN|\[MSG\]|=== WORKER|$)/g);
        if (textBlocks && textBlocks.length > 0) {
          workerSummary = textBlocks[textBlocks.length - 1].slice(0, 2000);
        }
      }
    } catch { /* ignore */ }
  }

  const content = `# Step ${stepNum} Handoff: ${step.title}

**Task:** ${item.title}
**Completed:** ${now}
**Contract:** ${contractId || 'unknown'}
**Output Path:** ${outputPath || 'none'}

## What Was Done

${workerSummary}

## Files Context

Output directory: \`${outputPath || 'none'}\`
Worker log: \`ledgers/${today}/worker-${contractId}.log\`
`;

  try {
    await writeFile(handoffPath, content, 'utf-8');
    log(`  Wrote step ${stepNum} handoff to ${handoffPath}`);
  } catch (error) {
    log(`  Failed to write step handoff: ${error}`);
  }
}

/**
 * Read the previous step's handoff for inclusion in the next step's prompt.
 * Returns the handoff content or null if not available.
 */
export async function readPreviousStepHandoff(
  sourcePath: string,
  currentStepNumber: number
): Promise<string | null> {
  if (currentStepNumber <= 0) return null;

  const handoffPath = path.join(sourcePath, `step-${currentStepNumber}-handoff.md`);
  if (!existsSync(handoffPath)) return null;

  try {
    return await readFile(handoffPath, 'utf-8');
  } catch {
    return null;
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
    } else {
      log(`  Warning: needs-you.md actions table format not matched — entry not written. Check table header/separator.`);
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
    } else {
      log(`  Warning: needs-you.md actions table format not matched — diagnostic not written. Check table header/separator.`);
    }
  } catch (error) {
    log(`  Failed to escalate to needs-you.md: ${error}`);
  }
}

/**
 * Mark task as blocked
 * V1.2: PROMPT.md is the source of truth.
 * DETERMINISTIC: File I/O
 */
export async function markTaskBlocked(item: WorkItem): Promise<void> {
  logDeterministic('Marking task as blocked...');

  // Report blocked milestone to Notion (fire-and-forget)
  await reportMilestone('Blocked', item);

  // V1.2: Update PROMPT.md (source of truth) — blocked goals stay in-place in in-progress/P{n}/
  if (item.source_path) {
    await updatePromptMdStatus(item.source_path, { status: 'blocked' });
  }
}

/**
 * Mark step as blocked in TASKS.json (primary) + PROMPT.md (legacy) + PROGRESS_LOG.md
 * DETERMINISTIC: File I/O
 */
export async function markStepBlocked(item: WorkItem, stepNumber: number): Promise<void> {
  logDeterministic(`Marking step ${stepNumber + 1} as blocked...`);

  if (item.source_path) {
    try {
      // Primary: update TASKS.json (source of truth for step status)
      await updateStepInTasksJson(item.source_path, stepId(stepNumber), 'blocked');

      // Append to PROGRESS_LOG.md
      const stepTitle = item.steps?.[stepNumber]?.title || `Step ${stepNumber + 1}`;
      await logStepBlockedProgress(
        item.source_path,
        stepId(stepNumber),
        stepNumber + 1,
        item.steps?.length || 1,
        stepTitle,
      );

      log(`  Step ${stepNumber + 1} marked as blocked`);
      // Note: markTaskBlocked() is always called after this by the executive loop,
      // which handles frontmatter update and directory move
    } catch (error) {
      log(`  Failed to mark step as blocked: ${error}`);
    }
  } else {
    log(`  No source_path on work item — cannot mark step as blocked`);
  }
}

/**
 * Extract features built from worker output
 * DETERMINISTIC: Simple heuristic keyword matching on output text
 */
/**
 * Patterns that indicate meta-text from worker output rather than actual feature descriptions.
 * These are conversational AI responses, not meaningful feature entries.
 */
const META_TEXT_PREFIXES = [
  'perfect', 'let me', "i've successfully", "here's", 'great', 'now let',
  'i will', 'i can', 'sure', 'okay', 'done', 'alright', 'excellent',
  'looks like', 'the project', 'this is', 'we have', 'i just',
];

function isMetaText(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return META_TEXT_PREFIXES.some(prefix => lower.startsWith(prefix));
}

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
      const clean = line.trim().slice(0, 200);
      if (clean.length < 20 || clean.length > 150) continue; // Skip too short or too long
      if (isMetaText(clean)) continue; // Skip conversational meta-text
      features.push(clean.slice(0, 100));
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

/**
 * Commit worker output to the agent-outputs monorepo.
 * Workers commit inside their own per-project .git repos, but those changes
 * are not reflected in the parent monorepo. This function stages and commits
 * any dirty files in agent-outputs after task/step execution.
 *
 * DETERMINISTIC: Shell commands, no LLM.
 */
export function commitOutputsMonorepo(taskTitle: string, outputPath?: string): void {
  const agentOutputsRoot = process.env.AGENT_OUTPUTS_PATH
    || path.join(os.homedir(), 'dev', 'agent-outputs');

  if (!existsSync(path.join(agentOutputsRoot, '.git'))) {
    log(`  Warning: agent-outputs is not a git repo at ${agentOutputsRoot} — skipping monorepo commit`);
    return;
  }

  try {
    const status = execSync('git status --porcelain', {
      cwd: agentOutputsRoot,
      encoding: 'utf-8',
    }).trim();

    if (!status) {
      logDeterministic('  agent-outputs monorepo already clean — no commit needed');
      return;
    }

    const fileCount = status.split('\n').length;
    logDeterministic(`  Committing ${fileCount} file(s) to agent-outputs monorepo...`);

    execSync('git add -A', { cwd: agentOutputsRoot, stdio: 'pipe' });

    // Truncate title for commit message
    const shortTitle = taskTitle.length > 80 ? taskTitle.slice(0, 77) + '...' : taskTitle;
    const message = `Auto-commit: ${shortTitle}`;
    execSync(`git commit -m ${JSON.stringify(message)}`, {
      cwd: agentOutputsRoot,
      stdio: 'pipe',
    });

    logDeterministic(`  Committed to agent-outputs monorepo: ${message}`);
  } catch (error) {
    log(`  Warning: Failed to commit to agent-outputs monorepo: ${error}`);
  }
}
