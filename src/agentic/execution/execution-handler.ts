/**
 * Work execution logic - MOSTLY AGENTIC
 * Handles spawning workers, retry logic, strategy selection
 */

import { appendFile } from 'fs/promises';
import path from 'path';
import { spawnWorker, type WorkerRetryContext } from './worker-spawner.js';
import { selectStrategy } from '../intelligence/strategy-selector.js';
import { classifyIntent } from '../intelligence/intent-classifier.js';
import type { WorkItem, WorkerResult, WorkStep } from '../../core/types.js';
import { logAgentic, log } from '../../core/logging.js';
import { reportMilestone } from '../../deterministic/notion-reporter.js';
import { readPreviousStepHandoff } from '../../deterministic/state-handler.js';
import { incrementOutcomeCount } from '../../deterministic/self-improvement-state.js';
import { updateStepStatus as updateStepInTasksJson, stepId } from '../../deterministic/tasks-json-handler.js';
import { logStepStartedProgress } from '../../deterministic/progress-log-writer.js';

const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');

// Retry state tracker - persists output_path across retries
interface RetryState {
  attempts: number;
  lastError: string;
  strategies: string[];
  lastAttemptAt: string;
  currentStrategyId: string | null;
  output_path?: string;
  suggestedFix?: string; // From diagnostic agent
}

const retryTracker: Map<string, RetryState> = new Map();

/**
 * Get retry tracker (exported for state updates)
 */
export function getRetryTracker(): Map<string, RetryState> {
  return retryTracker;
}

/**
 * Get current strategy for a work item
 * AGENTIC: Selects strategy based on what's been tried
 */
function getCurrentStrategy(item: WorkItem): { strategyId: string | null; strategies: string[] } {
  const retry = retryTracker.get(item.title);
  return {
    strategyId: retry?.currentStrategyId || null,
    strategies: retry?.strategies || [],
  };
}

/**
 * Build retry context for worker
 * AGENTIC: Includes strategy selection and diagnostic fixes
 *
 * IMPORTANT: Prefers item.output_path (from PROMPT.md) over in-memory retry tracker.
 * This allows resuming work on the same project after PM2 restarts.
 */
function buildRetryContext(item: WorkItem): WorkerRetryContext | undefined {
  const retry = retryTracker.get(item.title);

  // If task has an output_path from PROMPT.md, ALWAYS use it (enables resume)
  // This is the key fix for persistent project directories across PM2 restarts
  const existingPath = item.output_path || retry?.output_path;

  // If no retry state but we have an existing path, create minimal context
  // This handles the "resume after restart" case
  if ((!retry || retry.attempts === 0) && existingPath) {
    logAgentic(`  Resuming work on existing project: ${existingPath}`);
    return {
      attempts: 0,
      maxRetries: 10,
      triedStrategies: [],
      existingProjectPath: existingPath,
    };
  }

  if (!retry || retry.attempts === 0) return undefined;

  return {
    attempts: retry.attempts,
    maxRetries: 10,
    triedStrategies: retry.strategies,
    lastError: retry.lastError,
    existingProjectPath: existingPath,
  };
}

/**
 * Build a step-scoped description that replaces the full task description
 * when executing an individual step. This prevents the worker from seeing
 * the entire task spec and building everything in one step.
 * Includes previous step's handoff for continuity.
 */
async function buildStepScopedDescription(item: WorkItem, step: WorkStep, previousHandoff?: string | null): Promise<string> {
  const totalSteps = item.steps?.length || 1;
  const stepNum = step.step_number + 1;

  const completedSteps = item.steps
    ?.filter(s => s.status === 'complete')
    .map(s => `- Step ${s.step_number + 1}: ${s.title} (complete)`)
    .join('\n') || '(none — this is the first step)';

  const remainingSteps = item.steps
    ?.filter(s => s.status !== 'complete' && s.step_number !== step.step_number)
    .map(s => `- Step ${s.step_number + 1}: ${s.title}`)
    .join('\n') || '(none)';

  const isResearchStep = step.title.toLowerCase().includes('research') ||
    step.title.toLowerCase().includes('plan') ||
    step.description?.toLowerCase().includes('research');

  const researchWarning = isResearchStep
    ? `\n### RESEARCH ONLY — DO NOT BUILD\nThis is a research/planning step. Your deliverables are:\n- A RESEARCH.md or planning document with findings\n- Analysis of patterns, best practices, and approach\n- DO NOT write application code, initialize projects, or install dependencies\n- DO NOT implement any features — that happens in later steps\n`
    : '';

  return `## Step ${stepNum} of ${totalSteps}: ${step.title}

**Parent Task:** ${item.title}
**Priority:** ${item.priority}
${researchWarning}
### What to Do in This Step

${step.description || step.title}

### SCOPE BOUNDARIES (CRITICAL)

- Complete ONLY the work described for this step
- Do NOT build the entire application — this is 1 of ${totalSteps} steps
- Do NOT implement features belonging to other steps
- Your deliverable is ONLY: "${step.title}"
- Stay focused and finish this step within the turn budget

### Previous Steps Completed
${completedSteps}

### Remaining Steps (do NOT do these — they are handled separately)
${remainingSteps}${previousHandoff ? `

### Previous Step Handoff
The previous step left this handoff for you:

---
${previousHandoff.slice(0, 3000)}
---` : ''}`;
}

