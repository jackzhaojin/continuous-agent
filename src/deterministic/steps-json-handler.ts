/**
 * STEPS.json Handler - DETERMINISTIC
 *
 * All read/write/update logic for STEPS.json files inside goal bundles.
 * STEPS.json is the machine-readable source of truth for step tracking,
 * replacing the fragile regex-based ## Steps parsing from PROMPT.md.
 *
 * Reads: STEPS.json first, falls back to TASKS.json for backward compat.
 * Writes: Always STEPS.json.
 *
 * Writes are atomic (temp file + rename) to prevent data loss.
 */

import { readFile, writeFile, rename, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { StepsFile, WorkStep, DefectEvidence, StructuredHandoff } from '../core/types.js';
import { log } from '../core/logging.js';
import { appendProgressEntry } from './progress-log-writer.js';

/**
 * v2.4 H4: hard cap on recursive defect filing. Defects can chain
 * (validator files a defect → subtask fails → another defect), and the
 * v2.1.6 run produced 8-level-deep chains consuming hours of effort.
 * Beyond this depth we escalate to needs-you.md instead of filing another
 * subtask. Override with `MAX_DEFECT_RECURSION_DEPTH` env.
 */
const DEFAULT_MAX_DEFECT_RECURSION_DEPTH = 2;
function getMaxDefectRecursionDepth(): number {
  const env = Number(process.env.MAX_DEFECT_RECURSION_DEPTH);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MAX_DEFECT_RECURSION_DEPTH;
}

const STEPS_FILENAME = 'STEPS.json';
const LEGACY_FILENAME = 'TASKS.json';

/**
 * Read STEPS.json from a goal bundle directory.
 * Falls back to TASKS.json for backward compatibility.
 * Returns null if neither file exists or is malformed.
 */
export async function readStepsJson(bundlePath: string): Promise<StepsFile | null> {
  // Try STEPS.json first
  let filePath = path.join(bundlePath, STEPS_FILENAME);

  // Fall back to TASKS.json for backward compat
  if (!existsSync(filePath)) {
    filePath = path.join(bundlePath, LEGACY_FILENAME);
  }

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
 * Write STEPS.json to a goal bundle directory.
 * Uses atomic write (temp file + rename) to prevent partial writes.
 * Bumps the revision counter on every write.
 */
export async function writeStepsJson(bundlePath: string, tasksFile: StepsFile): Promise<boolean> {
  const filePath = path.join(bundlePath, STEPS_FILENAME);
  const tmpPath = filePath + '.tmp';

  try {
    // Bump revision
    tasksFile.revision = (tasksFile.revision || 0) + 1;

    const content = JSON.stringify(tasksFile, null, 2) + '\n';

    // Atomic write: write to temp, then rename
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, filePath);

    log(`  Wrote STEPS.json (rev ${tasksFile.revision}, ${tasksFile.steps.length} steps) to ${bundlePath}`);
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
 * Check if a STEPS.json (or legacy TASKS.json) file exists in the bundle directory.
 */
export function stepsJsonExists(bundlePath: string): boolean {
  return existsSync(path.join(bundlePath, STEPS_FILENAME)) ||
         existsSync(path.join(bundlePath, LEGACY_FILENAME));
}

/**
 * Update a single step's status in STEPS.json.
 * Reads, modifies, and atomically writes back.
 */
export async function updateStepStatus(
  bundlePath: string,
  stepId: string,
  newStatus: WorkStep['status'],
  extras?: Partial<Pick<WorkStep, 'started_at' | 'completed_at' | 'completed_by_contract' | 'build_health' | 'build_error'>>
): Promise<boolean> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) {
    log(`  Cannot update step ${stepId}: no STEPS.json at ${bundlePath}`);
    return false;
  }

  const step = stepsFile.steps.find(s => s.id === stepId);
  if (!step) {
    log(`  Cannot update step ${stepId}: not found in STEPS.json`);
    return false;
  }

  step.status = newStatus;
  if (extras?.started_at) step.started_at = extras.started_at;
  if (extras?.completed_at) step.completed_at = extras.completed_at;
  if (extras?.completed_by_contract) step.completed_by_contract = extras.completed_by_contract;
  if (extras?.build_health) step.build_health = extras.build_health;
  if (extras?.build_error !== undefined) step.build_error = extras.build_error;

  return writeStepsJson(bundlePath, stepsFile);
}

/**
 * Increment the retry_count for a step in STEPS.json.
 * Used to persist retry attempts across PM2 restarts.
 */
export async function incrementStepRetryCount(
  bundlePath: string,
  targetStepId: string
): Promise<number> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) {
    log(`  Cannot increment retry_count for ${targetStepId}: no STEPS.json at ${bundlePath}`);
    return 0;
  }

  const step = stepsFile.steps.find(s => s.id === targetStepId);
  if (!step) {
    log(`  Cannot increment retry_count for ${targetStepId}: not found in STEPS.json`);
    return 0;
  }

  step.retry_count = (step.retry_count || 0) + 1;
  await writeStepsJson(bundlePath, stepsFile);

  return step.retry_count;
}

