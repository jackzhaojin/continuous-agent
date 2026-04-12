/**
 * EDS harness — native TypeScript orchestrator (P4).
 *
 * Delegates to runEdsOrchestrator() under ./orchestrator.ts. Builds AEM Edge
 * Delivery Services (EDS) blocks and pushes to da.live-compatible branches.
 * Vendor-agnostic via AgentWorkerProvider (Claude / Codex / Kimi).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type {
  HarnessEvent,
  HarnessMode,
  HarnessOrchestrator,
  HarnessRunConfig,
  HarnessState,
  HarnessStatePhase,
} from '../core/types.js';
import { runEdsOrchestrator } from './orchestrator.js';
import { detectHarnessMode } from './mode-detector.js';
import type { GenericHarnessState } from '../generic/state-store.js';

const PHASE_LIST = ['SPEC', 'RESEARCH', 'BUILD', 'VALIDATE', 'COMPLETE'] as const;

export class EdsHarness implements HarnessOrchestrator {
  readonly name = 'eds';
  readonly phaseList = PHASE_LIST;

  detectMode(targetDir: string, promptFile: string): Promise<HarnessMode> {
    return detectHarnessMode(targetDir, promptFile);
  }

  run(config: HarnessRunConfig): AsyncIterable<HarnessEvent> {
    return runEdsOrchestrator(config);
  }

  async getState(targetDir: string): Promise<HarnessState> {
    const statusPath = join(targetDir, 'ai-docs', 'SPEC', 'STATUS.json');
    const tasksPath = join(targetDir, 'ai-docs', 'SPEC', 'TASKS.json');

    let phases: HarnessStatePhase[] = PHASE_LIST.map((name) => ({
      name,
      status: 'pending' as const,
      attempts: 0,
    }));
    let tasks: HarnessState['tasks'] = [];
    let mode: HarnessState['mode'] = 'bootstrap';

    if (existsSync(statusPath)) {
      try {
        const raw = await readFile(statusPath, 'utf-8');
        const state = JSON.parse(raw) as Partial<GenericHarnessState>;
        if (state.mode) mode = (state.mode as HarnessState['mode']) || 'bootstrap';
        const statePhase = state.phase || 'INIT';
        phases = PHASE_LIST.map((name) => ({
          name,
          status: derivePhaseStatus(name, statePhase),
          attempts: 0,
        }));
        tasks = (state.tasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          attempts: 0,
        }));
      } catch {}
    }

    return {
      mode,
      phases,
      tasks,
      statusJsonPath: statusPath,
      tasksJsonPath: tasksPath,
    };
  }
}

function derivePhaseStatus(
  phase: (typeof PHASE_LIST)[number],
  statePhase: string,
): HarnessStatePhase['status'] {
  if (statePhase === 'COMPLETE') return 'complete';
  if (statePhase === 'EXECUTING') {
    if (phase === 'SPEC') return 'complete';
    if (phase === 'COMPLETE') return 'pending';
    return 'in_progress';
  }
  return 'pending';
}