/**
 * Execute work item (task or step) using Agent SDK worker
 * AGENTIC: Spawns AI agent to do the work
 */
export async function executeWork(
  item: WorkItem,
  step?: WorkStep,
  currentTask?: string
): Promise<WorkerResult | null> {
  logAgentic(`Executing: ${item.title}${step ? ` - Step ${step.step_number + 1}` : ''}`);

  try {
    // When executing a step, create a scoped copy of the WorkItem
    // so the worker only sees step-relevant context, NOT the full task spec
    let scopedItem: WorkItem = item;
    if (step) {
      // Read previous step's handoff for continuity
      const previousHandoff = item.source_path
        ? await readPreviousStepHandoff(item.source_path, step.step_number)
        : null;
      if (previousHandoff) {
        log(`  Including handoff from step ${step.step_number} for context`);
      }

      const stepDescription = await buildStepScopedDescription(item, step, previousHandoff);
      scopedItem = {
        ...item,
        title: `${item.title} — Step ${step.step_number + 1}/${item.steps?.length || '?'}: ${step.title}`,
        description: stepDescription,
      };
    }

    // AGENTIC: Classify intent and select strategy
    const intent = await classifyIntent(scopedItem);
    log(`  Intent: ${intent.type} (confidence: ${intent.confidence})`);

    const retryContext = buildRetryContext(item);
    if (retryContext) {
      logAgentic(`  Retry attempt ${retryContext.attempts}/${retryContext.maxRetries}`);
      if (retryContext.triedStrategies.length > 0) {
        log(`  Previous strategies: ${retryContext.triedStrategies.join(', ')}`);
      }
    }

    // AGENTIC: Select strategy for this attempt
    const { strategyId } = getCurrentStrategy(item);
    if (!strategyId && retryContext) {
      const strategySelection = selectStrategy(item, retryContext.triedStrategies);
      if (strategySelection) {
        logAgentic(`  Selected strategy: ${strategySelection.strategy.name}`);
        const retry = retryTracker.get(item.title);
        if (retry) {
          retry.currentStrategyId = strategySelection.strategy.id;
          retryTracker.set(item.title, retry);
        }
      }
    }

    // AGENTIC: Spawn Agent SDK worker
    log(`  Spawning Agent SDK worker...`);
    const result = await spawnWorker(
      {
        id: currentTask || `task-${Date.now()}`,
        goal: scopedItem.description || item.description,
        scope: {
          repos_allowed: ['agent-outputs'],
          tools_allowed: [
            'Skill',
            'Read',
            'Write',
            'Edit',
            'Bash',
            'Glob',
            'Grep',
            'WebFetch',
            'WebSearch',
          ],
        },
        definition_of_done: step
          ? [
              `Complete step: ${step.title}`,
              `Do NOT build the entire application — only this step`,
              'All code compiles and runs (if applicable to this step)',
              'Changes are committed to git',
            ]
          : [
              'Complete task as described',
              'All code compiles and runs',
              'Changes are committed to git',
            ],
        max_turns: 100,
        risk_assessment: 'low',
        required_skills: [],
        logging_obligations: ['All work logged to output directory'],
        created_at: new Date().toISOString(),
      },
      scopedItem,
      retryContext
    );

    if (result.success) {
      logAgentic(`  ✓ Worker completed successfully`);
      log(`  Duration: ${Math.round(result.duration_ms / 1000)}s`);
      log(`  Output: ${result.output_path || 'none'}`);
    } else {
      logAgentic(`  ✗ Worker failed`);
      log(`  Errors: ${result.errors.join(', ')}`);
    }

    return result;
  } catch (error) {
    logAgentic(`  ✗ Worker execution failed: ${error}`);
    return {
      success: false,
      output: '',
      artifacts: [],
      errors: [error instanceof Error ? error.message : String(error)],
      duration_ms: 0,
    };
  }
}

