import { config } from 'dotenv';
import { readFile, writeFile, appendFile } from 'fs/promises';
import path from 'path';
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

// Backoff state for rate limiting / token exhaustion
interface BackoffState {
  consecutiveErrors: number;
  lastErrorAt: string | null;
  cooldownUntil: string | null;
  reason: string | null;
}

const backoffState: BackoffState = {
  consecutiveErrors: 0,
  lastErrorAt: null,
  cooldownUntil: null,
  reason: null,
};

// Token/rate limit error patterns
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  'quota exceeded',
  'token limit',
  'tokens exhausted',
  'overloaded',
  '429',
  '529',
];

/**
 * Check if error is a rate limit / token exhaustion error
 */
function isRateLimitError(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();
  return RATE_LIMIT_PATTERNS.some(pattern => errorStr.includes(pattern));
}

/**
 * Calculate backoff duration based on consecutive errors
 * Uses exponential backoff: 1min, 2min, 4min, 8min, 16min, max 30min
 */
function calculateBackoffMs(consecutiveErrors: number): number {
  const baseMs = 60 * 1000; // 1 minute
  const maxMs = 30 * 60 * 1000; // 30 minutes
  const backoffMs = Math.min(baseMs * Math.pow(2, consecutiveErrors - 1), maxMs);
  return backoffMs;
}

/**
 * Check if we're in cooldown mode
 */
function isInCooldown(): boolean {
  if (!backoffState.cooldownUntil) return false;
  return new Date() < new Date(backoffState.cooldownUntil);
}

/**
 * Enter cooldown mode after rate limit error
 */
function enterCooldown(error: unknown): void {
  backoffState.consecutiveErrors++;
  backoffState.lastErrorAt = new Date().toISOString();
  backoffState.reason = String(error).slice(0, 200);

  const backoffMs = calculateBackoffMs(backoffState.consecutiveErrors);
  const cooldownUntil = new Date(Date.now() + backoffMs);
  backoffState.cooldownUntil = cooldownUntil.toISOString();

  log(`⚠️ Rate limit detected. Entering cooldown mode.`);
  log(`  Consecutive errors: ${backoffState.consecutiveErrors}`);
  log(`  Cooldown until: ${backoffState.cooldownUntil}`);
  log(`  Backoff duration: ${Math.round(backoffMs / 1000 / 60)} minutes`);
}

/**
 * Reset backoff state after successful operation
 */
function resetBackoff(): void {
  if (backoffState.consecutiveErrors > 0) {
    log(`✓ Recovered from rate limit. Resetting backoff state.`);
  }
  backoffState.consecutiveErrors = 0;
  backoffState.lastErrorAt = null;
  backoffState.cooldownUntil = null;
  backoffState.reason = null;
}

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
  log(`  Title: ${item.title}`);
  log(`  Priority: ${item.priority}`);
  log(`  Description: ${item.description || '(none)'}`);
  log(`  Status: ${item.status}`);

  // Create task contract from work item
  const contract = createTaskContract(item);
  log(`  Task Contract ID: ${contract.id}`);
  log(`  Max Turns: ${contract.max_turns}`);
  log(`  Tools Allowed: ${contract.scope.tools_allowed.join(', ')}`);

  // Update loop state
  loopState.current_task = contract.id;

  log(`  Spawning worker agent...`);
  log(`    Goal: ${contract.goal.split('\n')[0]}...`);
  log(`    DoD items: ${contract.definition_of_done.length}`);

  try {
    const result = await spawnWorker(contract);
    log(`  Worker completed in ${result.duration_ms}ms`);
    log(`  Success: ${result.success}`);
    if (result.errors.length > 0) {
      log(`  Errors: ${result.errors.join(', ')}`);
    }
    if (result.output) {
      // Log first 500 chars of output
      log(`  Output: ${result.output.slice(0, 500)}${result.output.length > 500 ? '...' : ''}`);
    }
    return result;
  } catch (error) {
    logError('Worker execution failed', error);
    // Check if it's a rate limit error and propagate for backoff handling
    if (isRateLimitError(error)) {
      throw error; // Let the main loop handle backoff
    }
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

  try {
    // Update goals.md to reflect new status
    const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');
    const content = await readFile(goalsPath, 'utf-8');

    // Find and update the status for this task
    const newStatus = success ? 'Complete' : 'Blocked';
    const titlePattern = new RegExp(`(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`, 'i');

    if (titlePattern.test(content)) {
      const updatedContent = content.replace(titlePattern, `$1 ${newStatus}`);
      await writeFile(goalsPath, updatedContent, 'utf-8');
      log(`  Updated goals.md: "${item.title}" → ${newStatus}`);
    } else {
      log(`  Warning: Could not find task "${item.title}" in goals.md to update`);
    }

    // Log to work ledger
    const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');
    const ledgerEntry = JSON.stringify({
      event: success ? 'TASK_COMPLETED' : 'TASK_FAILED',
      ts: new Date().toISOString(),
      task_id: item.id,
      title: item.title,
      priority: item.priority,
      iteration: loopState.iteration,
    });
    await appendFile(ledgerPath, ledgerEntry + '\n', 'utf-8');
    log(`  Logged to work-ledger.jsonl`);

  } catch (error) {
    logError('Failed to update state', error);
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  log(`Selected work: [${workItem.priority}] ${workItem.title}`);

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
    // Check if in cooldown mode (rate limited / token exhausted)
    if (isInCooldown()) {
      const remaining = Math.round((new Date(backoffState.cooldownUntil!).getTime() - Date.now()) / 1000 / 60);
      log(`⏸️ In cooldown mode. ${remaining} minutes remaining. Reason: ${backoffState.reason?.slice(0, 50)}...`);
      await sleep(60 * 1000); // Check every minute during cooldown
      continue;
    }

    try {
      await runIteration();
      // Successful iteration - reset backoff
      resetBackoff();
    } catch (error) {
      logError('Iteration failed', error);

      // Check if this is a rate limit / token exhaustion error
      if (isRateLimitError(error)) {
        enterCooldown(error);
      } else {
        // Non-rate-limit error - short backoff
        backoffState.consecutiveErrors++;
        if (backoffState.consecutiveErrors >= 5) {
          log(`⚠️ Too many consecutive errors (${backoffState.consecutiveErrors}). Entering short cooldown.`);
          backoffState.cooldownUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min cooldown
        }
      }
    }

    if (loopState.running && !isInCooldown()) {
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
