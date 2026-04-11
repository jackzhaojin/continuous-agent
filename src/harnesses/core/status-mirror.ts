/**
 * Status mirror — one-way sync from harness HarnessEvent stream into a goal
 * bundle's STEPS.json file.
 *
 * Executive mode owns the bundle STEPS.json as source of truth for the goal.
 * The harness's own STATUS.json / TASKS.json remain source of truth for the
 * harness's runtime and for standalone mode. Never write from the executive
 * side into the harness's STATUS.json.
 */

import type { StepsFile, WorkStep } from '../../core/types.js';
import type { StepSink } from './types.js';
import { readStepsJson, writeStepsJson, updateStepStatus } from '../../deterministic/steps-json-handler.js';

export interface HarnessStepSinkOptions {
  /** Absolute path to the goal bundle directory containing STEPS.json. */
  bundlePath: string;
  /** Contract id, recorded into step metadata on completion. */
  contractId?: string;
}

/** Pre-seed STEPS.json from a harness's static phase list. Idempotent on resume. */
export async function seedStepsFromPhases(
  bundlePath: string,
  phaseList: readonly string[],
): Promise<void> {
  const existing = await readStepsJson(bundlePath);
  // Only seed if empty or if the existing steps aren't harness phases.
  if (existing && existing.steps.length > 0 && existing.steps.some((s) => s.id?.startsWith('harness-phase-'))) {
    return;
  }
  const now = new Date().toISOString();
  const seed: StepsFile = {
    version: 1,
    created_at: now,
    trigger: 'auto',
    revision: 0,
    steps: phaseList.map((name, idx) => ({
      step_number: idx,
      order: idx,
      id: `harness-phase-${idx}`,
      title: name,
      description: `Harness phase: ${name}`,
      status: 'pending' as WorkStep['status'],
      estimated_turns: 100,
      retry_count: 0,
    })),
  };
  await writeStepsJson(bundlePath, seed);
}

/**
 * Build a StepSink that mirrors events into STEPS.json at bundlePath.
 */
export function makeStepSink(options: HarnessStepSinkOptions): StepSink {
  const { bundlePath, contractId } = options;

  const findStepIdByPhase = async (phase: string): Promise<string | null> => {
    const file = await readStepsJson(bundlePath);
    if (!file) return null;
    const step = file.steps.find((s) => s.title === phase && s.id?.startsWith('harness-phase-'));
    return step?.id ?? null;
  };

  return {
    async onPhaseStart(phase: string): Promise<void> {
      const id = await findStepIdByPhase(phase);
      if (!id) return;
      await updateStepStatus(bundlePath, id, 'in_progress', {
        started_at: new Date().toISOString(),
      });
    },
    async onPhaseComplete(phase: string, ok: boolean): Promise<void> {
      const id = await findStepIdByPhase(phase);
      if (!id) return;
      await updateStepStatus(bundlePath, id, ok ? 'complete' : 'blocked', {
        completed_at: new Date().toISOString(),
        completed_by_contract: contractId,
        build_health: ok ? 'pass' : 'fail',
      });
    },
    async onSubtaskCreated(subtask): Promise<void> {
      // Append a new step row linked to the parent phase step.
      const file = await readStepsJson(bundlePath);
      if (!file) return;
      const nextOrder = file.steps.length;
      file.steps.push({
        step_number: nextOrder,
        order: nextOrder,
        id: `harness-subtask-${subtask.id}`,
        title: subtask.title,
        description: `Harness subtask spawned under ${subtask.parent}`,
        status: 'pending',
        estimated_turns: 50,
        retry_count: 0,
      });
      await writeStepsJson(bundlePath, file);
    },
    async onRetry(phase, attempt, _max, _reason): Promise<void> {
      const file = await readStepsJson(bundlePath);
      if (!file) return;
      const step = file.steps.find((s) => s.title === phase && s.id?.startsWith('harness-phase-'));
      if (!step) return;
      step.retry_count = attempt;
      await writeStepsJson(bundlePath, file);
    },
  };
}

