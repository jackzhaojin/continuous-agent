import { config } from 'dotenv';
import { readFile, writeFile, appendFile } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import { checkHealth } from './health-checker.js';
import { selectWork } from './work-selector.js';
import { createTaskContract } from './task-contractor.js';
import { spawnWorker, validateAuth, type WorkerRetryContext } from './worker-spawner.js';
import { selectStrategy } from './intelligence/strategy-selector.js';
import { classifyIntent } from './intelligence/intent-classifier.js';
import { runAllVerifiers, summarizeResults, type VerifierResult } from './verifiers/index.js';
import { updateSkillsFromVerifierResults, DEFAULT_SKILL_MAPPINGS } from './learning/skill-updater.js';
import type { HealthStatus, WorkerResult, LoopState } from './types.js';
import type { WorkItem } from './work-selector.js';

// Load environment variables
config();

// === LOGGING SETUP ===
const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');

// Ensure ledgers directory exists synchronously at startup
import { mkdirSync } from 'fs';
if (!existsSync(LEDGERS_DIR)) {
  mkdirSync(LEDGERS_DIR, { recursive: true });
}

// Ensure reports/validation directory exists
const REPORTS_VALIDATION_DIR = path.join(process.cwd(), 'reports', 'validation');
if (!existsSync(REPORTS_VALIDATION_DIR)) {
  mkdirSync(REPORTS_VALIDATION_DIR, { recursive: true });
}

// Get dated log file path
function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LEDGERS_DIR, `executive-${date}.log`);
}

// Current log stream (rotates daily)
let currentLogDate = '';
let logStream: ReturnType<typeof createWriteStream> | null = null;

function getLogStream(): ReturnType<typeof createWriteStream> {
  const today = new Date().toISOString().split('T')[0];
  if (today !== currentLogDate || !logStream) {
    if (logStream) logStream.end();
    currentLogDate = today;
    logStream = createWriteStream(getLogFilePath(), { flags: 'a' });
  }
  return logStream;
}

/**
 * Write to both console and dated log file
 */
function writeLog(level: 'INFO' | 'ERROR' | 'WARN', message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);
  getLogStream().write(logLine + '\n');
}

// Global state for the executive loop
const loopState: LoopState = {
  running: true,
  iteration: 0,
  last_work_at: null,
  current_task: null,
};

// Retry tracker - tracks attempts per task with strategy info
// Key: task title, Value: retry state including strategies tried
interface RetryState {
  attempts: number;
  lastError: string;
  strategies: string[]; // Strategy IDs that have been tried
  lastAttemptAt: string;
  currentStrategyId: string | null;
}
const retryTracker: Map<string, RetryState> = new Map();

/**
 * Get the current strategy for a work item based on retry state
 */
function getCurrentStrategy(item: WorkItem): { strategyId: string | null; strategies: string[] } {
  const retry = retryTracker.get(item.title);
  const triedStrategies = retry?.strategies || [];

  const selection = selectStrategy(item, triedStrategies);
  if (selection) {
    return {
      strategyId: selection.strategy.id,
      strategies: [...triedStrategies, selection.strategy.id],
    };
  }

  return { strategyId: null, strategies: triedStrategies };
}

/**
 * Build retry context for worker
 */
function buildRetryContext(item: WorkItem): WorkerRetryContext | undefined {
  const retry = retryTracker.get(item.title);
  if (!retry) return undefined;

  return {
    attempts: retry.attempts,
    maxRetries: MAX_RETRIES,
    triedStrategies: retry.strategies,
    lastError: retry.lastError,
  };
}

const MAX_RETRIES = 10; // Per constitution: 10 retries before blocking

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

// Logging utilities - writes to both console and file
function log(message: string): void {
  writeLog('INFO', message);
}

function logError(message: string, error?: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error || '');
  writeLog('ERROR', `${message}${errorMsg ? ` - ${errorMsg}` : ''}`);
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
 * Infer which skills are being exercised based on task characteristics
 */
