/**
 * Continuous Executive Agent - Main Loop
 *
 * ARCHITECTURE:
 * - AGENTIC: AI decision-making (work selection, strategy, diagnosis)
 * - DETERMINISTIC: Mechanical operations (file I/O, health checks, sleep)
 *
 * The loop is a "force march" structure that continuously seeks work.
 * Everything inside the loop should be as agentic as possible.
 */

import { config } from 'dotenv';
import path from 'path';

// CORE
import { logAgentic, logDeterministic, log, logHealthStatus, closeLogStream } from './logging.js';
import type { HealthStatus, LoopState } from './types.js';

// AGENTIC - AI decision-making
import { selectWorkWithSteps } from '../agentic/work-selection/work-selector.js';
import {
  needsBreakdown,
  estimateComplexity,
  generateStaticBreakdown,
  logBreakdownEvent,
  writeStepsToBundle,
} from '../agentic/work-selection/task-breakdown.js';
import { diagnoseFailure } from '../agentic/diagnosis/agentic-diagnosis.js';
import { classifyIntent } from '../agentic/intelligence/intent-classifier.js';
import {
  executeWork,
  inferCapabilitiesFromTask,
  logCapabilityAttempt,
  logCapabilityResult,
  logWorkStart,
  getRetryTracker,
} from '../agentic/execution/execution-handler.js';

// DETERMINISTIC - Mechanical operations
import { checkHealth } from '../deterministic/health-checker.js';
import { processHumanInputs } from '../deterministic/input-processor.js';
import { ingestQueueTasks } from '../deterministic/queue-processor.js';
import { createGoalBundle } from '../deterministic/workspace-writers.js';
import { appendInputLog } from '../deterministic/inputs-log.js';
import { isRateLimitError, isInCooldown, enterCooldown, resetBackoff } from '../deterministic/backoff-manager.js';
import { validateWork } from '../deterministic/validation-handler.js';
import { regenerateGoalsIndex } from '../deterministic/goals-index-generator.js';
import {
  updateTaskState,
  updateStepState,
  writeToNeedsYou,
  escalateWithDiagnosis,
  markTaskBlocked,
  markStepBlocked,
  setTaskOutputPath,
  commitOutputsMonorepo,
} from '../deterministic/state-handler.js';
import { incrementStepRetryCount, readStepRetryCount, stepId as makeStepId } from '../deterministic/tasks-json-handler.js';

// SELF-IMPROVEMENT - Idle and scheduled triggers
import { checkSelfImprovementTriggers } from '../agentic/calibration/self-improvement-triggers.js';
import { generateSelfImprovementTask } from '../agentic/calibration/self-improvement-task-generator.js';
import { runWeeklyRetrospective } from '../agentic/calibration/retrospective.js';

// Load environment variables
config();

// === CONFIGURATION ===
const MAX_RETRIES = 10; // Constitution mandates 10 retries minimum
const IDLE_SLEEP_MS = parseInt(process.env.IDLE_SLEEP_SECONDS || '30', 10) * 1000;
const UNHEALTHY_SLEEP_MS = parseInt(process.env.UNHEALTHY_SLEEP_SECONDS || '60', 10) * 1000;

// === LOOP STATE ===
const loopState: LoopState = {
  running: true,
  iteration: 0,
  last_work_at: null,
  current_task: null,
};

// Track day boundary for daily summary generation
let lastReportedDay: string | null = null;
let lastReportedWeek: string | null = null;

/**
 * Check if system is healthy enough to work
 * DETERMINISTIC: Simple threshold check
 */
function isHealthyEnoughToWork(health: HealthStatus): boolean {
  return health.overall === 'healthy' || health.overall === 'degraded';
}

/**
 * Iteration result types
 */
type IterationResult =
  | 'work_completed' // Continue immediately
  | 'work_failed' // Continue immediately (retry or next task)
  | 'no_work' // Sleep before polling again
  | 'unhealthy'; // Sleep before retrying

/**
 * Main loop iteration - THE 8 PHASES
 */
