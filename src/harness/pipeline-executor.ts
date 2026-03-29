/**
 * Pipeline Executor — Deterministic Pipeline Execution Pattern
 *
 * Reads pipeline_steps from a playbook definition, spawns a worker per step,
 * and chains outputs from step N into the prompt for step N+1.
 *
 * This is the "harness absorption" — what was previously separate harness repos
 * is now this unified executor within the agent codebase.
 */

import { logDeterministic, log, logError } from '../core/logging.js';
import type { WorkItem, WorkerContract, WorkerResult } from '../core/types.js';
import type { PlaybookDefinition } from '../deterministic/library-loader-types.js';
import type { PipelineStep, StepResult, PipelineResult } from './pipeline-types.js';
import { parsePipelineSteps } from './pipeline-types.js';

/**
 * Function signature for spawning a worker.
 * Defaults to the real spawnWorker from worker-spawner but is injectable for testing.
 */
export type SpawnWorkerFn = (
  contract: WorkerContract,
  workItem?: WorkItem,
) => Promise<WorkerResult>;

/**
 * Options for pipeline execution.
 */
export interface PipelineExecutorOptions {
  /** Override the worker spawn function (useful for testing). */
  spawnWorkerFn?: SpawnWorkerFn;
  /** Default retries per step when the step doesn't specify one. */
  defaultRetries?: number;
  /** Callback fired when a ledger event should be recorded. */
  onLedgerEvent?: (event: PipelineLedgerEvent) => void;
}

/**
 * Ledger event emitted during pipeline execution.
 */