/**
 * Read the retry_count for a step from STEPS.json.
 * Returns 0 if not found or not set.
 */
export async function readStepRetryCount(
  bundlePath: string,
  targetStepId: string
): Promise<number> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) return 0;

  const step = stepsFile.steps.find(s => s.id === targetStepId);
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
    build_health: ts.build_health,
    build_error: ts.build_error,
    id: ts.id,
    order: ts.order,
    // v2.1.7 fields
    parent_id: ts.parent_id,
    subtask_of: ts.subtask_of,
    origin: ts.origin,
    kind: ts.kind,
    blocks_parent: ts.blocks_parent,
    blocked_on_subtask: ts.blocked_on_subtask,
    defect_evidence: ts.defect_evidence,
    handoff: ts.handoff,
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

// =====================================================================
// DEFECT SUBTASK + DEPTH-FIRST SELECTION (v2.1.7)
// =====================================================================

/**
 * Compute the next subtask ID for a given parent.
 * `step-5` → `step-5.1`; if `step-5.1` exists → `step-5.2`; etc.
 * `step-5.1` → `step-5.1.1`.
 *
 * Matches the harness scheme from `generic-harness-v2026-01-v2`.
 */
export function nextSubtaskId(parentId: string, existingIds: string[]): string {
  // Strip optional "step-" prefix to work on the numeric part
  const parentNumeric = parentId.replace(/^step-/, '');

  // Find direct children of this parent (not grandchildren)
  const childPattern = new RegExp(`^(?:step-)?${parentNumeric.replace(/\./g, '\\.')}\\.(\\d+)$`);
  let maxChild = 0;
  for (const id of existingIds) {
    const match = id.match(childPattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxChild) maxChild = n;
    }
  }
  return `step-${parentNumeric}.${maxChild + 1}`;
}

/**
 * File a defect subtask under a parent step.
 *
 * - Computes the next subtask ID (5 → 5.1 → 5.1.1)
 * - Appends it to STEPS.json with origin="validator_defect", blocks_parent=true
 * - Marks the parent as blocked_on_subtask so the depth-first selector will
 *   pick the subtask before any sibling of the parent.
 *
 * Does NOT set the parent's status — it remains pending/in_progress. The
 * caller (Phase 5b) should also roll back the parent from `complete` to
 * `in_progress` if the defect was filed after the parent had been marked done.
 */