async function runIteration(): Promise<IterationResult> {
  loopState.iteration++;
  log('');
  log('='.repeat(80));
  log(`ITERATION ${loopState.iteration}`);
  log('='.repeat(80));

  // Check if day boundary crossed - generate daily summary for previous day
  const today = new Date().toISOString().split('T')[0];
  if (lastReportedDay && lastReportedDay !== today) {
    logDeterministic('Day boundary detected - generating daily summary for yesterday');
    try {
      const { reportDailySummary } = await import('../deterministic/notion-reporter.js');
      await reportDailySummary(path.join(process.cwd(), 'ledgers'));
    } catch (e) {
      log(`  Daily summary generation failed (non-blocking): ${e}`);
    }
  }
  lastReportedDay = today;

  // Check if week boundary crossed (Sunday) - generate weekly summary
  const now = new Date();
  const isSunday = now.getDay() === 0;
  const currentWeek = `${now.getFullYear()}-W${String(Math.ceil((Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, '0')}`;
  if (isSunday && lastReportedWeek !== currentWeek) {
    logDeterministic('Weekly boundary detected (Sunday) - generating weekly summary');
    try {
      const { reportWeeklySummary } = await import('../deterministic/notion-reporter.js');
      await reportWeeklySummary(path.join(process.cwd(), 'ledgers'));
      lastReportedWeek = currentWeek;
    } catch (e) {
      log(`  Weekly summary generation failed (non-blocking): ${e}`);
    }
  }

  // === PHASE 1: HEALTH CHECK ===
  logDeterministic('PHASE 1: Health Check');
  const health = await checkHealth();
  logHealthStatus(health);

  if (!isHealthyEnoughToWork(health)) {
    logDeterministic('System unhealthy - skipping work execution');
    return 'unhealthy';
  }

  // Regenerate goals.md index from bundles (human-readable checkbox view)
  try {
    await regenerateGoalsIndex();
  } catch (e) {
    log(`  Goals index generation failed (non-blocking): ${e}`);
  }

  // === PHASE 2: CHECK HUMAN INPUTS ===
  logAgentic('PHASE 2: Process Human Inputs');
  const inputsProcessed = await processHumanInputs();

  if (inputsProcessed.responsesFound > 0) {
    log(`  Processed ${inputsProcessed.responsesFound} human response(s)`);
    log(`  Unblocked tasks: ${inputsProcessed.tasksUnblocked.join(', ') || 'none'}`);

    // Reset retry tracker for unblocked tasks
    const retryTracker = getRetryTracker();
    for (const taskTitle of inputsProcessed.tasksUnblocked) {
      retryTracker.delete(taskTitle);
      logAgentic(`  Reset retry counter for: "${taskTitle}"`);
    }
  }

  // Ingest queue tasks as draft bundles (V1.2)
  const queueResult = await ingestQueueTasks();
  if (queueResult.ingested.length > 0) {
    let createdCount = 0;
    for (const item of queueResult.ingested) {
      const description = `Imported from queue.md (Ready to Start)`;
      const bundlePath = await createGoalBundle(item, description, undefined, 'P3');
      if (bundlePath) {
        createdCount++;
        await appendInputLog({
          source: 'queue',
          ts: new Date().toISOString(),
          raw_input: item,
          priority: 'P3',
          scope_allowed: ['workspace/drafts/'],
          intent_type: 'queue_ingest',
          metadata: { status: 'ingested_to_draft_bundle', bundle_path: bundlePath },
        });
      }
    }
    log(`  Ingested ${createdCount} task(s) from queue as draft bundles`);
  }

  // === PHASE 3: SELECT WORK ===
  logAgentic('PHASE 3: Select Work (Priority: P0 > P1 > P2 > P3 > P4)');
  const selectedWork = await selectWorkWithSteps();

  if (!selectedWork) {
    logAgentic('  No work available in queue');

    // NEW: Check for self-improvement opportunities when idle
    logAgentic('  Checking for self-improvement opportunities...');
    const selfImprovementTrigger = await checkSelfImprovementTriggers();

    if (selfImprovementTrigger) {
      logAgentic(`  Self-improvement trigger found: ${selfImprovementTrigger.type}`);
      logAgentic(`  Reason: ${selfImprovementTrigger.reason}`);

      // Handle retrospective directly (batch analysis, no worker needed)
      if (selfImprovementTrigger.type === 'retrospective') {
        logAgentic('  Running weekly retrospective inline...');
        const reportPath = await runWeeklyRetrospective();
        if (reportPath) {
          logAgentic(`  Retrospective complete: ${reportPath}`);
          return 'work_completed';
        } else {
          logAgentic('  Retrospective failed (non-blocking)');
          return 'no_work';
        }
      }

      // For other self-improvement types, generate task bundle
      const taskAdded = await generateSelfImprovementTask(selfImprovementTrigger);

      if (taskAdded) {
        logAgentic('  Self-improvement task added');
        // Continue immediately to pick up the new task
        return 'work_completed';
      } else {
        logAgentic('  Self-improvement task already exists or failed to add');
      }
    } else {
      logAgentic('  No self-improvement triggers ready');
    }

    return 'no_work';
  }

  let workItem = selectedWork.task;
  let currentStep = selectedWork.step;
  let isStepExecution = selectedWork.type === 'step';

  if (isStepExecution && currentStep) {
    logAgentic(`Selected STEP: [${workItem.priority}] ${workItem.title}`);
    log(`  Step ${currentStep.step_number + 1}/${workItem.steps?.length}: ${currentStep.title}`);
  } else {
    logAgentic(`Selected TASK: [${workItem.priority}] ${workItem.title}`);
  }

  // === PHASE 3b: AUTO-BREAKDOWN (if needed) ===
  // Check if this whole task needs to be broken into steps before execution
  if (!isStepExecution && needsBreakdown(workItem)) {
    const estimated = estimateComplexity(workItem);
    logAgentic(`PHASE 3b: Auto-Breakdown`);
    log(`  Estimated complexity: ${estimated} turns (threshold: ${process.env.BREAKDOWN_THRESHOLD_TURNS || '100'})`);

    const steps = generateStaticBreakdown(workItem);
    log(`  Generated ${steps.length} steps for "${workItem.title}"`);

    // Write steps to the bundle: TASKS.json (primary) + PROMPT.md (legacy)
    if (workItem.source_path) {
      const written = await writeStepsToBundle(workItem.source_path, steps);
      if (written) {
        logAgentic(`  Steps written to TASKS.json — re-selecting to execute step 1`);

        // Log breakdown event to work ledger
        await logBreakdownEvent(workItem.id, workItem.title, steps.length, 'auto');

        // Re-select work — should now find step 1
        const reselected = await selectWorkWithSteps();
        if (reselected && reselected.step) {
          workItem = reselected.task;
          currentStep = reselected.step;
          isStepExecution = true;
          logAgentic(`  Re-selected: Step ${currentStep.step_number + 1}/${workItem.steps?.length}: ${currentStep.title}`);
        } else {
          log(`  WARNING: Re-selection after breakdown found no steps — continuing as whole task`);
        }
      } else {
        log(`  Steps not written (already exists or error) — executing as whole task`);
      }
    } else {
      log(`  No source_path on work item — cannot write steps to bundle, executing as whole task`);
    }

  } else if (!isStepExecution) {
    const estimated = estimateComplexity(workItem);
    log(`  Complexity estimate: ${estimated} turns (below breakdown threshold)`);
  }

  // Log output_path for resume traceability
  if (workItem.output_path) {
    log(`  Output path: ${workItem.output_path} (resuming)`);
  }

  // === PHASE 4: EXECUTE WORK ===
  const contractId = `task-${Date.now()}`;
  loopState.current_task = contractId;

  logAgentic('PHASE 4: Execute Work (Agent SDK Worker)');

  // Log capability attempt
  const intent = await classifyIntent(workItem);
  const capabilities = inferCapabilitiesFromTask(workItem, intent);
  await logCapabilityAttempt(workItem, capabilities);
  await logWorkStart(workItem, currentStep, contractId);

  const result = await executeWork(workItem, currentStep, contractId);

  // === PHASE 5: VALIDATE WORK ===
  logAgentic('PHASE 5: Validate Work');
  // Pass current step for step-aware validation
  const isValid = await validateWork(workItem, result, currentStep);

  // Log capability result
  await logCapabilityResult(workItem, capabilities, isValid, contractId);

  // === PHASE 6: UPDATE STATE ===
  if (isValid && result) {
    logDeterministic('PHASE 6: Update State (Success)');

    // CRITICAL: Persist output_path to PROMPT.md for resume across restarts
    // Only write if we have a new path and the task doesn't already have one
    if (result.output_path && !workItem.output_path) {
      logDeterministic('  Persisting output path for future resume...');
      const persisted = await setTaskOutputPath(workItem.title, result.output_path, workItem.source_path);
      if (!persisted) {
        log('  Warning: output_path not persisted — task may not resume correctly after restart');
      }
    }

    if (isStepExecution && currentStep) {
      await updateStepState(workItem, currentStep, true, undefined, result.output_path, contractId);
    } else {
      await updateTaskState(workItem, true, undefined, result.output_path, contractId, result.output);
    }

    // Commit worker output to agent-outputs monorepo
    commitOutputsMonorepo(workItem.title, result.output_path);

    // Reset backoff on success
    resetBackoff();

    loopState.last_work_at = new Date().toISOString();
    return 'work_completed';
  }

  // === FAILURE PATH ===
  logDeterministic('PHASE 6: Update State (Failure)');

  const retryTracker = getRetryTracker();
  const retryKey = isStepExecution && currentStep
    ? `${workItem.title}::step-${currentStep.step_number}`
    : workItem.title;

  let retry = retryTracker.get(retryKey);
  if (!retry) {
    // Seed retry count from TASKS.json if available (survives PM2 restarts)
    let persistedRetryCount = 0;
    if (isStepExecution && currentStep && workItem.source_path) {
      persistedRetryCount = await readStepRetryCount(workItem.source_path, makeStepId(currentStep.step_number));
      if (persistedRetryCount > 0) {
        log(`  Seeded retry count from TASKS.json: ${persistedRetryCount}`);
      }
    }
    retry = {
      attempts: persistedRetryCount,
      lastError: '',
      strategies: [],
      lastAttemptAt: '',
      currentStrategyId: null,
      output_path: undefined,
    };
  }

  retry.attempts++;
  retry.lastError = result?.errors.join(', ') || 'Unknown error';
  retry.lastAttemptAt = new Date().toISOString();

  // Persist retry count to TASKS.json (survives PM2 restarts)
  if (isStepExecution && currentStep && workItem.source_path) {
    await incrementStepRetryCount(workItem.source_path, makeStepId(currentStep.step_number));
  }

  // Store output_path in memory for retries within this session
  if (result?.output_path && !retry.output_path) {
    retry.output_path = result.output_path;
  }

  // CRITICAL: Persist to PROMPT.md so we can resume after PM2 restart
  // This ensures retries AND restarts use the same project directory
  if (result?.output_path && !workItem.output_path) {
    logDeterministic('  Persisting output path for retry/resume...');
    const persisted = await setTaskOutputPath(workItem.title, result.output_path, workItem.source_path);
    if (!persisted) {
      log('  Warning: output_path not persisted — retries may not resume correctly after restart');
    }
  }

  retryTracker.set(retryKey, retry);

  log(`  Attempt ${retry.attempts}/${MAX_RETRIES} failed`);
  log(`  Error: ${retry.lastError.slice(0, 200)}`);

  // === PHASE 7: AGENTIC DIAGNOSIS (after 3 failures) ===
  if (retry.attempts >= 3) {
    logAgentic('PHASE 7: Agentic Diagnosis (Investigate Failure)');

    const diagnosis = await diagnoseFailure(
      workItem,
      retry.attempts,
      retry.lastError,
      result?.output_path
    );

    log(`  Root cause: ${diagnosis.rootCause}`);

    if (diagnosis.escalateToHuman) {
      logAgentic('  Decision: Escalate to human (needs-you.md)');

      if (isStepExecution && currentStep) {
        await markStepBlocked(workItem, currentStep.step_number);
      }
      await markTaskBlocked(workItem, contractId);
      await escalateWithDiagnosis(workItem, retry.attempts, diagnosis.diagnosis, contractId);

      retryTracker.delete(retryKey);
      return 'work_failed';
    }

    if (diagnosis.shouldRetry && diagnosis.suggestedFix) {
      logAgentic('  Decision: Apply suggested fix and retry');
      log(`  Fix: ${diagnosis.suggestedFix}`);

      retry.suggestedFix = diagnosis.suggestedFix;
      retryTracker.set(retryKey, retry);
      return 'work_failed'; // Will retry next iteration
    }

    logAgentic('  Decision: Continue normal retry logic');
  }

  // === PHASE 8: MAX RETRIES REACHED ===
  if (retry.attempts >= MAX_RETRIES) {
    logDeterministic('PHASE 8: Max Retries Reached (Constitution Limit)');
    log(`  Marking as blocked after ${MAX_RETRIES} attempts`);

    if (isStepExecution && currentStep) {
      await markStepBlocked(workItem, currentStep.step_number);
    }
    await markTaskBlocked(workItem, contractId);
    await writeToNeedsYou(workItem, retry.attempts, retry.lastError, contractId);

    retryTracker.delete(retryKey);
    return 'work_failed';
  }

  // Continue retrying
  return 'work_failed';
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  log('');
  log('╔════════════════════════════════════════════════════════════════╗');
  log('║         CONTINUOUS EXECUTIVE AGENT - STARTING UP               ║');
  log('╚════════════════════════════════════════════════════════════════╝');
  log('');
  logAgentic('Architecture: AGENTIC work selection, execution, diagnosis');
  logDeterministic('Architecture: DETERMINISTIC force-march loop, file I/O');
  log('');

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('');
    log('Received SIGINT - shutting down gracefully...');
    loopState.running = false;
    closeLogStream();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('');
    log('Received SIGTERM - shutting down gracefully...');
    loopState.running = false;
    closeLogStream();
    process.exit(0);
  });

  // === MAIN LOOP (FORCE MARCH) ===
  logDeterministic('Starting continuous execution loop (CTRL+C to stop)');
  log('');

  while (loopState.running) {
    try {
      // Check rate limit cooldown
      if (isInCooldown()) {
        const sleepMs = 60000; // Check every minute during cooldown
        logDeterministic(`Rate limit cooldown active - sleeping ${sleepMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        continue;
      }

      // Run iteration
      const result = await runIteration();

      // Decide whether to sleep
      if (result === 'work_completed' || result === 'work_failed') {
        logDeterministic('Continue immediately (more work may be available)');
        // No sleep - continue immediately
      } else if (result === 'no_work') {
        logDeterministic(`No work available - sleeping ${IDLE_SLEEP_MS / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, IDLE_SLEEP_MS));
      } else if (result === 'unhealthy') {
        logDeterministic(`System unhealthy - sleeping ${UNHEALTHY_SLEEP_MS / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, UNHEALTHY_SLEEP_MS));
      }
    } catch (error) {
      // Handle rate limit errors with backoff
      if (isRateLimitError(error)) {
        log('');
        logDeterministic('RATE LIMIT ERROR DETECTED');
        enterCooldown(error);
      } else {
        log('');
        log(`ERROR in iteration: ${error}`);
        logDeterministic('Sleeping 30s before retry...');
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }
  }

  log('');
  log('Executive loop stopped');
  closeLogStream();
}

// Start the loop
main().catch((error) => {
  console.error('Fatal error in executive loop:', error);
  closeLogStream();
  process.exit(1);
});
