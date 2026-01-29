/**
 * Goal Scanner - AGENTIC
 * Scans workspace folder tree for goal bundles, reads PROMPT.md, builds work list
 */

import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { parsePromptMd, type PromptMdFile } from '../../deterministic/prompt-md-parser.js';
import type { WorkItem, WorkStep } from '../../core/types.js';
import type { SelectableWork } from './work-selector.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');

interface GoalBundle {
  slug: string;
  promptMd: PromptMdFile;
  sourcePath: string;  // Full path to the goal directory
  state: 'drafts' | 'ondeck' | 'in-progress' | 'blocked' | 'archive';
  priority?: 'P1' | 'P2' | 'P3';
}

/**
 * Scan all goal bundles from the workspace folder tree
 * Priority order: P1 > P2 > P3
 */
export async function scanGoalBundles(): Promise<GoalBundle[]> {
  const bundles: GoalBundle[] = [];

  // Scan in-progress goals by priority
  for (const priority of ['P1', 'P2', 'P3'] as const) {
    const priorityDir = path.join(WORKSPACE_DIR, 'in-progress', priority);
    if (existsSync(priorityDir)) {
      const goalDirs = await listGoalDirs(priorityDir);
      for (const goalDir of goalDirs) {
        const bundle = await readGoalBundle(goalDir, 'in-progress', priority);
        if (bundle) bundles.push(bundle);
      }
    }
  }

  // Scan drafts (for research tasks)
  const draftsDir = path.join(WORKSPACE_DIR, 'drafts');
  if (existsSync(draftsDir)) {
    const goalDirs = await listGoalDirs(draftsDir);
    for (const goalDir of goalDirs) {
      const bundle = await readGoalBundle(goalDir, 'drafts');
      if (bundle) bundles.push(bundle);
    }
  }

  // Scan blocked (for reference only)
  const blockedDir = path.join(WORKSPACE_DIR, 'blocked');
  if (existsSync(blockedDir)) {
    const goalDirs = await listGoalDirs(blockedDir);
    for (const goalDir of goalDirs) {
      const bundle = await readGoalBundle(goalDir, 'blocked');
      if (bundle) bundles.push(bundle);
    }
  }

  return bundles;
}

/**
 * List subdirectories in a directory (goal directories)
 */
async function listGoalDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}

/**
 * Read a single goal bundle from a directory
 */
async function readGoalBundle(
  goalDir: string,
  state: GoalBundle['state'],
  priority?: 'P1' | 'P2' | 'P3'
): Promise<GoalBundle | null> {
  const promptPath = path.join(goalDir, 'PROMPT.md');

  if (!existsSync(promptPath)) {
    return null;
  }

  try {
    const promptMd = await parsePromptMd(promptPath);
    const slug = path.basename(goalDir);

    return {
      slug,
      promptMd,
      sourcePath: goalDir,
      state,
      priority,
    };
  } catch (error) {
    console.log(`[GoalScanner] Failed to parse ${promptPath}: ${error}`);
    return null;
  }
}

/**
 * Parse steps from PROMPT.md body
 * Steps are formatted as:
 * ## Steps
 * ### Step 1: Title
 * - **Status:** pending
 * - **Description:** ...
 */
