/**
 * Generic harness — P1 stub.
 *
 * In P1/P2 this delegates to the shellout-runner, which spawns the existing
 * JS harness at generic-harness-v2026-01-v2/. In P3 it will be replaced by
 * a native TypeScript orchestrator under this directory that calls
 * runHarnessAgent() directly and supports all three vendors.
 */

import type {
  HarnessEvent,
  HarnessMode,
  HarnessOrchestrator,
  HarnessRunConfig,
  HarnessState,
} from '../core/types.js';
import {
  detectModeViaShellout,
  getStateViaShellout,
  runShellOutHarness,
} from '../shellout-runner.js';

// P1/P2: phase names mirror what shellout-runner's normalizeGenericPhase emits
// from PROGRESS_LOG.md `Phase: …` markers in the JS harness. The full per-agent
// spec breakdown (WHY/WHAT/HOW/WHEN) collapses into a single SPEC row here
// because the JS orchestrator logs them as sub-agents, not as top-level phases.
// P3 native port will surface finer granularity.
const PHASE_LIST = ['SPEC', 'RESEARCH', 'BUILD', 'VALIDATE', 'COMPLETE'] as const;

export class GenericHarness implements HarnessOrchestrator {
  readonly name = 'generic';
  readonly phaseList = PHASE_LIST;

  detectMode(targetDir: string, promptFile: string): Promise<HarnessMode> {
    return detectModeViaShellout('generic', targetDir, promptFile);
  }

  run(config: HarnessRunConfig): AsyncIterable<HarnessEvent> {
    return runShellOutHarness('generic', config);
  }

  getState(targetDir: string): Promise<HarnessState> {
    return getStateViaShellout('generic', targetDir);
  }
}
