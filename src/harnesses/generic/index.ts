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

const PHASE_LIST = [
  'SPEC_WHY',
  'SPEC_WHAT',
  'SPEC_HOW',
  'SPEC_WHEN',
  'TASK_RESEARCH',
  'TASK_BUILD',
  'TASK_VALIDATE',
] as const;

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
