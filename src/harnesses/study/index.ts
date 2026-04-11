/**
 * Study harness — native TypeScript orchestrator (P5).
 *
 * Runs a 7-phase study-material pipeline (DECOMPOSE → RESEARCH → SYNTHESIZE →
 * CONTENT → TTS → DEPOSIT → VALIDATE) via a coordinator agent that uses
 * Claude's native Task/Skill tools to spawn specialists. Vendor parity is
 * **Claude-only** in P5; Codex/Kimi support is deferred to v2.3 (requires
 * `__spawn__` JSON emulation + stream interception).
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
import { runStudyOrchestrator } from './orchestrator.js';
import { PHASES, type StudyState } from './state-store.js';

const PHASE_LIST = [...PHASES] as const;

export class StudyHarness implements HarnessOrchestrator {
  readonly name = 'study';
  readonly phaseList = PHASE_LIST;

  async detectMode(targetDir: string, _promptFile: string): Promise<HarnessMode> {
    const statusPath = join(targetDir, 'ai-docs', 'STATUS.json');
    if (!existsSync(statusPath)) {
      return { type: 'bootstrap', reason: 'no ai-docs/STATUS.json — fresh study run' };
    }
    try {
      const raw = await readFile(statusPath, 'utf-8');
      const state = JSON.parse(raw) as Partial<StudyState>;
      if (state.pipeline === 'COMPLETE') {
        return { type: 'extend', reason: 'STATUS.json pipeline=COMPLETE — would re-extend' };
      }
      if (state.pipeline === 'RUNNING') {
        return { type: 'resume', reason: 'STATUS.json pipeline=RUNNING — resuming' };
      }
      return { type: 'resume', reason: `STATUS.json pipeline=${state.pipeline ?? 'unknown'}` };
    } catch {
      return { type: 'bootstrap', reason: 'STATUS.json unreadable — restarting' };
    }
  }

  run(config: HarnessRunConfig): AsyncIterable<HarnessEvent> {
    return runStudyOrchestrator(config);
  }

  async getState(targetDir: string): Promise<HarnessState> {
    const statusPath = join(targetDir, 'ai-docs', 'STATUS.json');
    let phases: HarnessStatePhase[] = PHASE_LIST.map((name) => ({
      name,
      status: 'pending' as const,
      attempts: 0,
    }));
    let mode: HarnessState['mode'] = 'bootstrap';

    if (existsSync(statusPath)) {
      try {
        const raw = await readFile(statusPath, 'utf-8');
        const state = JSON.parse(raw) as Partial<StudyState>;
        if (state.pipeline === 'COMPLETE') mode = 'extend';
        else if (state.pipeline === 'RUNNING') mode = 'resume';
        phases = PHASE_LIST.map((name) => {
          const ps = state.phases?.[name];
          return {
            name,
            status: mapStatus(ps?.status),
            attempts: ps?.attempts ?? 0,
          };
        });
      } catch {}
    }

    return {
      mode,
      phases,
      tasks: [],
      statusJsonPath: statusPath,
    };
  }
}

function mapStatus(s: string | undefined): HarnessStatePhase['status'] {
  if (s === 'complete') return 'complete';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'failed') return 'failed';
  return 'pending';
}