export async function insertDefectSubtask(
  bundlePath: string,
  parentId: string,
  defect: DefectEvidence & { description?: string; estimated_turns?: number }
): Promise<string | null> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) {
    log(`  Cannot file defect subtask: no STEPS.json at ${bundlePath}`);
    return null;
  }

  const parent = stepsFile.steps.find(s => s.id === parentId);
  if (!parent) {
    log(`  Cannot file defect subtask: parent ${parentId} not found`);
    return null;
  }

  // v2.4 H4: compute defect-recursion depth by walking parent_id ancestors
  // and counting how many of them are themselves validator-filed defects.
  // The new subtask's depth = ancestorDefects + 1. Escalate instead of filing
  // if that would exceed MAX_DEFECT_RECURSION_DEPTH.
  const maxDepth = getMaxDefectRecursionDepth();
  const depth = computeDefectDepth(stepsFile.steps, parent) + 1;
  if (depth > maxDepth) {
    await escalateToNeedsYou(bundlePath, parent, defect, depth, maxDepth);
    log(`  ! Defect depth ${depth} > ${maxDepth} on ${parentId} — escalated to needs-you.md, no subtask filed`);
    return null;
  }

  const existingIds = stepsFile.steps.map(s => s.id || '').filter(Boolean);
  const newId = nextSubtaskId(parentId, existingIds);

  const maxOrder = stepsFile.steps.reduce((m, s) => Math.max(m, s.order ?? s.step_number ?? 0), 0);

  const subtask: WorkStep = {
    id: newId,
    order: maxOrder + 1,
    step_number: maxOrder + 1,
    title: `[DEFECT] ${defect.title}`,
    description: [
      defect.root_cause ? `**Root cause:** ${defect.root_cause}` : '',
      defect.evidence ? `**Evidence:** ${defect.evidence}` : '',
      defect.acceptance_criteria && defect.acceptance_criteria.length > 0
        ? `**Acceptance criteria:**\n${defect.acceptance_criteria.map(c => `- ${c}`).join('\n')}`
        : '',
      defect.description || '',
    ].filter(Boolean).join('\n\n'),
    status: 'pending',
    dependencies: [],
    estimated_turns: defect.estimated_turns ?? 60,
    parent_id: parentId,
    subtask_of: parentId,
    origin: 'validator_defect',
    kind: 'build',
    blocks_parent: true,
    defect_evidence: {
      title: defect.title,
      root_cause: defect.root_cause,
      evidence: defect.evidence,
      acceptance_criteria: defect.acceptance_criteria,
      filed_by_contract: defect.filed_by_contract,
      filed_at: defect.filed_at || new Date().toISOString(),
      parent_step_id: parentId,
      regression_failures: defect.regression_failures,
      depth_reached: depth,
    },
  };

  stepsFile.steps.push(subtask);

  // Flag parent as blocked on subtask so depth-first selector routes work here first
  parent.blocked_on_subtask = true;

  const written = await writeStepsJson(bundlePath, stepsFile);
  if (!written) return null;

  log(`  ✓ Filed defect subtask ${newId} (depth ${depth}) under ${parentId}: ${defect.title}`);
  return newId;
}

/**
 * Count how many ancestors in the parent_id chain are themselves
 * validator-filed defects. An original (non-defect) step has depth 0, its
 * first-level defect subtask has depth 1, a defect-of-a-defect has depth 2.
 */
function computeDefectDepth(steps: WorkStep[], start: WorkStep): number {
  let depth = 0;
  let cursor: WorkStep | undefined = start;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor.origin === 'validator_defect') depth++;
    const parentId: string | null | undefined = cursor.parent_id || cursor.subtask_of;
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);
    cursor = steps.find(s => s.id === parentId);
  }
  return depth;
}

/**
 * Append a defect-escalation entry to workspace/needs-you.md. The executive
 * doesn't file a subtask — the human has to unstick the recursion manually.
 */
