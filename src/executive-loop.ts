import { config } from 'dotenv';
import { checkHealth } from './health-checker.js';
import { selectWork } from './work-selector.js';
import { createTaskContract } from './task-contractor.js';
import { spawnWorker, validateAuth } from './worker-spawner.js';
import type { HealthStatus, WorkerResult, LoopState } from './types.js';
import type { WorkItem } from './work-selector.js';

// Load environment variables
config();

// Global state for the executive loop
const loopState: LoopState = {
  running: true,
  iteration: 0,
  last_work_at: null,
  current_task: null,
};

// Sleep utility
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// Timestamp logging utility
function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message: string, error?: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error || '');
  console.error(`[${new Date().toISOString()}] ERROR: ${message}${errorMsg ? ` - ${errorMsg}` : ''}`);
}

/**
 * Log health status summary
 */
function logHealthStatus(health: HealthStatus): void {
  log(`Health check: ${health.overall.toUpperCase()}`);
  for (const check of health.checks) {
    const icon = check.status === 'pass' ? '+' : '-';
    log(`  [${icon}] ${check.name}: ${check.message}`);
  }
}

/**
 * Check if health status allows work execution
 */
function isHealthyEnoughToWork(health: HealthStatus): boolean {
  // Allow work if healthy or degraded (but not unhealthy)
  return health.overall !== 'unhealthy';
}

/**
 * Execute a work item by spawning a worker agent
 */
async function executeWork(item: WorkItem): Promise<WorkerResult | null> {
  log(`Executing work item: ${item.id}`);
  log(`  Priority: ${item.priority}`);
  log(`  Description: ${item.description}`);
  log(`  Status: ${item.status}`);

  // Create task contract from work item
  const contract = createTaskContract(item);
  log(`  Task Contract ID: ${contract.id}`);
  log(`  Max Turns: ${contract.max_turns}`);
  log(`  Tools Allowed: ${contract.scope.tools_allowed.join(', ')}`);

  // Update loop state
  loopState.current_task = contract.id;

  // TODO: Enable worker spawning when ready for production
  // For now, log that we would spawn a worker
  log(`  [STUB] Would spawn worker with contract:`);
  log(`    Goal: ${contract.goal.split('\n')[0]}...`);
  log(`    DoD items: ${contract.definition_of_done.length}`);

  // Uncomment below to enable actual worker spawning:
  // try {
  //   log('  Spawning worker agent...');
  //   const result = await spawnWorker(contract);
  //   log(`  Worker completed in ${result.duration_ms}ms`);
  //   log(`  Success: ${result.success}`);
  //   if (result.errors.length > 0) {
  //     log(`  Errors: ${result.errors.join(', ')}`);
  //   }
  //   return result;
  // } catch (error) {
  //   logError('Worker execution failed', error);
  //   return null;
  // }

  // Stub result for now
  return {
    success: true,
    output: '[STUB] Work execution not yet implemented',
    artifacts: [],
    errors: [],
    duration_ms: 0,
  };
}

/**
 * Validate work result
 */
async function validateWork(item: WorkItem, result: WorkerResult | null): Promise<boolean> {
  log(`Validating work item: ${item.id}`);

  if (!result) {
    log('  No result to validate');
    return false;
  }

  if (!result.success) {
    log('  Worker reported failure');
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        log(`    Error: ${err}`);
      }
    }
    return false;
  }

  // TODO: Implement more sophisticated validation
  // - Run tests
  // - Check for linting errors
  // - Verify DoD items are met
  log('  [STUB] Detailed validation not yet implemented');

  return true;
}

/**
 * Update state after work completion
 */
async function updateState(item: WorkItem, success: boolean): Promise<void> {
  log(`Updating state for work item: ${item.id}`);
  log(`  Success: ${success}`);

  // Update loop state
  loopState.current_task = null;
  if (success) {
    loopState.last_work_at = new Date().toISOString();
  }

  // TODO: Implement state update
  // - Update goals.md to mark item as completed
  // - Update state.json with execution history
  // - Log to audit trail
  log('  [STUB] State update not yet implemented');
}

/**
 * Main executive loop iteration
 */
async function runIteration(): Promise<void> {
  loopState.iteration++;
  log(`--- Starting iteration ${loopState.iteration} ---`);

  // Step 1: Health check
  log('Running health checks...');
  const health = await checkHealth();
  logHealthStatus(health);

  if (!isHealthyEnoughToWork(health)) {
    log('System unhealthy, skipping work execution');
    return;
  }

  // Step 2: Check inputs and select work
  log('Selecting work...');
  const workItem = await selectWork();

  if (!workItem) {
    log('No work available');
    return;
  }

  log(`Selected work: [${workItem.priority}] ${workItem.description}`);

  // Step 3: Execute work
  const result = await executeWork(workItem);

  // Step 4: Validate work
  const validationSuccess = await validateWork(workItem, result);

  // Step 5: Update state
  await updateState(workItem, validationSuccess);

  log('--- Iteration complete ---');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  log('========================================');
  log('Continuous Executive Agent Starting');
  log('========================================');
  log(`Node.js ${process.version}`);
  log(`Working directory: ${process.cwd()}`);

  // Validate authentication
  const authStatus = validateAuth();
  if (!authStatus.valid) {
    logError(authStatus.error || 'Authentication validation failed');
    log('Please set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

  log(`Authentication: ${authStatus.method}`);
  log(`Model: ${process.env.MODEL || 'claude-sonnet-4-5-20250929'}`);

  // Setup graceful shutdown handlers
  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down gracefully...');
    loopState.running = false;
  });

  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully...');
    loopState.running = false;
  });

  // Main loop
  const sleepInterval = parseInt(process.env.LOOP_SLEEP_SECONDS || '30', 10) * 1000;

  while (loopState.running) {
    try {
      await runIteration();
    } catch (error) {
      logError('Iteration failed', error);
    }

    if (loopState.running) {
      log(`Sleeping for ${sleepInterval / 1000} seconds...`);
      await sleep(sleepInterval);
    }
  }

  log('========================================');
  log('Continuous Executive Agent Stopped');
  log(`Total iterations: ${loopState.iteration}`);
  log(`Last successful work: ${loopState.last_work_at || 'none'}`);
  log('========================================');
  process.exit(0);
}

// Run the application
main().catch((error) => {
  logError('Fatal error', error);
  process.exit(1);
});
