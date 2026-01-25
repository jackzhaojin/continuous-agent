import { config } from 'dotenv';
import { readFile, writeFile, appendFile } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import { checkHealth } from './health-checker.js';
import { selectWork, selectWorkWithSteps, updateStepStatus, updateTaskProgressFromSteps, type SelectableWork } from './work-selector.js';
import { createTaskContract } from './task-contractor.js';
import { spawnWorker, validateAuth, type WorkerRetryContext } from './worker-spawner.js';
import { selectStrategy } from './intelligence/strategy-selector.js';
import { classifyIntent } from './intelligence/intent-classifier.js';
import { runAllVerifiers, summarizeResults, type VerifierResult } from './verifiers/index.js';
import { updateCapabilitiesFromVerifierResults, DEFAULT_CAPABILITY_MAPPINGS } from './learning/capability-updater.js';
import { processHumanInputs } from './input-processor.js';
import { needsBreakdown, generateStaticBreakdown, writeStepsToGoals, shouldReBreakdown, reBreakdownStep, logBreakdownEvent } from './task-breakdown.js';
import type { HealthStatus, WorkerResult, LoopState, WorkStep } from './types.js';
import type { WorkItem } from './work-selector.js';
import { appendInputLog } from './inputs-log.js';
import { ingestQueueTasks } from './queue-processor.js';
import { appendGoalsFromQueue, updateProgressOnStart, recordCompletion } from './workspace-writers.js';

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
  output_path?: string; // Persist project path across retries to continue same work
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
    existingProjectPath: retry.output_path, // Reuse same project path across retries
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
 * Infer which capabilities are being exercised based on task characteristics
 */