/**
 * Infer capabilities being exercised from task
 * AGENTIC: Uses heuristics to map task → capabilities
 */
export function inferCapabilitiesFromTask(item: WorkItem, intent: { type: string }): string[] {
  const capabilities: string[] = [];

  // Map task patterns to capabilities
  const goalLower = (item.title + ' ' + item.description).toLowerCase();

  // Delivery capabilities
  if (goalLower.includes('next.js') || goalLower.includes('nextjs')) {
    capabilities.push('deliver.nextjs.app.basic');
  }
  if (goalLower.includes('notion')) {
    capabilities.push('deliver.notion.integration');
  }
  if (goalLower.includes('react')) {
    capabilities.push('deliver.react.component');
  }
  if (item.skillBuild || goalLower.includes('skill')) {
    capabilities.push('deliver.claude.skill');
  }

  // Technical capabilities
  if (goalLower.includes('git')) {
    capabilities.push('git.commit', 'git.status');
  }
  if (goalLower.includes('npm') || goalLower.includes('package')) {
    capabilities.push('npm.install', 'npm.test');
  }

  // Functional capabilities based on intent
  if (intent.type === 'outcome_only') {
    capabilities.push('reason.planning', 'reason.research');
  }

  return capabilities.length > 0 ? capabilities : ['general.implementation'];
}

/**
 * Log capability attempt (before execution)
 */
export async function logCapabilityAttempt(item: WorkItem, capabilities: string[]): Promise<void> {
  const ledgerPath = path.join(LEDGERS_DIR, 'capability-ledger.jsonl');
  const entry = JSON.stringify({
    event: 'CAPABILITY_ATTEMPT',
    ts: new Date().toISOString(),
    task_id: item.id,
    task_title: item.title,
    capabilities,
  });
  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}

/**
 * Log capability result (after validation)
 */
export async function logCapabilityResult(
  item: WorkItem,
  capabilities: string[],
  success: boolean,
  contractId: string
): Promise<void> {
  const ledgerPath = path.join(LEDGERS_DIR, 'capability-ledger.jsonl');
  const entry = JSON.stringify({
    event: 'CAPABILITY_RESULT',
    ts: new Date().toISOString(),
    task_id: item.id,
    contract_id: contractId,
    task_title: item.title,
    capabilities,
    result: success ? 'PASS' : 'FAIL',
  });
  await appendFile(ledgerPath, entry + '\n', 'utf-8');

  // Track outcome count for retrospective triggering (after 10+ outcomes)
  try {
    await incrementOutcomeCount();
  } catch {
    // Non-blocking: don't fail capability logging if state file has issues
  }
}

/**
 * Log work start event.
 * Also updates TASKS.json step status to in_progress and appends to PROGRESS_LOG.md.
 */
export async function logWorkStart(
  item: WorkItem,
  step: WorkStep | undefined,
  contractId: string
): Promise<void> {
  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');
  const now = new Date().toISOString();
  const entry = step
    ? JSON.stringify({
        event: 'STEP_STARTED',
        ts: now,
        task_id: item.id,
        contract_id: contractId,
        task_title: item.title,
        step_number: step.step_number + 1,
        step_title: step.title,
      })
    : JSON.stringify({
        event: 'TASK_STARTED',
        ts: now,
        task_id: item.id,
        contract_id: contractId,
        title: item.title,
      });
  await appendFile(ledgerPath, entry + '\n', 'utf-8');

  // Update TASKS.json + PROGRESS_LOG.md for step starts
  if (step && item.source_path) {
    await updateStepInTasksJson(item.source_path, stepId(step.step_number), 'in_progress', {
      started_at: now,
    });

    await logStepStartedProgress(
      item.source_path,
      stepId(step.step_number),
      step.step_number + 1,
      item.steps?.length || 1,
      step.title,
      contractId,
    );
  }

  // Report started milestone to Notion (fire-and-forget)
  await reportMilestone(
    'Started',
    item,
    contractId,
    step ? { stepTitle: step.title, stepNumber: step.step_number + 1 } : undefined
  );
}