function parseStepsFromBody(body: string): WorkStep[] {
  const steps: WorkStep[] = [];
  const lines = body.split('\n');
  let inStepsSection = false;
  let currentStep: Partial<WorkStep> | null = null;
  let stepNumber = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect Steps section
    if (trimmed.match(/^##\s+Steps$/i)) {
      inStepsSection = true;
      continue;
    }

    // Exit Steps section on next ## heading (but not ### or ####)
    if (inStepsSection && trimmed.match(/^##\s+[^#]/)) {
      inStepsSection = false;
      if (currentStep && currentStep.title) {
        steps.push(currentStep as WorkStep);
      }
      continue;
    }

    if (!inStepsSection) continue;

    // Step headers: ### Step N: Title or ### N: Title or #### Step N: Title
    const stepMatch = trimmed.match(/^#{3,4}\s+(?:Step\s+)?(\d+)[:.]\s*(.+)$/i);
    if (stepMatch) {
      if (currentStep && currentStep.title) {
        steps.push(currentStep as WorkStep);
      }
      stepNumber++;
      currentStep = {
        step_number: stepNumber - 1,
        title: stepMatch[2].trim(),
        description: '',
        status: 'pending',
      };
      continue;
    }

    if (currentStep) {
      const statusMatch = trimmed.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        const statusText = statusMatch[1].toLowerCase().trim();
        if (statusText.includes('complete') || statusText.includes('done')) {
          currentStep.status = 'complete';
        } else if (statusText.includes('block')) {
          currentStep.status = 'blocked';
        } else if (statusText.includes('in progress') || statusText.includes('in_progress')) {
          currentStep.status = 'in_progress';
        } else {
          currentStep.status = 'pending';
        }
        continue;
      }

      const descMatch = trimmed.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
      if (descMatch) {
        currentStep.description = descMatch[1].trim();
        continue;
      }
    }
  }

  if (currentStep && currentStep.title) {
    steps.push(currentStep as WorkStep);
  }

  return steps;
}

/**
 * Convert a GoalBundle to a WorkItem
 */
function bundleToWorkItem(bundle: GoalBundle): WorkItem {
  const { frontmatter, body } = bundle.promptMd;

  const selfEnhance = /^\[SELF-ENHANCE\]/i.test(frontmatter.title);

  // Parse status from frontmatter
  let status: WorkItem['status'] = 'pending';
  const statusLower = (frontmatter.status || '').toLowerCase();
  if (statusLower.includes('in progress') || statusLower === 'in_progress') {
    status = 'in_progress';
  } else if (statusLower.includes('block')) {
    status = 'blocked';
  } else if (statusLower.includes('complete') || statusLower.includes('done')) {
    status = 'complete';
  }

  // Parse steps from body
  const steps = parseStepsFromBody(body);

  // Calculate progress
  let current_step: number | undefined;
  let progress_pct: number | undefined;
  if (steps.length > 0) {
    const completedSteps = steps.filter(s => s.status === 'complete').length;
    const firstIncomplete = steps.findIndex(s => s.status !== 'complete' && s.status !== 'blocked');
    current_step = firstIncomplete >= 0 ? firstIncomplete : undefined;
    progress_pct = Math.round((completedSteps / steps.length) * 100);
  }

  // Read source_project from frontmatter (for multi-project access)
  const source_project = frontmatter.source_project as string | undefined;

  return {
    id: `goal-${bundle.slug}`,
    priority: bundle.priority || 'P3',
    title: frontmatter.title,
    description: body.slice(0, 2000), // Use body as description (truncated)
    status,
    output_path: (frontmatter.output_path as string) || undefined,
    selfEnhance,
    branch: (frontmatter.branch as string) || undefined,
    steps: steps.length > 0 ? steps : undefined,
    current_step,
    progress_pct,
    source_path: bundle.sourcePath, // V1.2 field
    source_project: source_project || undefined, // V1.2: Multi-project access
  };
}

/**
 * Build selectable work list from scanned bundles
 * Returns work sorted by priority (P1 > P2 > P3)
 */
export async function buildSelectableWorkFromBundles(): Promise<SelectableWork[]> {
  const bundles = await scanGoalBundles();
  const selectableWork: SelectableWork[] = [];

  for (const bundle of bundles) {
    // Only in-progress goals can be executed
    if (bundle.state !== 'in-progress') continue;
    if (!bundle.priority) continue;

    const workItem = bundleToWorkItem(bundle);

    // Skip completed or blocked
    if (workItem.status === 'complete' || workItem.status === 'blocked') continue;

    if (workItem.steps && workItem.steps.length > 0) {
      // Multi-step: find first available step
      for (const step of workItem.steps) {
        if (step.status === 'complete' || step.status === 'blocked') continue;
        selectableWork.push({
          type: 'step',
          task: workItem,
          step,
          priority: workItem.priority,
        });
        break; // Only first available step
      }
    } else {
      selectableWork.push({
        type: 'task',
        task: workItem,
        priority: workItem.priority,
      });
    }
  }

  // Sort by priority
  const priorityOrder = { P1: 1, P2: 2, P3: 3 };
  selectableWork.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return selectableWork;
}

/**
 * Get research tasks from drafts
 * Returns draft bundles that don't have references/ content yet
 */
export async function getDraftResearchTasks(): Promise<SelectableWork[]> {
  const bundles = await scanGoalBundles();
  const researchTasks: SelectableWork[] = [];

  for (const bundle of bundles) {
    if (bundle.state !== 'drafts') continue;

    // Check if references/ directory exists and has content
    const refsDir = path.join(bundle.sourcePath, 'references');
    let hasReferences = false;
    if (existsSync(refsDir)) {
      try {
        const entries = await readdir(refsDir);
        hasReferences = entries.filter(e => !e.startsWith('.')).length > 0;
      } catch { /* ignore */ }
    }

    if (!hasReferences) {
      const workItem = bundleToWorkItem(bundle);
      workItem.status = 'pending';
      // Mark as research task with capped scope
      workItem.description = `[RESEARCH ONLY] ${workItem.description}`;
      researchTasks.push({
        type: 'task',
        task: workItem,
        priority: 'P3',
      });
    }
  }

  return researchTasks;
}