async function escalateToNeedsYou(
  bundlePath: string,
  parent: WorkStep,
  defect: DefectEvidence & { description?: string },
  depth: number,
  maxDepth: number
): Promise<void> {
  const needsYouPath = path.join(process.cwd(), 'workspace', 'needs-you.md');
  const goalSlug = path.basename(bundlePath);
  const now = new Date().toISOString();
  const entry = [
    '',
    `## [DEFECT ESCALATION] ${defect.title}`,
    '',
    `- **Bundle:** \`${goalSlug}\``,
    `- **Parent step:** \`${parent.id}\` — ${parent.title}`,
    `- **Depth reached:** ${depth} (cap is ${maxDepth})`,
    `- **Filed at:** ${now}`,
    '',
    defect.root_cause ? `**Root cause:** ${defect.root_cause}` : '',
    defect.evidence ? `**Evidence:** ${defect.evidence}` : '',
    '',
    'The executive stopped filing new defect subtasks here because the chain exceeded `MAX_DEFECT_RECURSION_DEPTH`. Review the defect chain under the parent step, decide whether to rework the parent from scratch, unblock the step, or take the work off the agent.',
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');
  try {
    await appendFile(needsYouPath, entry, 'utf-8');
  } catch (err) {
    log(`  Warning: failed to append defect escalation to needs-you.md: ${err}`);
  }
}

/**
 * Check whether a parent step has any open (non-complete) subtasks.
 */
export function hasOpenSubtasks(steps: WorkStep[], parentId: string): boolean {
  return steps.some(s =>
    (s.parent_id === parentId || s.subtask_of === parentId) &&
    s.status !== 'complete' &&
    s.status !== 'blocked'
  );
}

/**
 * Depth-first step selection.
 *
 * Preference order:
 *   1. An `in_progress` step's open subtask (deepest first, recursive)
 *   2. Any open subtask of any parent that is `blocked_on_subtask`
 *   3. The first pending top-level step whose dependencies are all complete
 *
 * Returns null if nothing is selectable.
 */
export function selectNextExecutableStep(steps: WorkStep[]): WorkStep | null {
  const isOpen = (s: WorkStep) => s.status !== 'complete' && s.status !== 'blocked';

  // 1. Follow any subtask chain of a parent that is blocked_on_subtask
  //    (depth-first: pick the deepest open subtask first)
  const parentsWithOpenChildren = steps.filter(s =>
    s.blocked_on_subtask && hasOpenSubtasks(steps, s.id || '')
  );
  for (const parent of parentsWithOpenChildren) {
    // Find the deepest open descendant
    const deepest = findDeepestOpenSubtask(steps, parent.id || '');
    if (deepest) return deepest;
  }

  // 2. Any orphan defect subtask (shouldn't happen, but defensive)
  const orphanSubtask = steps.find(s =>
    isOpen(s) &&
    s.origin === 'validator_defect' &&
    (s.parent_id || s.subtask_of)
  );
  if (orphanSubtask) return orphanSubtask;

  // 3. First pending top-level step with deps satisfied
  for (const step of steps) {
    if (!isOpen(step)) continue;
    if (step.parent_id || step.subtask_of) continue; // skip subtasks here
    // `blocked_on_subtask` is a cache of "has open children right now". Verify
    // against the real children — when the validator defect chain unwinds, the
    // flag stays true but the children are all done, and without this check
    // the parent would be skipped forever ("No work available in queue").
    if (step.blocked_on_subtask && hasOpenSubtasks(steps, step.id || '')) continue;

    if (step.dependencies && step.dependencies.length > 0) {
      const allComplete = step.dependencies.every(depNum =>
        steps[depNum]?.status === 'complete'
      );
      if (!allComplete) continue;
    }
    return step;
  }

  return null;
}

/**
 * Walk down the subtask tree from a parent and return the deepest open subtask.
 * Used by the depth-first selector so that `step-5.1.1` runs before `step-5.1`.
 */
function findDeepestOpenSubtask(steps: WorkStep[], parentId: string): WorkStep | null {
  const children = steps.filter(s =>
    (s.parent_id === parentId || s.subtask_of === parentId) &&
    s.status !== 'complete' &&
    s.status !== 'blocked'
  );
  if (children.length === 0) return null;

  // Prefer a child that itself has open grandchildren
  for (const child of children) {
    const grand = findDeepestOpenSubtask(steps, child.id || '');
    if (grand) return grand;
  }
  // Otherwise first open child
  return children[0];
}

/**
 * Write a structured handoff blob onto a completed step's STEPS.json entry.
 * Separate from the markdown handoff file written by state-handler.
 */
export async function writeStepHandoffToStepsJson(
  bundlePath: string,
  stepIdToUpdate: string,
  handoff: StructuredHandoff
): Promise<boolean> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) return false;

  const step = stepsFile.steps.find(s => s.id === stepIdToUpdate);
  if (!step) return false;

  step.handoff = { ...handoff, step_id: stepIdToUpdate };
  return writeStepsJson(bundlePath, stepsFile);
}

/**
 * Check if a parent's open subtasks have all completed and unblock it if so.
 * Returns true if the parent was unblocked.
 */
export async function unblockParentIfSubtasksComplete(
  bundlePath: string,
  parentId: string
): Promise<boolean> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) return false;

  const parent = stepsFile.steps.find(s => s.id === parentId);
  if (!parent || !parent.blocked_on_subtask) return false;

  if (hasOpenSubtasks(stepsFile.steps, parentId)) return false;

  parent.blocked_on_subtask = false;
  await writeStepsJson(bundlePath, stepsFile);
  log(`  ✓ Unblocked parent ${parentId} — all defect subtasks complete`);
  return true;
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
  // Don't migrate if STEPS.json (or TASKS.json) already exists
  if (stepsJsonExists(bundlePath)) {
    return null;
  }

  const steps = parseStepsFromBody(body);
  if (steps.length === 0) {
    return null;
  }

  log(`  Migrating ${steps.length} steps from PROMPT.md to STEPS.json at ${bundlePath}`);

  // Write STEPS.json
  const stepsFile = createStepsFile(steps, 'auto');
  const written = await writeStepsJson(bundlePath, stepsFile);
  if (!written) {
    log(`  Migration failed: could not write STEPS.json`);
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
    details: `Migrated ${steps.length} steps from PROMPT.md to STEPS.json (one-time migration)`,
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
