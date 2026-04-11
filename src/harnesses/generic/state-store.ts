/**
 * STATUS.json / TASKS.json / PROGRESS_LOG.md helpers for the generic harness.
 *
 * Ported verbatim from generic-harness-v2026-01-v2/src/state/store.js with TS
 * types. Schemas are load-bearing — every existing harness-v2-test bundle on
 * disk depends on exactly these field names.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export type GenericPhase = 'INIT' | 'EXECUTING' | 'PAUSED' | 'COMPLETE';

export interface GenericTask {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  status: 'pending' | 'in_progress' | 'complete' | 'blocked' | 'needs_subtask';
  dependencies?: string[];
  parentId?: string | null;
  subtasks?: string[];
  blockReason?: string;
  requiredChecks?: { playwright?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResumeContextFile {
  path: string;
  content: string;
}

export interface GenericHarnessState {
  version: string;
  phase: GenericPhase;
  currentTaskId: string | null;
  tasks: GenericTask[];
  completedCount: number;
  failedCount: number;
  pauseReason: string | null;
  resumeContext: ResumeContextFile[];
  currentStateSummary: string;
  mode: string | null;
  scopeClassification: { level: string; rationale: string } | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface GenericTasksFile {
  version: string;
  tasks: GenericTask[];
}

export const INITIAL_STATE: GenericHarnessState = {
  version: '1.0',
  phase: 'INIT',
  currentTaskId: null,
  tasks: [],
  completedCount: 0,
  failedCount: 0,
  pauseReason: null,
  resumeContext: [],
  currentStateSummary: '',
  mode: null,
  scopeClassification: null,
  startedAt: null,
  updatedAt: null,
};

export async function loadState(docsDir: string): Promise<GenericHarnessState> {
  const statusFile = join(docsDir, 'SPEC', 'STATUS.json');
  try {
    const data = await readFile(statusFile, 'utf-8');
    return { ...INITIAL_STATE, ...(JSON.parse(data) as Partial<GenericHarnessState>) };
  } catch {
    return { ...INITIAL_STATE };
  }
}

export async function saveState(docsDir: string, state: GenericHarnessState): Promise<void> {
  const specDir = join(docsDir, 'SPEC');
  await mkdir(specDir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(join(specDir, 'STATUS.json'), JSON.stringify(state, null, 2));
}

export async function loadTasks(docsDir: string): Promise<GenericTasksFile> {
  const tasksFile = join(docsDir, 'SPEC', 'TASKS.json');
  try {
    const data = await readFile(tasksFile, 'utf-8');
    return JSON.parse(data) as GenericTasksFile;
  } catch {
    return { version: '1.0', tasks: [] };
  }
}

export async function saveTasks(docsDir: string, tasks: GenericTasksFile): Promise<void> {
  const specDir = join(docsDir, 'SPEC');
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, 'TASKS.json'), JSON.stringify(tasks, null, 2));
}

export async function appendProgress(docsDir: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  const specDir = join(docsDir, 'SPEC');
  const logFile = join(specDir, 'PROGRESS_LOG.md');
  await mkdir(specDir, { recursive: true });
  try {
    const existing = await readFile(logFile, 'utf-8');
    await writeFile(logFile, existing + entry);
  } catch {
    await writeFile(logFile, `# Progress Log\n\n${entry}`);
  }
  // eslint-disable-next-line no-console
  console.log(entry.trim());
}
