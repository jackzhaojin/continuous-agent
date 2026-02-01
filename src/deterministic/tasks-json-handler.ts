/**
 * TASKS.json Handler - DETERMINISTIC
 *
 * All read/write/update logic for TASKS.json files inside goal bundles.
 * TASKS.json is the machine-readable source of truth for step tracking,
 * replacing the fragile regex-based ## Steps parsing from PROMPT.md.
 *
 * Writes are atomic (temp file + rename) to prevent data loss.
 */

import { readFile, writeFile, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { StepsFile, WorkStep } from '../core/types.js';
import { log } from '../core/logging.js';
import { appendProgressEntry } from './progress-log-writer.js';

const TASKS_FILENAME = 'TASKS.json';

/**
 * Read TASKS.json from a goal bundle directory.
 * Returns null if the file doesn't exist or is malformed.
 */
export async function readTasksJson(bundlePath: string): Promise<StepsFile | null> {
  const filePath = path.join(bundlePath, TASKS_FILENAME);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as StepsFile;

    // Basic validation
    if (!parsed.version || !Array.isArray(parsed.steps)) {
      log(`  Warning: Malformed TASKS.json at ${filePath}`);
      return null;
    }

    return parsed;
  } catch (error) {
    log(`  Error reading TASKS.json at ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Write TASKS.json to a goal bundle directory.
 * Uses atomic write (temp file + rename) to prevent partial writes.
 * Bumps the revision counter on every write.
 */
export async function writeTasksJson(bundlePath: string, tasksFile: StepsFile): Promise<boolean> {
  const filePath = path.join(bundlePath, TASKS_FILENAME);
  const tmpPath = filePath + '.tmp';

  try {
    // Bump revision
    tasksFile.revision = (tasksFile.revision || 0) + 1;

    const content = JSON.stringify(tasksFile, null, 2) + '\n';

    // Atomic write: write to temp, then rename
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, filePath);

    log(`  Wrote TASKS.json (rev ${tasksFile.revision}, ${tasksFile.steps.length} steps) to ${bundlePath}`);
    return true;
  } catch (error) {
    log(`  Error writing TASKS.json at ${filePath}: ${error}`);
    // Clean up temp file if rename failed
    try {
      if (existsSync(tmpPath)) {
        const { unlink } = await import('fs/promises');
        await unlink(tmpPath);
      }
    } catch { /* ignore cleanup errors */ }
    return false;
  }
}

/**
 * Check if a TASKS.json file exists in the bundle directory.
 */
export function tasksJsonExists(bundlePath: string): boolean {
  return existsSync(path.join(bundlePath, TASKS_FILENAME));
}

/**
 * Update a single step's status in TASKS.json.
 * Reads, modifies, and atomically writes back.
 */
export async function updateStepStatus(
  bundlePath: string,
  stepId: string,
  newStatus: WorkStep['status'],
  extras?: Partial<Pick<WorkStep, 'started_at' | 'completed_at' | 'completed_by_contract'>>
): Promise<boolean> {
  const tasksFile = await readTasksJson(bundlePath);
  if (!tasksFile) {
    log(`  Cannot update step ${stepId}: no TASKS.json at ${bundlePath}`);
    return false;
  }

  const step = tasksFile.steps.find(s => s.id === stepId);
  if (!step) {
    log(`  Cannot update step ${stepId}: not found in TASKS.json`);
    return false;
  }

  step.status = newStatus;
  if (extras?.started_at) step.started_at = extras.started_at;
  if (extras?.completed_at) step.completed_at = extras.completed_at;
  if (extras?.completed_by_contract) step.completed_by_contract = extras.completed_by_contract;

  return writeTasksJson(bundlePath, tasksFile);
}

/**
 * Increment the retry_count for a step in TASKS.json.
 * Used to persist retry attempts across PM2 restarts.
 */
export async function incrementStepRetryCount(
  bundlePath: string,
  targetStepId: string
): Promise<number> {
  const tasksFile = await readTasksJson(bundlePath);
  if (!tasksFile) {
    log(`  Cannot increment retry_count for ${targetStepId}: no TASKS.json at ${bundlePath}`);
    return 0;
  }

  const step = tasksFile.steps.find(s => s.id === targetStepId);
  if (!step) {
    log(`  Cannot increment retry_count for ${targetStepId}: not found in TASKS.json`);
    return 0;
  }

  step.retry_count = (step.retry_count || 0) + 1;
  await writeTasksJson(bundlePath, tasksFile);

  return step.retry_count;
}

/**
 * Read the retry_count for a step from TASKS.json.
 * Returns 0 if not found or not set.
 */
export async function readStepRetryCount(
  bundlePath: string,
  targetStepId: string
): Promise<number> {
  const tasksFile = await readTasksJson(bundlePath);
  if (!tasksFile) return 0;

  const step = tasksFile.steps.find(s => s.id === targetStepId);
  return step?.retry_count || 0;
}

/**
 * Convert runtime WorkStep[] to STEPS.json on-disk shape.
 * Adds `id` and `order` fields, converts numeric dependencies to string IDs.
 */
export function workStepsToStepsJson(workSteps: WorkStep[]): WorkStep[] {
  return workSteps.map((ws) => ({
    ...ws,
    id: `step-${ws.step_number}`,
    order: ws.step_number,
    description: ws.description || '',
    status: ws.status === 'in_progress' ? 'in_progress' : ws.status,
    estimated_turns: ws.estimated_turns || 100,
  }));
}

/**
 * Convert STEPS.json on-disk shape to runtime WorkStep[].
 * Populates `step_number` from `order`, resolves string dependency IDs to numbers.
 */
export function stepsJsonToWorkSteps(diskSteps: WorkStep[]): WorkStep[] {
  return diskSteps.map((ts) => ({
    step_number: ts.order ?? ts.step_number,
    title: ts.title,
    description: ts.description,
    status: ts.status,
    dependencies: Array.isArray(ts.dependencies)
      ? ts.dependencies.map(dep => {
          if (typeof dep === 'number') return dep;
          // Handle string deps like "step-0" from legacy TASKS.json files
          const match = String(dep).match(/^step-(\d+)$/);
          return match ? parseInt(match[1], 10) : -1;
        }).filter(n => n >= 0)
      : [],
    estimated_turns: ts.estimated_turns,
    started_at: ts.started_at,
    completed_at: ts.completed_at,
    completed_by_contract: ts.completed_by_contract,
    re_breakdown_count: ts.re_breakdown_count,
    retry_count: ts.retry_count,
    id: ts.id,
    order: ts.order,
  }));
}

/**
 * Create a fresh StepsFile from WorkStep[].
 */
export function createStepsFile(
  workSteps: WorkStep[],
  trigger: StepsFile['trigger'] = 'auto'
): StepsFile {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    trigger,
    revision: 0,
    steps: workStepsToStepsJson(workSteps),
  };
}

/**
 * Get the step ID string for a given step number (0-based).
 */
export function stepId(stepNumber: number): string {
  return `step-${stepNumber}`;
}

/**
 * One-time migration: parse ## Steps from PROMPT.md body, write TASKS.json,
 * strip ## Steps section from PROMPT.md, and append migration event to PROGRESS_LOG.md.
 *
 * Returns the migrated WorkStep[] or null if migration was not needed/possible.
 */
export async function migrateFromPromptMd(
  bundlePath: string,
  body: string,
  parseStepsFromBody: (body: string) => WorkStep[]
): Promise<WorkStep[] | null> {
  // Don't migrate if TASKS.json already exists
  if (tasksJsonExists(bundlePath)) {
    return null;
  }

  const steps = parseStepsFromBody(body);
  if (steps.length === 0) {
    return null;
  }

  log(`  Migrating ${steps.length} steps from PROMPT.md to TASKS.json at ${bundlePath}`);

  // Write TASKS.json
  const tasksFile = createStepsFile(steps, 'auto');
  const written = await writeTasksJson(bundlePath, tasksFile);
  if (!written) {
    log(`  Migration failed: could not write TASKS.json`);
    return null;
  }

  // Strip ## Steps section from PROMPT.md
  const promptPath = path.join(bundlePath, 'PROMPT.md');
  if (existsSync(promptPath)) {
    try {
      const content = await readFile(promptPath, 'utf-8');
      const stripped = stripStepsSection(content);
      if (stripped !== content) {
        await writeFile(promptPath, stripped, 'utf-8');
        log(`  Stripped ## Steps section from PROMPT.md`);
      }
    } catch (error) {
      log(`  Warning: Could not strip ## Steps from PROMPT.md: ${error}`);
    }
  }

  // Append migration event to PROGRESS_LOG.md
  await appendProgressEntry(bundlePath, {
    eventType: 'Breakdown',
    details: `Migrated ${steps.length} steps from PROMPT.md to TASKS.json (one-time migration)`,
  });

  return steps;
}

/**
 * Strip the ## Steps section (and everything in it) from PROMPT.md content.
 * Returns the modified content string.
 */
function stripStepsSection(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inStepsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^##\s+Steps$/i)) {
      inStepsSection = true;
      continue;
    }

    // Exit Steps section on next ## heading (but not ### or ####)
    if (inStepsSection && trimmed.match(/^##\s+[^#]/)) {
      inStepsSection = false;
      result.push(line);
      continue;
    }

    if (!inStepsSection) {
      result.push(line);
    }
  }

  // Trim trailing blank lines that might remain after stripping
  let text = result.join('\n');
  text = text.replace(/\n{3,}$/, '\n');
  return text;
}
