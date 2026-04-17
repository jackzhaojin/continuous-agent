/**
 * Harness executor — bridge from the executive loop's Phase 4 dispatch into
 * the unified HarnessOrchestrator abstraction.
 *
 * Responsibilities:
 *   1. Resolve the harness from the registry by workItem.harness.
 *   2. Resolve the vendor provider (per-goal override → global default).
 *   3. Resolve the harness target directory (workItem.harness_target or
 *      ai-sandbox/harnesses/<name>/<slug>/ default).
 *   4. Pre-seed STEPS.json with the harness's static phase list on first run
 *      (no-op on resume — respects existing step rows).
 *   5. Run the harness generator, re-emit agent_message events to the worker
 *      transcript logger, and route phase_* / subtask_created / retry_scheduled
 *      through a StepSink into STEPS.json.
 *   6. Return a normal WorkerResult that the executive loop's Phase 5
 *      validator can consume just like any other worker run.
 *
 * Invariant: a harness run = one worker execution from the executive's
 * perspective. Internal harness retries (e.g., 3 build attempts) are NOT
 * counted against the executive's 3-failure threshold.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import type { WorkItem, WorkerResult, WorkStep } from '../../core/types.js';
import { log } from '../../core/logging.js';
import { getHarness } from '../../harnesses/core/harness-registry.js';
import type {
  HarnessEvent,
  HarnessMode,
  HarnessModeType,
  HarnessRunConfig,
} from '../../harnesses/core/types.js';
import { seedStepsFromPhases, makeStepSink } from '../../harnesses/core/status-mirror.js';
import { getAgentWorkerProviderForVendor } from '../../core/vendor/vendor-registry.js';
import { resolveBuildTarget } from '../../deterministic/build-target-resolver.js';

const AGENT_OUTPUTS_BASE =
  process.env.AGENT_OUTPUTS_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox');

/**
 * Compute the legacy monorepo path the harness used pre-v2.3:
 * `ai-sandbox/harnesses/<name>/<slug>/`.
 *
 * Used as the fallback when build_target='monorepo' (or default during
 * v2.3 transition). Honors the legacy `harness_target` override.
 */
function legacyHarnessMonorepoPath(workItem: WorkItem): string {
  if (workItem.harness_target) {
    return path.isAbsolute(workItem.harness_target)
      ? workItem.harness_target
      : path.resolve(AGENT_OUTPUTS_BASE, workItem.harness_target);
  }
  const slug = (workItem.source_path && path.basename(workItem.source_path)) || workItem.id;
  return path.join(AGENT_OUTPUTS_BASE, 'harnesses', workItem.harness ?? 'generic', slug);
}

/**
 * v2.3: Unified build-target resolution for harness runs. Reads the same
 * PROMPT.md frontmatter fields the worker-spawner reads (build_target,
 * target_dir, target_branch). Falls back to the legacy monorepo path when
 * build_target is unset / 'monorepo'.
 */
function resolveHarnessTarget(workItem: WorkItem): {
  targetDir: string;
  warnings: string[];
} {
  const slug =
    (workItem.source_path && path.basename(workItem.source_path)) || workItem.id;
  const resolution = resolveBuildTarget({
    slug,
    build_target: workItem.build_target,
    target_dir: workItem.target_dir,
    target_branch: workItem.target_branch,
    existingOutputPath: workItem.output_path,
    resolveMonorepoPath: () => legacyHarnessMonorepoPath(workItem),
  });
  return { targetDir: resolution.outputPath, warnings: resolution.warnings };
}