function inferSkillsFromTask(item: WorkItem, intent: { type: string }): string[] {
  const skills: string[] = [];
  const titleLower = item.title.toLowerCase();
  const descLower = (item.description || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Git skills
  if (combined.includes('commit') || combined.includes('branch') || combined.includes('git')) {
    skills.push('git.branch_commit');
  }

  // Node/NPM skills
  if (combined.includes('npm') || combined.includes('install') || combined.includes('package')) {
    skills.push('node.npm.install');
  }
  if (combined.includes('build') || combined.includes('compile')) {
    skills.push('node.npm.run_script');
  }
  if (combined.includes('test')) {
    skills.push('node.npm.run_script');
  }

  // Next.js skills
  if (combined.includes('next') || combined.includes('nextjs') || combined.includes('next.js')) {
    skills.push('nextjs.build.basic');
    if (combined.includes('route') || combined.includes('page')) {
      skills.push('nextjs.routing.app_router');
    }
  }

  // Documentation skills
  if (combined.includes('readme') || combined.includes('document') || combined.includes('docs')) {
    skills.push('comm.documentation');
  }

  // Based on intent type
  if (intent.type === 'implementation') {
    if (!skills.includes('git.branch_commit')) {
      skills.push('git.branch_commit');
    }
  }
  if (intent.type === 'debugging') {
    skills.push('reason.debugging');
  }

  // Default skill if nothing matched
  if (skills.length === 0) {
    skills.push('general.task_execution');
  }

  return [...new Set(skills)]; // Remove duplicates
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

  // Classify intent and log research requirements
  const intent = classifyIntent(item);
  log(`  Intent: ${intent.type} (confidence: ${intent.confidence}%)`);
  if (intent.research_required) {
    log(`  Research phase: REQUIRED`);
  }

  // Get strategy for this attempt
  const { strategyId, strategies } = getCurrentStrategy(item);
  if (strategyId) {
    log(`  Strategy: ${strategyId}`);
    // Update tracker with current strategy
    const retry = retryTracker.get(item.title);
    if (retry) {
      retry.currentStrategyId = strategyId;
      retry.strategies = strategies;
    }
  }

  // Create task contract from work item
  const contract = createTaskContract(item);
  log(`  Task Contract ID: ${contract.id}`);
  log(`  Max Turns: ${contract.max_turns}`);
  log(`  Tools Allowed: ${contract.scope.tools_allowed.join(', ')}`);

  // Update loop state
  loopState.current_task = contract.id;

  // Build retry context
  const retryContext = buildRetryContext(item);
  if (retryContext) {
    log(`  Retry Context: Attempt ${retryContext.attempts + 1}/${retryContext.maxRetries}`);
    log(`  Previous strategies: ${retryContext.triedStrategies.join(', ') || 'none'}`);
  }

  log(`  Spawning worker agent...`);
  log(`    Goal: ${contract.goal.split('\n')[0]}...`);
  log(`    DoD items: ${contract.definition_of_done.length}`);

  // Infer skills being exercised based on task/intent
  const skillsExercised = inferSkillsFromTask(item, intent);
  log(`  Skills exercised: ${skillsExercised.join(', ')}`);

  // Log SKILL_ATTEMPT event before starting work
  await logSkillAttempt(item, skillsExercised);

  try {
    // Pass work item and retry context for intelligent prompting
    const result = await spawnWorker(contract, item, retryContext);
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
 * Log SKILL_ATTEMPT event to capability ledger
 */
async function logSkillAttempt(item: WorkItem, skills: string[]): Promise<void> {
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'capability-ledger.jsonl');
  const entry = JSON.stringify({
    event: 'SKILL_ATTEMPT',
    ts: new Date().toISOString(),
    task_id: item.id,
    task_title: item.title,
    skills_exercised: skills,
    iteration: loopState.iteration,
  });
  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}

/**
 * Log SKILL_RESULT event to capability ledger
 */
async function logSkillResult(
  item: WorkItem,
  verifierResults: VerifierResult[],
  overallResult: 'PASS' | 'FAIL' | 'PARTIAL'
): Promise<void> {
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'capability-ledger.jsonl');
  const entry = JSON.stringify({
    event: 'SKILL_RESULT',
    ts: new Date().toISOString(),
    task_id: item.id,
    task_title: item.title,
    overall_result: overallResult,
    verifier_count: verifierResults.length,
    pass_count: verifierResults.filter(r => r.result === 'PASS').length,
    fail_count: verifierResults.filter(r => r.result === 'FAIL').length,
    iteration: loopState.iteration,
  });
  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}

/**
 * Validate work result by running verifiers
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

  // Determine project path from artifacts or use current directory
  const projectPath = process.cwd();
  log(`  Running verifiers on: ${projectPath}`);

  try {
    // Run all verifiers
    const verifierResults = await runAllVerifiers({ project_path: projectPath });
    const summary = summarizeResults(verifierResults);

    log(`  Verifier results: ${summary.summary}`);
    log(`  Overall: ${summary.overall}`);

    // Log individual verifier results
    for (const vr of verifierResults) {
      const icon = vr.result === 'PASS' ? '+' : '-';
      log(`    [${icon}] ${vr.verifier_id}: ${vr.message}`);
    }

    // Save validation report
    const reportPath = path.join(
      REPORTS_VALIDATION_DIR,
      `validation-${item.id}-${Date.now()}.json`
    );
    const report = {
      task_id: item.id,
      task_title: item.title,
      ts: new Date().toISOString(),
      iteration: loopState.iteration,
      overall: summary.overall,
      pass_count: summary.pass_count,
      fail_count: summary.fail_count,
      results: verifierResults,
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    log(`  Validation report saved: ${reportPath}`);

    // Log SKILL_RESULT event
    await logSkillResult(item, verifierResults, summary.overall);

    // Update skill confidence from verifier results (learning feedback loop)
    log('  Updating skill confidence from verifier results...');
    updateSkillsFromVerifierResults(verifierResults, DEFAULT_SKILL_MAPPINGS);

    // Return true only if all verifiers pass
    return summary.overall === 'PASS';
  } catch (error) {
    logError('Validation failed', error);
    return false;
  }
}

/**
 * Update state after work completion
 * IMPORTANT: Does NOT mark Blocked on first failure - uses retry tracking
 */
async function updateState(item: WorkItem, success: boolean, errorInfo?: string): Promise<void> {
  log(`Updating state for work item: ${item.id}`);
  log(`  Success: ${success}`);

  // Update loop state
  loopState.current_task = null;

  const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');
  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');

  if (success) {
    // SUCCESS - mark complete and clear retry tracker
    loopState.last_work_at = new Date().toISOString();
    retryTracker.delete(item.title);

    try {
      const content = await readFile(goalsPath, 'utf-8');
      const titlePattern = new RegExp(`(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`, 'i');
      if (titlePattern.test(content)) {
        const updatedContent = content.replace(titlePattern, `$1 Complete`);
        await writeFile(goalsPath, updatedContent, 'utf-8');
        log(`  ✓ Updated goals.md: "${item.title}" → Complete`);
      }

      const ledgerEntry = JSON.stringify({
        event: 'TASK_COMPLETED',
        ts: new Date().toISOString(),
        task_id: item.id,
        title: item.title,
        priority: item.priority,
        iteration: loopState.iteration,
      });
      await appendFile(ledgerPath, ledgerEntry + '\n', 'utf-8');
    } catch (error) {
      logError('Failed to update state', error);
    }
    return;
  }

  // FAILURE - track retry, only block after MAX_RETRIES
  let retry = retryTracker.get(item.title);
  if (!retry) {
    retry = { attempts: 0, lastError: '', strategies: [], lastAttemptAt: '', currentStrategyId: null };
  }
  retry.attempts++;
  retry.lastError = errorInfo || 'Unknown error';
  retry.lastAttemptAt = new Date().toISOString();

  // Record the strategy that was tried (if any)
  if (retry.currentStrategyId && !retry.strategies.includes(retry.currentStrategyId)) {
    retry.strategies.push(retry.currentStrategyId);
  }
  retry.currentStrategyId = null; // Clear for next attempt

  retryTracker.set(item.title, retry);

  log(`  Attempt ${retry.attempts}/${MAX_RETRIES} failed for "${item.title}"`);
  log(`  Error: ${retry.lastError.slice(0, 200)}`);

  // Log attempt to ledger with strategy info
  const attemptEntry = JSON.stringify({
    event: 'TASK_ATTEMPT_FAILED',
    ts: new Date().toISOString(),
    task_id: item.id,
    title: item.title,
    attempt: retry.attempts,
    max_retries: MAX_RETRIES,
    strategies_tried: retry.strategies,
    error: retry.lastError.slice(0, 500),
  });
  await appendFile(ledgerPath, attemptEntry + '\n', 'utf-8');

  if (retry.attempts >= MAX_RETRIES) {
    // TRULY BLOCKED - mark as blocked AND write to needs-you.md
    log(`  ⚠️ Max retries (${MAX_RETRIES}) reached. Marking as Blocked.`);

    try {
      // Update goals.md to Blocked
      const content = await readFile(goalsPath, 'utf-8');
      const titlePattern = new RegExp(`(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`, 'i');
      if (titlePattern.test(content)) {
        const updatedContent = content.replace(titlePattern, `$1 Blocked`);
        await writeFile(goalsPath, updatedContent, 'utf-8');
      }

      // MUST write to needs-you.md (per constitution)
      await writeToNeedsYou(item, retry);

      // Log final block
      const blockEntry = JSON.stringify({
        event: 'TASK_BLOCKED',
        ts: new Date().toISOString(),
        task_id: item.id,
        title: item.title,
        total_attempts: retry.attempts,
        last_error: retry.lastError.slice(0, 500),
      });
      await appendFile(ledgerPath, blockEntry + '\n', 'utf-8');

      // Clear tracker since we've officially blocked
      retryTracker.delete(item.title);

    } catch (error) {
      logError('Failed to update blocked state', error);
    }
  } else {
    // Still have retries left - keep status as "In Progress", will retry
    log(`  Will retry. ${MAX_RETRIES - retry.attempts} attempts remaining.`);

    try {
      const content = await readFile(goalsPath, 'utf-8');
      const titlePattern = new RegExp(`(###\\s+${escapeRegex(item.title)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`, 'i');
      if (titlePattern.test(content)) {
        const updatedContent = content.replace(titlePattern, `$1 In Progress (retry ${retry.attempts}/${MAX_RETRIES})`);
        await writeFile(goalsPath, updatedContent, 'utf-8');
      }
    } catch (error) {
      logError('Failed to update retry state', error);
    }
  }
}

/**
 * Write blocked task to needs-you.md (REQUIRED by constitution)
 */
async function writeToNeedsYou(item: WorkItem, retry: RetryState): Promise<void> {
  const needsYouPath = path.join(process.cwd(), 'workspace', 'needs-you.md');

  try {
    let content = await readFile(needsYouPath, 'utf-8');

    const today = new Date().toISOString().split('T')[0];
    const newEntry = `| ${item.title} | Failed after ${retry.attempts} attempts. Last error: ${retry.lastError.slice(0, 100)}... | BLOCKING | ${today} |`;

    // Insert after the "Actions Needed" table header
    const actionsTable = /(\| Action \| Why Agent Can't Do It \| Blocking \| Since \|\n\|[-|]+\|)/;
    if (actionsTable.test(content)) {
      content = content.replace(actionsTable, `$1\n${newEntry}`);

      // Remove the *None* placeholder if present
      content = content.replace(/\| \*None\* \| \| \| \|/, '');

      await writeFile(needsYouPath, content, 'utf-8');
      log(`  📝 Added to needs-you.md: "${item.title}"`);
    } else {
      log(`  Warning: Could not find Actions Needed table in needs-you.md`);
    }
  } catch (error) {
    logError('Failed to write to needs-you.md', error);
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

  // Check retry state
  const retryState = retryTracker.get(workItem.title);
  if (retryState) {
    log(`  Previous attempts: ${retryState.attempts}/${MAX_RETRIES}`);
  }

  // Step 3: Execute work
  const result = await executeWork(workItem);

  // Step 4: Validate work
  const validationSuccess = await validateWork(workItem, result);

  // Step 5: Update state with error info if failed
  const errorInfo = result?.errors?.join('; ') || (result?.success === false ? 'Worker reported failure' : undefined);
  await updateState(workItem, validationSuccess, errorInfo);

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