export interface PipelineLedgerEvent {
  event: 'PIPELINE_STARTED' | 'PIPELINE_STEP_STARTED' | 'PIPELINE_STEP_COMPLETED' | 'PIPELINE_STEP_FAILED' | 'PIPELINE_COMPLETED' | 'PIPELINE_FAILED';
  pipeline_name: string;
  step_name?: string;
  step_number?: number;
  success?: boolean;
  error?: string;
  duration_ms?: number;
  attempts?: number;
  timestamp: string;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Build a contract ID for a pipeline step.
 */
function makeStepContractId(pipelineName: string, stepNumber: number): string {
  return `contract-pipeline-${pipelineName}-step-${stepNumber}-${Date.now()}`;
}

/**
 * Build the worker prompt for a single pipeline step.
 *
 * Includes:
 *  - The playbook the step references (as context, not loaded — the worker's
 *    Skill tool can load it at runtime)
 *  - Output from the previous step (if any)
 *  - What this step should produce
 */
function buildStepPrompt(
  step: PipelineStep,
  pipelineName: string,
  workItem: WorkItem,
  previousStepOutput?: string,
): string {
  const sections: string[] = [];

  sections.push(`# Pipeline Step ${step.step}: ${step.name}`);
  sections.push(`**Pipeline:** ${pipelineName}`);
  sections.push(`**Playbook:** ${step.playbook}`);
  sections.push(`**Worker Type:** ${step.worker_type}`);
  sections.push(`**Expected Output:** ${step.output}`);
  sections.push('');

  // Goal context
  sections.push('## Goal Context');
  sections.push(`**Title:** ${workItem.title}`);
  if (workItem.description) {
    sections.push(`**Description:** ${workItem.description}`);
  }
  sections.push('');

  // Previous step output chaining
  if (previousStepOutput) {
    sections.push('## Previous Step Output');
    sections.push('The previous pipeline step produced the following output. Use it as input for your work:');
    sections.push('');
    sections.push('```');
    sections.push(previousStepOutput);
    sections.push('```');
    sections.push('');
  }

  // Instructions
  sections.push('## Instructions');
  sections.push(`Load and follow the playbook "${step.playbook}" using the Skill tool.`);
  sections.push(`Your job is to produce: **${step.output}**`);
  sections.push('');
  sections.push('When complete, provide a clear summary of what was produced and where it lives.');

  return sections.join('\n');
}

/**
 * Build a WorkerContract for a pipeline step.
 */
function buildStepContract(
  step: PipelineStep,
  pipelineName: string,
  workItem: WorkItem,
  previousStepOutput?: string,
): WorkerContract {
  const contractId = makeStepContractId(pipelineName, step.step);
  const prompt = buildStepPrompt(step, pipelineName, workItem, previousStepOutput);

  // Default tool sets by worker type
  const toolsByType: Record<string, string[]> = {
    research: ['Read', 'Glob', 'Grep', 'Bash', 'Skill'],
    build: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill'],
    validate: ['Read', 'Glob', 'Grep', 'Bash', 'Skill'],
  };

  const tools = toolsByType[step.worker_type] || toolsByType['build'];

  return {
    id: contractId,
    prompt,
    scope: {
      repos_allowed: ['*'],
      tools_allowed: tools,
    },
    definition_of_done: [`Produce: ${step.output}`],
    max_turns: workItem.max_turns || 200,
    risk_assessment: 'pipeline-step',
    required_skills: [step.playbook],
    logging_obligations: ['log step output'],
    created_at: now(),
  };
}

/**
 * Execute a single pipeline step with retries.
 */
async function executeStep(
  step: PipelineStep,
  pipelineName: string,
  workItem: WorkItem,
  previousStepOutput: string | undefined,
  spawnWorkerFn: SpawnWorkerFn,
  maxRetries: number,
  onLedgerEvent?: (event: PipelineLedgerEvent) => void,
): Promise<StepResult> {
  const stepStart = Date.now();
  let lastError: string | undefined;
  let attempts = 0;

  onLedgerEvent?.({
    event: 'PIPELINE_STEP_STARTED',
    pipeline_name: pipelineName,
    step_name: step.name,
    step_number: step.step,
    timestamp: now(),
  });

  logDeterministic(`[pipeline] Step ${step.step} "${step.name}" starting (max retries: ${maxRetries})`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;

    const contract = buildStepContract(step, pipelineName, workItem, previousStepOutput);
    logDeterministic(`[pipeline] Step ${step.step} "${step.name}" attempt ${attempts}/${maxRetries + 1} (contract: ${contract.id})`);

    try {
      const result = await spawnWorkerFn(contract, workItem);

      if (result.success) {
        const duration = Date.now() - stepStart;
        logDeterministic(`[pipeline] Step ${step.step} "${step.name}" succeeded in ${duration}ms (${attempts} attempt(s))`);

        onLedgerEvent?.({
          event: 'PIPELINE_STEP_COMPLETED',
          pipeline_name: pipelineName,
          step_name: step.name,
          step_number: step.step,
          success: true,
          duration_ms: duration,
          attempts,
          timestamp: now(),
        });

        return {
          name: step.name,
          step: step.step,
          success: true,
          output_path: result.output_path,
          output_text: result.output,
          duration_ms: duration,
          attempts,
        };
      }

      // Step failed — record error for retry context
      lastError = result.errors.join('; ') || 'Unknown error';
      logDeterministic(`[pipeline] Step ${step.step} "${step.name}" failed attempt ${attempts}: ${lastError}`);

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logError(`[pipeline] Step ${step.step} "${step.name}" threw on attempt ${attempts}`, err);
    }
  }

  // All retries exhausted
  const duration = Date.now() - stepStart;
  logDeterministic(`[pipeline] Step ${step.step} "${step.name}" FAILED after ${attempts} attempt(s)`);

  onLedgerEvent?.({
    event: 'PIPELINE_STEP_FAILED',
    pipeline_name: pipelineName,
    step_name: step.name,
    step_number: step.step,
    success: false,
    error: lastError,
    duration_ms: duration,
    attempts,
    timestamp: now(),
  });

  return {
    name: step.name,
    step: step.step,
    success: false,
    error: lastError,
    duration_ms: duration,
    attempts,
  };
}

/**
 * Execute a deterministic pipeline.
 *
 * This is the main entry point called from the executive loop when
 * `execution_pattern === 'deterministic-pipeline'`.
 *
 * @param workItem - The goal/work item being executed
 * @param playbookDef - The pipeline playbook definition (must have pipeline_steps)
 * @param options - Executor options (spawnWorkerFn override, default retries, ledger callback)
 * @returns PipelineResult with overall success and per-step results
 */
export async function executePipeline(
  workItem: WorkItem,
  playbookDef: PlaybookDefinition,
  options: PipelineExecutorOptions = {},
): Promise<PipelineResult> {
  const {
    spawnWorkerFn,
    defaultRetries = 2,
    onLedgerEvent,
  } = options;

  // We need a spawn function — fail early if not provided and we can't import the real one.
  // In production, the caller passes spawnWorker from worker-spawner.ts.
  if (!spawnWorkerFn) {
    throw new Error('executePipeline requires a spawnWorkerFn in options (pass spawnWorker from worker-spawner)');
  }

  const pipelineName = playbookDef.name;
  const pipelineStart = Date.now();

  log(`[pipeline] Starting pipeline "${pipelineName}" for goal "${workItem.title}"`);

  // Parse pipeline steps from the playbook
  const steps = parsePipelineSteps(playbookDef.pipeline_steps);

  if (steps.length === 0) {
    logError(`[pipeline] Playbook "${pipelineName}" has no valid pipeline_steps`);
    return {
      success: false,
      step_results: [],
      duration_ms: Date.now() - pipelineStart,
      pipeline_name: pipelineName,
    };
  }

  logDeterministic(`[pipeline] Parsed ${steps.length} step(s) for pipeline "${pipelineName}"`);

  onLedgerEvent?.({
    event: 'PIPELINE_STARTED',
    pipeline_name: pipelineName,
    timestamp: now(),
  });

  const stepResults: StepResult[] = [];
  let previousStepOutput: string | undefined;
  let allSucceeded = true;

  for (const step of steps) {
    // Determine retries: step-level override > default
    const maxRetries = step.retries ?? defaultRetries;

    const result = await executeStep(
      step,
      pipelineName,
      workItem,
      previousStepOutput,
      spawnWorkerFn,
      maxRetries,
      onLedgerEvent,
    );

    stepResults.push(result);

    if (!result.success) {
      allSucceeded = false;
      logError(`[pipeline] Pipeline "${pipelineName}" aborting at step ${step.step} "${step.name}"`);
      break; // Stop pipeline on first step failure
    }

    // Chain output: pass this step's textual output to the next step
    previousStepOutput = result.output_text;
  }

  const totalDuration = Date.now() - pipelineStart;

  const eventType = allSucceeded ? 'PIPELINE_COMPLETED' : 'PIPELINE_FAILED';
  onLedgerEvent?.({
    event: eventType,
    pipeline_name: pipelineName,
    success: allSucceeded,
    duration_ms: totalDuration,
    timestamp: now(),
  });

  log(`[pipeline] Pipeline "${pipelineName}" ${allSucceeded ? 'COMPLETED' : 'FAILED'} in ${totalDuration}ms`);

  // Use output_path from the last successful step
  const lastSuccess = [...stepResults].reverse().find(r => r.success);

  return {
    success: allSucceeded,
    step_results: stepResults,
    duration_ms: totalDuration,
    output_path: lastSuccess?.output_path,
    pipeline_name: pipelineName,
  };
}
