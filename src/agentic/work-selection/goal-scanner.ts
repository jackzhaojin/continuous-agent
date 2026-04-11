/**
 * Goal Scanner - AGENTIC
 * Scans workspace folder tree for goal bundles, reads PROMPT.md, builds work list
 */

import { readdir, rename, mkdir, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { parsePromptMd, type PromptMdFile } from '../../deterministic/prompt-md-parser.js';
import type { WorkItem, WorkStep, ExecutionPattern } from '../../core/types.js';
import type { SelectableWork } from './work-selector.js';
import { readStepsJson, stepsJsonToWorkSteps, migrateFromPromptMd } from '../../deterministic/steps-json-handler.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');

const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const;
type Priority = typeof VALID_PRIORITIES[number];

function isValidPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (VALID_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Auto-promote ondeck goals that have a valid priority in their PROMPT.md frontmatter.
 * Moves the directory from workspace/ondeck/{slug}/ to workspace/in-progress/P{n}/{slug}/
 * Returns array of promoted slugs for logging.
 */
export async function autoPromoteOndeckGoals(): Promise<string[]> {
  const ondeckDir = path.join(WORKSPACE_DIR, 'ondeck');
  if (!existsSync(ondeckDir)) return [];

  const goalDirs = await listGoalDirs(ondeckDir);
  const promoted: string[] = [];

  for (const goalDir of goalDirs) {
    const promptPath = path.join(goalDir, 'PROMPT.md');
    if (!existsSync(promptPath)) continue;

    try {
      const promptMd = await parsePromptMd(promptPath);
      const priority = promptMd.frontmatter.priority;

      if (!isValidPriority(priority)) continue;

      const slug = path.basename(goalDir);
      const targetParent = path.join(WORKSPACE_DIR, 'in-progress', priority);

      // Ensure target priority directory exists
      if (!existsSync(targetParent)) {
        await mkdir(targetParent, { recursive: true });
      }

      const targetPath = path.join(targetParent, slug);

      // Don't overwrite if a directory with the same slug already exists in target
      if (existsSync(targetPath)) {
        console.log(`[GoalScanner] Skipping promotion of "${slug}" — already exists in in-progress/${priority}`);
        continue;
      }

      await rename(goalDir, targetPath);
      console.log(`[GoalScanner] Auto-promoted "${slug}" from ondeck to in-progress/${priority}`);

      // Log GOAL_PROMOTED event to work ledger
      try {
        const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');
        const entry = JSON.stringify({
          event: 'GOAL_PROMOTED',
          ts: new Date().toISOString(),
          goal_slug: slug,
          from_state: 'ondeck',
          to_state: 'in-progress',
          target_priority: priority,
        });
        await appendFile(ledgerPath, entry + '\n', 'utf-8');
      } catch (ledgerError) {
        console.log(`[GoalScanner] Failed to log GOAL_PROMOTED for "${slug}": ${ledgerError}`);
      }

      promoted.push(slug);
    } catch (error) {
      console.log(`[GoalScanner] Failed to promote ${goalDir}: ${error}`);
    }
  }

  return promoted;
}

// Note: Completed goals are moved from in-progress/P{n}/ to completed/ by
// moveBundleToCompleted() in state-handler.ts when a task succeeds.
// Blocked goals stay in-place in in-progress/P{n}/ with status: blocked in frontmatter.

interface GoalBundle {
  slug: string;
  promptMd: PromptMdFile;
  sourcePath: string;  // Full path to the goal directory
  state: 'in-progress' | 'blocked' | 'archive' | 'completed';
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
}

/**
 * Scan all goal bundles from the workspace folder tree
 * Priority order: P0 > P1 > P2 > P3 > P4
 */
export async function scanGoalBundles(): Promise<GoalBundle[]> {
  const bundles: GoalBundle[] = [];

  // Scan in-progress goals by priority
  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4'] as const) {
    const priorityDir = path.join(WORKSPACE_DIR, 'in-progress', priority);
    if (existsSync(priorityDir)) {
      const goalDirs = await listGoalDirs(priorityDir);
      for (const goalDir of goalDirs) {
        const bundle = await readGoalBundle(goalDir, 'in-progress', priority);
        if (bundle) bundles.push(bundle);
      }
    }
  }

  // NOTE: workspace/drafts/ is intentionally NOT scanned.
  // Drafts are human-owned staging areas — the agent must never touch them.
  // Goals must be moved to ondeck/ (auto-promoted) or in-progress/ to be executed.

  // Scan completed (for reference only)
  const completedDir = path.join(WORKSPACE_DIR, 'completed');
  if (existsSync(completedDir)) {
    const goalDirs = await listGoalDirs(completedDir);
    for (const goalDir of goalDirs) {
      const bundle = await readGoalBundle(goalDir, 'completed');
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
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
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
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
): Promise<GoalBundle | null> {
  const promptPath = path.join(goalDir, 'PROMPT.md');

  if (!existsSync(promptPath)) {
    return null;
  }

  try {
    const promptMd = await parsePromptMd(promptPath);
    const slug = path.basename(goalDir);

    // Fall back to frontmatter priority if no directory-based priority was provided
    const resolvedPriority = priority ??
      (isValidPriority(promptMd.frontmatter.priority) ? promptMd.frontmatter.priority : undefined);

    return {
      slug,
      promptMd,
      sourcePath: goalDir,
      state,
      priority: resolvedPriority,
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
 * Convert a GoalBundle to a WorkItem.
 * Reads steps from STEPS.json (primary) with fallback to PROMPT.md body (legacy).
 */
async function bundleToWorkItemAsync(bundle: GoalBundle): Promise<WorkItem> {
  const { frontmatter, body } = bundle.promptMd;

  const selfEnhance = /^\[SELF-ENHANCE\]/i.test(frontmatter.title);
  const skillBuild = /^\[SKILL-BUILD\]/i.test(frontmatter.title);

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

  // Primary: read steps from STEPS.json
  let steps: WorkStep[] = [];
  const tasksFile = await readStepsJson(bundle.sourcePath);
  if (tasksFile && tasksFile.steps.length > 0) {
    steps = stepsJsonToWorkSteps(tasksFile.steps);
  } else {
    // Legacy fallback: parse steps from PROMPT.md body + one-time migration
    const migrated = await migrateFromPromptMd(bundle.sourcePath, body, parseStepsFromBody);
    if (migrated) {
      steps = migrated;
    } else {
      steps = parseStepsFromBody(body);
    }
  }

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
    priority: bundle.priority || 'P4',
    title: frontmatter.title,
    description: body.slice(0, 5000), // Use body as description (needs room for ## Approach parsing)
    status,
    output_path: (frontmatter.output_path as string) || undefined,
    selfEnhance,
    skillBuild,
    branch: (frontmatter.branch as string) || undefined,
    steps: steps.length > 0 ? steps : undefined,
    current_step,
    progress_pct,
    source_path: bundle.sourcePath, // V1.2 field
    source_project: source_project || undefined, // V1.2: Multi-project access
    max_turns: frontmatter.max_turns ? Number(frontmatter.max_turns) : undefined,
    execution_pattern: (frontmatter.execution_pattern as ExecutionPattern) || undefined, // V2.0: Override from PROMPT.md
    worker_vendor: (['claude', 'codex', 'kimi', 'kimi-cli', 'kimi-wire'].includes(frontmatter.worker_vendor as string)
      ? frontmatter.worker_vendor as 'claude' | 'codex' | 'kimi' | 'kimi-cli' | 'kimi-wire'
      : undefined), // V2.1: Per-goal vendor override
    // V2.2: harness fields
    harness: (frontmatter.harness as string) || undefined,
    harness_target: (frontmatter.harness_target as string) || undefined,
    harness_mode: (['bootstrap', 'adopt', 'extend', 'extend-deep', 'resume'].includes(
      frontmatter.harness_mode as string,
    )
      ? (frontmatter.harness_mode as 'bootstrap' | 'adopt' | 'extend' | 'extend-deep' | 'resume')
      : undefined),
    model_overrides:
      frontmatter.model_overrides && typeof frontmatter.model_overrides === 'object'
        ? (frontmatter.model_overrides as Record<string, string>)
        : undefined,
  };
}

/**
 * Build selectable work list from scanned bundles
 * Returns work sorted by priority (P0 > P1 > P2 > P3 > P4)
 */
export async function buildSelectableWorkFromBundles(): Promise<SelectableWork[]> {
  // Auto-promote ondeck goals with priority before scanning
  await autoPromoteOndeckGoals();

  const bundles = await scanGoalBundles();
  const selectableWork: SelectableWork[] = [];

  for (const bundle of bundles) {
    // Only in-progress goals can be executed
    if (bundle.state !== 'in-progress') continue;
    if (!bundle.priority) continue;

    let workItem: WorkItem;
    try {
      workItem = await bundleToWorkItemAsync(bundle);
    } catch (error) {
      console.log(`[GoalScanner] Failed to convert bundle "${bundle.slug}" to work item: ${error}`);
      continue;
    }

    // Skip completed or blocked
    if (workItem.status === 'complete' || workItem.status === 'blocked') continue;

    if (workItem.steps && workItem.steps.length > 0) {
      // Multi-step: find first available step whose dependencies are all complete
      for (const step of workItem.steps) {
        if (step.status === 'complete' || step.status === 'blocked') continue;

        // Check if all dependencies are complete before selecting this step
        if (step.dependencies && step.dependencies.length > 0) {
          const allDepsComplete = step.dependencies.every(depNum =>
            workItem.steps![depNum]?.status === 'complete'
          );
          if (!allDepsComplete) continue;
        }

        selectableWork.push({
          type: 'step',
          goal: workItem,
          step,
          priority: workItem.priority,
        });
        break; // Only first available step
      }
    } else {
      selectableWork.push({
        type: 'goal',
        goal: workItem,
        priority: workItem.priority,
      });
    }
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  selectableWork.sort((a, b) => (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5));

  return selectableWork;
}

// getDraftResearchTasks() removed — drafts are human-owned and must never be touched by the agent.
// Goals must be explicitly moved to ondeck/ or in-progress/ before execution.