export async function executeHarness(
  workItem: WorkItem,
  _currentStep: WorkStep | undefined,
  contractId: string,
): Promise<WorkerResult> {
  const startedAt = Date.now();
  const harnessName = workItem.harness;
  if (!harnessName) {
    return failFast('harness execution requested but workItem.harness is unset', startedAt);
  }

  let harness;
  try {
    harness = getHarness(harnessName);
  } catch (err) {
    return failFast(`unknown harness '${harnessName}': ${(err as Error).message}`, startedAt);
  }

  const { targetDir, warnings } = resolveHarnessTarget(workItem);
  for (const w of warnings) log(w);
  // Existing-target safeguard: refuse to mkdir into a path the user expects
  // to already exist. The resolver throws if target_dir is missing for
  // build_target='existing', so reaching here means it's present.
  if (workItem.build_target !== 'existing') {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Locate PROMPT.md for the harness. Prefer the goal bundle's PROMPT.md
  // (source_path) — that's what the user authored.
  const promptFile = workItem.source_path
    ? path.join(workItem.source_path, 'PROMPT.md')
    : '';
  if (!promptFile || !fs.existsSync(promptFile)) {
    return failFast(
      `harness requires a PROMPT.md at ${promptFile || '(no source_path)'}`,
      startedAt,
    );
  }

  log(`[harness-executor] ${harnessName} target=${targetDir} vendor=${workItem.worker_vendor ?? 'default'}`);

  // Pre-seed STEPS.json if the goal bundle doesn't already have harness phase rows.
  if (workItem.source_path) {
    try {
      await seedStepsFromPhases(workItem.source_path, harness.phaseList);
    } catch (err) {
      log(`[harness-executor] seed STEPS.json failed: ${err}`);
    }
  }

  const provider = getAgentWorkerProviderForVendor(workItem.worker_vendor);
  const auth = provider.validateAuth();
  if (!auth.valid) {
    return failFast(`vendor auth invalid: ${auth.error ?? 'unknown'}`, startedAt);
  }

  const detectedMode = await harness.detectMode(targetDir, promptFile);
  const mode: HarnessMode = workItem.harness_mode
    ? { type: workItem.harness_mode as HarnessModeType, reason: 'workItem.harness_mode override' }
    : detectedMode;

  const stepSink = workItem.source_path
    ? makeStepSink({ bundlePath: workItem.source_path, contractId })
    : undefined;

  const runConfig: HarnessRunConfig = {
    promptFile,
    targetDir,
    mode,
    provider,
    vendor: workItem.worker_vendor ?? 'claude',
    modelOverrides: workItem.model_overrides ?? {},
    maxTurnsPerAgent: workItem.max_turns,
    stepSink,
  };

  const transcript: string[] = [];
  const errors: string[] = [];
  let success = false;

  try {
    for await (const evt of harness.run(runConfig)) {
      await handleEvent(evt, transcript, errors, stepSink);
      if (evt.type === 'run_complete') success = evt.success;
      if (evt.type === 'run_failed') success = false;
    }
  } catch (err) {
    errors.push(`harness generator threw: ${(err as Error).message}`);
    success = false;
  }

  return {
    success,
    output: transcript.join('\n'),
    artifacts: [],
    errors,
    duration_ms: Date.now() - startedAt,
    output_path: targetDir,
    exit_code: success ? 0 : 1,
  };
}

async function handleEvent(
  evt: HarnessEvent,
  transcript: string[],
  errors: string[],
  stepSink: ReturnType<typeof makeStepSink> | undefined,
): Promise<void> {
  switch (evt.type) {
    case 'run_start':
      transcript.push(`[harness] run_start ${evt.harness} mode=${evt.mode}`);
      break;
    case 'phase_start':
      transcript.push(`[harness] phase_start ${evt.phase}`);
      if (stepSink) await stepSink.onPhaseStart(evt.phase);
      break;
    case 'phase_complete':
      transcript.push(`[harness] phase_complete ${evt.phase} success=${evt.success}`);
      if (stepSink) await stepSink.onPhaseComplete(evt.phase, evt.success);
      break;
    case 'agent_start':
      transcript.push(`[agent_start ${evt.agent} ${evt.vendor}/${evt.model}]`);
      break;
    case 'agent_message':
      if (evt.text) transcript.push(evt.text);
      break;
    case 'agent_complete':
      transcript.push(`[agent_complete ${evt.agent} success=${evt.success} ${evt.duration_ms}ms]`);
      if (!evt.success && evt.errors) errors.push(...evt.errors);
      break;
    case 'subtask_created':
      transcript.push(`[subtask_created ${evt.subtask_id} parent=${evt.parent}]`);
      if (stepSink) {
        await stepSink.onSubtaskCreated({
          id: evt.subtask_id,
          title: evt.reason,
          parent: evt.parent,
        });
      }
      break;
    case 'retry_scheduled':
      transcript.push(`[retry_scheduled ${evt.agent} ${evt.attempt}/${evt.max}]`);
      if (stepSink) await stepSink.onRetry(evt.agent, evt.attempt, evt.max, evt.reason);
      break;
    case 'run_complete':
      transcript.push(`[harness] run_complete success=${evt.success}`);
      if (evt.errors) errors.push(...evt.errors);
      break;
    case 'run_failed':
      transcript.push(`[harness] run_failed: ${evt.error}`);
      errors.push(evt.error);
      break;
    case 'status_written':
      // quiet
      break;
  }
}

function failFast(error: string, startedAt: number): WorkerResult {
  log(`[harness-executor] ${error}`);
  return {
    success: false,
    output: '',
    artifacts: [],
    errors: [error],
    duration_ms: Date.now() - startedAt,
    output_path: undefined,
    exit_code: 1,
  };
}
