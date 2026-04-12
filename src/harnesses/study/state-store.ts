/**
 * Study harness state store — ported from
 * study-harness-v2026-03-v1/src/state/store.js.
 *
 * Unlike generic/eds (which use ai-docs/SPEC/STATUS.json with a phase cursor),
 * the study harness tracks per-phase objects under ai-docs/STATUS.json and
 * drives a 7-phase pipeline: DECOMPOSE → RESEARCH → SYNTHESIZE → CONTENT →
 * TTS → DEPOSIT → VALIDATE. Schema version 1.1.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const PHASES = [
  'DECOMPOSE',
  'RESEARCH',
  'SYNTHESIZE',
  'CONTENT',
  'TTS',
  'DEPOSIT',
  'VALIDATE',
] as const;

export const POST_PHASES = ['ENHANCE'] as const;

export type StudyPhase = (typeof PHASES)[number];
export type StudyPhaseStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export interface StudyPhaseState {
  status: StudyPhaseStatus;
  attempts: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  progress: { current: number; total: number; percent: number; currentItem: string | null } | null;
  metrics: Record<string, unknown> | null;
}

export interface StudyState {
  version: string;
  pipeline: 'INIT' | 'RUNNING' | 'COMPLETE' | 'FAILED' | string;
  currentPhase: string | null;
  currentActivity: string | null;
  regenFrom: string | null;
  phases: Record<string, StudyPhaseState>;
  topicCount: number;
  startedAt: string | null;
  updatedAt: string | null;
}

const DEFAULT_PHASE_STATE: StudyPhaseState = {
  status: 'pending',
  attempts: 0,
  error: null,
  startedAt: null,
  completedAt: null,
  durationSeconds: null,
  progress: null,
  metrics: null,
};

function buildPhaseMap(): Record<string, StudyPhaseState> {
  const phases: Record<string, StudyPhaseState> = {};
  for (const phase of PHASES) {
    phases[phase] = { ...DEFAULT_PHASE_STATE };
  }
  return phases;
}

export function initialState(): StudyState {
  return {
    version: '1.1',
    pipeline: 'INIT',
    currentPhase: null,
    currentActivity: null,
    regenFrom: null,
    phases: buildPhaseMap(),
    topicCount: 0,
    startedAt: null,
    updatedAt: null,
  };
}

export async function loadState(targetDir: string): Promise<StudyState> {
  const statusFile = join(targetDir, 'ai-docs', 'STATUS.json');
  try {
    const data = await readFile(statusFile, 'utf-8');
    const loaded = JSON.parse(data) as Partial<StudyState>;
    const state: StudyState = { ...initialState(), ...loaded };
    for (const phase of PHASES) {
      state.phases[phase] = { ...DEFAULT_PHASE_STATE, ...(state.phases[phase] || {}) };
    }
    return state;
  } catch {
    return initialState();
  }
}

export async function saveState(targetDir: string, state: StudyState): Promise<void> {
  const aiDocsDir = join(targetDir, 'ai-docs');
  await mkdir(aiDocsDir, { recursive: true });
  state.version = '1.1';
  state.updatedAt = new Date().toISOString();
  const statusFile = join(aiDocsDir, 'STATUS.json');
  const tmpFile = statusFile + '.tmp';
  await writeFile(tmpFile, JSON.stringify(state, null, 2));
  await rename(tmpFile, statusFile);
}

export async function appendProgress(targetDir: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  const aiDocsDir = join(targetDir, 'ai-docs');
  const logFile = join(aiDocsDir, 'PROGRESS_LOG.md');
  await mkdir(aiDocsDir, { recursive: true });
  try {
    const existing = await readFile(logFile, 'utf-8');
    await writeFile(logFile, existing + entry);
  } catch {
    await writeFile(logFile, `# Progress Log\n\n${entry}`);
  }
  // eslint-disable-next-line no-console
  console.log(entry.trim());
}