function inferCapabilitiesFromTask(item: WorkItem, intent: { type: string }): string[] {
  const capabilities: string[] = [];
  const titleLower = item.title.toLowerCase();
  const descLower = (item.description || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Git capabilities
  if (combined.includes('commit') || combined.includes('branch') || combined.includes('git')) {
    capabilities.push('git.branch_commit');
  }

  // Node/NPM capabilities
  if (combined.includes('npm') || combined.includes('install') || combined.includes('package')) {
    capabilities.push('node.npm.install');
  }
  if (combined.includes('build') || combined.includes('compile')) {
    capabilities.push('node.npm.run_script');
  }
  if (combined.includes('test')) {
    capabilities.push('node.npm.run_script');
  }

  // Next.js capabilities
  if (combined.includes('next') || combined.includes('nextjs') || combined.includes('next.js')) {
    capabilities.push('nextjs.build.basic');
    if (combined.includes('route') || combined.includes('page')) {
      capabilities.push('nextjs.routing.app_router');
    }
  }

  // Documentation capabilities
  if (combined.includes('readme') || combined.includes('document') || combined.includes('docs')) {
    capabilities.push('comm.documentation');
  }

  // Based on intent type
  if (intent.type === 'implementation') {
    if (!capabilities.includes('git.branch_commit')) {
      capabilities.push('git.branch_commit');
    }
  }
  if (intent.type === 'debugging') {
    capabilities.push('reason.debugging');
  }

  // Default capability if nothing matched
  if (capabilities.length === 0) {
    capabilities.push('general.task_execution');
  }

  return [...new Set(capabilities)]; // Remove duplicates
}

/**
 * Execute a work item (or step) by spawning a worker agent
 */
async function executeWork(item: WorkItem, step?: WorkStep): Promise<WorkerResult | null> {
  const isStepExecution = !!step;
  
  if (isStepExecution) {
    log(`Executing step: ${step!.step_number + 1} - ${step!.title}`);
    log(`  Parent task: ${item.title}`);
    log(`  Priority: ${item.priority}`);
    log(`  Step description: ${step!.description || '(none)'}`);
  } else {
    log(`Executing work item: ${item.id}`);
    log(`  Title: ${item.title}`);
    log(`  Priority: ${item.priority}`);
    log(`  Description: ${item.description || '(none)'}`);
    log(`  Status: ${item.status}`);
  }

  // Classify intent and log research requirements
  const intent = classifyIntent(item);
  log(`  Intent: ${intent.type} (confidence: ${intent.confidence}%)`);
  if (intent.research_required) {
    log(`  Research phase: REQUIRED`);
  }

  // Get strategy for this attempt
  const retryKey = isStepExecution ? `${item.title}::step${step!.step_number}` : item.title;
  const { strategyId, strategies } = getCurrentStrategy(item);
  if (strategyId) {
    log(`  Strategy: ${strategyId}`);
    // Update tracker with current strategy
    const retry = retryTracker.get(retryKey);
    if (retry) {
      retry.currentStrategyId = strategyId;
      retry.strategies = strategies;
    }
  }

  // Create task contract from work item (with step context for multi-step tasks)
  const contract = createTaskContract(item, ['.'], step);
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

  const statusNote = step
    ? `Step ${step.step_number + 1}: ${step.title}`
    : 'Task execution started';
  await updateProgressOnStart(item.title, statusNote);

  // Infer capabilities being exercised based on task/intent
  const capabilitiesExercised = inferCapabilitiesFromTask(item, intent);
  log(`  Capabilities exercised: ${capabilitiesExercised.join(', ')}`);

  // Log CAPABILITY_ATTEMPT event before starting work
  await logCapabilityAttempt(item, capabilitiesExercised);
  await logWorkStart(item, step, contract.id);

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
 * Log CAPABILITY_ATTEMPT event to capability ledger
 */
async function logCapabilityAttempt(item: WorkItem, capabilities: string[]): Promise<void> {
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'capability-ledger.jsonl');
  const entry = JSON.stringify({
    event: 'CAPABILITY_ATTEMPT',
    ts: new Date().toISOString(),
    task_id: item.id,
    contract_id: loopState.current_task, // Link to worker log: ledgers/{date}/worker-{contract_id}.log
    task_title: item.title,
    capabilities_exercised: capabilities,
    iteration: loopState.iteration,
  });
  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}

/**
 * Log CAPABILITY_RESULT event to capability ledger
 */
async function logCapabilityResult(
  item: WorkItem,
  verifierResults: VerifierResult[],
  overallResult: 'PASS' | 'FAIL' | 'PARTIAL'
): Promise<void> {
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'capability-ledger.jsonl');
  const entry = JSON.stringify({
    event: 'CAPABILITY_RESULT',
    ts: new Date().toISOString(),
    task_id: item.id,
    contract_id: loopState.current_task, // Link to worker log: ledgers/{date}/worker-{contract_id}.log
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
 * Log work start event to work ledger
 */
async function logWorkStart(item: WorkItem, step: WorkStep | undefined, contractId: string): Promise<void> {
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');
  const entry = JSON.stringify({
    event: step ? 'STEP_STARTED' : 'TASK_STARTED',
    ts: new Date().toISOString(),
    task_id: item.id,
    task_title: item.title,
    contract_id: contractId,
    step_number: step ? step.step_number + 1 : null,
    step_title: step ? step.title : null,
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

    // Log CAPABILITY_RESULT event
    await logCapabilityResult(item, verifierResults, summary.overall);

    // Update capability confidence from verifier results (learning feedback loop)
    log('  Updating capability confidence from verifier results...');
    updateCapabilitiesFromVerifierResults(verifierResults, DEFAULT_CAPABILITY_MAPPINGS);

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
async function updateState(
  item: WorkItem,
  success: boolean,
  errorInfo?: string,
  outputPath?: string,
  result?: WorkerResult | null
): Promise<void> {
  log(`Updating state for work item: ${item.id}`);
  log(`  Success: ${success}`);
  if (outputPath) {
    log(`  Output path: ${outputPath}`);
  }

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
        contract_id: loopState.current_task, // Link to worker log: ledgers/{date}/worker-{contract_id}.log
        title: item.title,
        priority: item.priority,
        iteration: loopState.iteration,
        output_path: outputPath || null,
        duration_ms: result?.duration_ms || null,
        artifacts: result?.artifacts || [],
      });
      await appendFile(ledgerPath, ledgerEntry + '\n', 'utf-8');
      await recordCompletion(item.title, 'Completed', item.title);
    } catch (error) {
      logError('Failed to update state', error);
    }
    return;
  }

  // FAILURE - track retry, only block after MAX_RETRIES
  let retry = retryTracker.get(item.title);
  if (!retry) {
    retry = { attempts: 0, lastError: '', strategies: [], lastAttemptAt: '', currentStrategyId: null, output_path: undefined };
  }
  retry.attempts++;
  retry.lastError = errorInfo || 'Unknown error';
  retry.lastAttemptAt = new Date().toISOString();

  // Store output_path from first attempt for subsequent retries to continue same work
  if (outputPath && !retry.output_path) {
    retry.output_path = outputPath;
    log(`  Storing output path for retries: ${outputPath}`);
  }

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
    contract_id: loopState.current_task, // Link to worker log: ledgers/{date}/worker-{contract_id}.log
    title: item.title,
    attempt: retry.attempts,
    max_retries: MAX_RETRIES,
    strategies_tried: retry.strategies,
    error: retry.lastError.slice(0, 500),
    output_path: outputPath || null,
    duration_ms: result?.duration_ms || null,
    artifacts: result?.artifacts || [],
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
        contract_id: loopState.current_task, // Link to worker log: ledgers/{date}/worker-{contract_id}.log
        title: item.title,
        total_attempts: retry.attempts,
        last_error: retry.lastError.slice(0, 500),
        output_path: outputPath || null,
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
    const newEntry = `| ${item.title} | Failed after ${retry.attempts} attempts. Last error: ${retry.lastError.slice(0, 100)}... | | BLOCKING | ${today} |`;

    // Insert after the "Actions Needed" table header (now includes Response column)
    const actionsTable = /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|\n\|[-|]+\|)/;
    if (actionsTable.test(content)) {
      content = content.replace(actionsTable, `$1\n${newEntry}`);

      // Remove the *None* placeholder if present (now 5 columns)
      content = content.replace(/\| \*None\* \| \| \| \| \|/, '');

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
 * Update state after step or task completion
 * Handles both single-step tasks and multi-step task step completion
 */
async function updateStateWithStep(
  item: WorkItem, 
  step: WorkStep | undefined, 
  success: boolean, 
  errorInfo?: string, 
  outputPath?: string,
  result?: WorkerResult | null
): Promise<void> {
  // If no step, delegate to existing updateState for backward compatibility
  if (!step) {
    return updateState(item, success, errorInfo, outputPath, result);
  }

  // Step execution path
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');
  const retryKey = `${item.title}::step${step.step_number}`;

  log(`Updating state for step ${step.step_number + 1}: ${step.title}`);
  log(`  Success: ${success}`);

  // Update loop state
  loopState.current_task = null;

  if (success) {
    // STEP SUCCESS - mark step complete, update task progress
    loopState.last_work_at = new Date().toISOString();
    retryTracker.delete(retryKey);

    const now = new Date().toISOString();
    
    // Update step status in goals.md
    await updateStepStatus(item.title, step.step_number, 'complete', {
      completed_at: now,
      output_path: outputPath,
    });

    // Update parent task progress
    if (item.steps) {
      // Update the step in the local copy
      const stepToUpdate = item.steps[step.step_number];
      if (stepToUpdate) {
        stepToUpdate.status = 'complete';
        stepToUpdate.completed_at = now;
      }
      await updateTaskProgressFromSteps(item.title, item.steps);
    }

    // Log step completion
    const ledgerEntry = JSON.stringify({
      event: 'STEP_COMPLETED',
      ts: now,
      task_id: item.id,
      task_title: item.title,
      step_number: step.step_number + 1,
      step_title: step.title,
      iteration: loopState.iteration,
      output_path: outputPath || null,
      duration_ms: result?.duration_ms || null,
      artifacts: result?.artifacts || [],
    });
    await appendFile(ledgerPath, ledgerEntry + '\n', 'utf-8');
    
    log(`  ✓ Step ${step.step_number + 1} complete`);

    // Check if this was the last step
    if (item.steps) {
      const remainingSteps = item.steps.filter(s => s.status !== 'complete');
      if (remainingSteps.length === 0) {
        log(`  ✓ All steps complete! Marking task as complete.`);
        await updateState(item, true, undefined, outputPath);
      } else {
        log(`  ${remainingSteps.length} steps remaining`);
      }
    }
    return;
  }

  // STEP FAILURE - check if re-breakdown is needed
  const turnsUsed = result?.duration_ms ? Math.round(result.duration_ms / 60000) : 0;
  const exitedWithError = result?.exit_code === 1;

  if (exitedWithError && shouldReBreakdown(step, turnsUsed)) {
    // Step is too complex, trigger re-breakdown
    log(`  Step appears too complex (${turnsUsed}+ turns used), triggering re-breakdown...`);
    
    const subSteps = reBreakdownStep(step, {
      error: errorInfo,
      turnsUsed,
    });

    if (subSteps.length > 0) {
      await logBreakdownEvent(item.id, item.title, subSteps.length, 're-breakdown');
      log(`  Created ${subSteps.length} sub-steps. Writing to goals.md...`);

      // Replace failed step with sub-steps in the item
      if (item.steps && step) {
        const stepIndex = item.steps.findIndex(s => s.step_number === step.step_number);
        if (stepIndex >= 0) {
          // Remove the failed step and insert sub-steps
          item.steps.splice(stepIndex, 1, ...subSteps);

          // Write updated steps to goals.md
          const written = await writeStepsToGoals(item.title, item.steps);
          if (written) {
            log(`  ✓ Sub-steps written to goals.md. Next iteration will execute first sub-step.`);
          } else {
            log(`  ⚠ Failed to write sub-steps to goals.md`);
          }
        }
      }
    } else {
      log(`  Re-breakdown limit reached. Step will be marked as blocked.`);
    }
  }

  // Track retry for step
  let retry = retryTracker.get(retryKey);
  if (!retry) {
    retry = { attempts: 0, lastError: '', strategies: [], lastAttemptAt: '', currentStrategyId: null, output_path: undefined };
  }
  retry.attempts++;
  retry.lastError = errorInfo || 'Unknown error';
  retry.lastAttemptAt = new Date().toISOString();

  if (outputPath && !retry.output_path) {
    retry.output_path = outputPath;
  }

  retryTracker.set(retryKey, retry);

  log(`  Step attempt ${retry.attempts}/${MAX_RETRIES} failed`);
  log(`  Error: ${retry.lastError.slice(0, 200)}`);

  // Log step failure to ledger
  const failEntry = JSON.stringify({
    event: 'STEP_ATTEMPT_FAILED',
    ts: new Date().toISOString(),
    task_id: item.id,
    task_title: item.title,
    step_number: step.step_number + 1,
    step_title: step.title,
    attempt: retry.attempts,
    max_retries: MAX_RETRIES,
    error: retry.lastError.slice(0, 500),
    duration_ms: result?.duration_ms || null,
    artifacts: result?.artifacts || [],
  });
  await appendFile(ledgerPath, failEntry + '\n', 'utf-8');

  if (retry.attempts >= MAX_RETRIES) {
    // Step is blocked after max retries
    log(`  ⚠️ Max retries reached for step. Marking step as blocked.`);
    await updateStepStatus(item.title, step.step_number, 'blocked');
    
    // Update parent task to blocked
    await updateState(item, false, `Step ${step.step_number + 1} failed: ${errorInfo}`, outputPath);
    
    retryTracker.delete(retryKey);
  } else {
    log(`  Will retry step. ${MAX_RETRIES - retry.attempts} attempts remaining.`);
    await updateStepStatus(item.title, step.step_number, 'in_progress');
  }
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
  log('Checking for human inputs...');
  const inputsProcessed = await processHumanInputs();
  if (inputsProcessed.responsesFound > 0) {
    log(`  Processed ${inputsProcessed.responsesFound} human response(s)`);
    log(`  Unblocked tasks: ${inputsProcessed.tasksUnblocked.join(', ') || 'none'}`);

    // Reset retry tracker for unblocked tasks (give them fresh attempts)
    for (const taskTitle of inputsProcessed.tasksUnblocked) {
      retryTracker.delete(taskTitle);
      log(`  Reset retry counter for: "${taskTitle}"`);
    }
  }

  const queueResult = await ingestQueueTasks();
  if (queueResult.ingested.length > 0) {
    const added = await appendGoalsFromQueue(queueResult.ingested, 'P3');
    for (const item of added) {
      await appendInputLog({
        source: 'queue',
        ts: new Date().toISOString(),
        raw_input: item,
        priority: 'P3',
        scope_allowed: ['workspace/goals.md'],
        intent_type: 'queue_ingest',
        metadata: { status: 'ingested_to_goals' },
      });
    }
  }

  // Step 3: Select work with step awareness (priority re-evaluation every iteration)
  log('Selecting work (with priority re-evaluation)...');
  const selectedWork = await selectWorkWithSteps();

  if (!selectedWork) {
    log('No work available');
    return;
  }

  const workItem = selectedWork.task;
  const currentStep = selectedWork.step;
  const isStepExecution = selectedWork.type === 'step';

  if (isStepExecution && currentStep) {
    log(`Selected step: [${workItem.priority}] ${workItem.title}`);
    log(`  Step ${currentStep.step_number + 1}: ${currentStep.title}`);
    if (workItem.steps) {
      log(`  Progress: Step ${currentStep.step_number + 1} of ${workItem.steps.length}`);
    }
  } else {
    log(`Selected task: [${workItem.priority}] ${workItem.title}`);
    
    // Step 3.5: Check if task needs automatic breakdown (pre-execution)
    if (needsBreakdown(workItem)) {
      log('  Task exceeds complexity threshold, triggering automatic breakdown...');
      const steps = generateStaticBreakdown(workItem);
      const writeSuccess = await writeStepsToGoals(workItem.title, steps);
      if (writeSuccess) {
        await logBreakdownEvent(workItem.id, workItem.title, steps.length, 'auto');
        log(`  Created ${steps.length} steps. Will execute first step in next iteration.`);
        // Don't execute this iteration - let next iteration pick up the first step
        return;
      }
    }
  }

  // Check retry state
  const retryKey = isStepExecution && currentStep 
    ? `${workItem.title}::step${currentStep.step_number}` 
    : workItem.title;
  const retryState = retryTracker.get(retryKey);
  if (retryState) {
    log(`  Previous attempts: ${retryState.attempts}/${MAX_RETRIES}`);
  }

  // Step 4: Execute work (step or full task)
  const result = await executeWork(workItem, currentStep);

  // Step 5: Validate work
  const validationSuccess = await validateWork(workItem, result);

  // Step 6: Update state with error info and output path
  const errorInfo = result?.errors?.join('; ') || (result?.success === false ? 'Worker reported failure' : undefined);
  const outputPath = result?.output_path;
  await updateStateWithStep(workItem, currentStep, validationSuccess, errorInfo, outputPath, result);

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
