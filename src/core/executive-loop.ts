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
import {
  updateTaskState,
  updateStepState,
  writeToNeedsYou,
  escalateWithDiagnosis,
  markTaskBlocked,
  markStepBlocked,
  setTaskOutputPath,
} from '../deterministic/state-handler.js';

// SELF-IMPROVEMENT - Idle and scheduled triggers
import { checkSelfImprovementTriggers } from '../agentic/calibration/self-improvement-triggers.js';
import { generateSelfImprovementTask } from '../agentic/calibration/self-improvement-task-generator.js';

// V1.2 - Goal index regeneration
import { generateGoalsIndex } from '../deterministic/goal-index-generator.js';

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

  // === PHASE 1: HEALTH CHECK ===
  logDeterministic('PHASE 1: Health Check');
  const health = await checkHealth();
  logHealthStatus(health);

  if (!isHealthyEnoughToWork(health)) {
    logDeterministic('System unhealthy - skipping work execution');
    return 'unhealthy';
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

      // Generate task in goals.md - will be picked up on next iteration
      const taskAdded = await generateSelfImprovementTask(selfImprovementTrigger);

      if (taskAdded) {
        logAgentic('  Self-improvement task added to goals.md');
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

  const workItem = selectedWork.task;
  const currentStep = selectedWork.step;
  const isStepExecution = selectedWork.type === 'step';

  if (isStepExecution && currentStep) {
    logAgentic(`Selected STEP: [${workItem.priority}] ${workItem.title}`);
    log(`  Step ${currentStep.step_number + 1}/${workItem.steps?.length}: ${currentStep.title}`);
  } else {
    logAgentic(`Selected TASK: [${workItem.priority}] ${workItem.title}`);
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

    // CRITICAL: Persist output_path to goals.md for resume across restarts
    // Only write if we have a new path and the task doesn't already have one
    if (result.output_path && !workItem.output_path) {
      logDeterministic('  Persisting output path for future resume...');
      await setTaskOutputPath(workItem.title, result.output_path);
    }

    if (isStepExecution && currentStep) {
      await updateStepState(workItem, currentStep, true, undefined, result.output_path, contractId);
    } else {
      await updateTaskState(workItem, true, undefined, result.output_path, contractId, result.output);
    }

    // Reset backoff on success
    resetBackoff();

    // V1.2: Regenerate goals.md index from folder tree
    await generateGoalsIndex();

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
    retry = {
      attempts: 0,
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

  // Store output_path in memory for retries within this session
  if (result?.output_path && !retry.output_path) {
    retry.output_path = result.output_path;
  }

  // CRITICAL: Also persist to goals.md so we can resume after PM2 restart
  // This ensures retries AND restarts use the same project directory
  if (result?.output_path && !workItem.output_path) {
    logDeterministic('  Persisting output path for retry/resume...');
    await setTaskOutputPath(workItem.title, result.output_path);
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
      await markTaskBlocked(workItem);
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
    await markTaskBlocked(workItem);
    await writeToNeedsYou(workItem, retry.attempts, retry.lastError, contractId);

    // V1.2: Regenerate goals.md index
    await generateGoalsIndex();

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
