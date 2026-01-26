/**
 * Self-Improvement State Tracker
 *
 * Tracks when self-improvement activities (practice, retrospective, reference refresh)
 * were last executed to enable scheduled/idle triggering.
 *
 * DETERMINISTIC: File I/O, timestamp tracking
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface SelfImprovementState {
  last_practice_at: string | null;
  last_retrospective_at: string | null;
  last_reference_refresh_at: string | null;
  practice_count: number;
  retrospective_count: number;
  outcomes_since_last_retro: number;
}

const STATE_FILE = path.join(process.cwd(), 'workspace', 'self-improvement-state.json');

/**
 * Load self-improvement state from disk
 */
export async function loadSelfImprovementState(): Promise<SelfImprovementState> {
  if (!existsSync(STATE_FILE)) {
    return createDefaultState();
  }

  try {
    const content = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading self-improvement state:`, error);
    return createDefaultState();
  }
}

/**
 * Save self-improvement state to disk
 */
export async function saveSelfImprovementState(state: SelfImprovementState): Promise<void> {
  try {
    const content = JSON.stringify(state, null, 2);
    await writeFile(STATE_FILE, content, 'utf-8');
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving self-improvement state:`, error);
  }
}

/**
 * Update last practice timestamp
 */
export async function markPracticeCompleted(): Promise<void> {
  const state = await loadSelfImprovementState();
  state.last_practice_at = new Date().toISOString();
  state.practice_count++;
  await saveSelfImprovementState(state);
}

/**
 * Update last retrospective timestamp
 */
export async function markRetrospectiveCompleted(): Promise<void> {
  const state = await loadSelfImprovementState();
  state.last_retrospective_at = new Date().toISOString();
  state.retrospective_count++;
  state.outcomes_since_last_retro = 0; // Reset counter
  await saveSelfImprovementState(state);
}

/**
 * Update last reference refresh timestamp
 */
export async function markReferenceRefreshCompleted(): Promise<void> {
  const state = await loadSelfImprovementState();
  state.last_reference_refresh_at = new Date().toISOString();
  await saveSelfImprovementState(state);
}

/**
 * Increment outcome counter (called when capability-ledger gets new entry)
 */
export async function incrementOutcomeCount(): Promise<void> {
  const state = await loadSelfImprovementState();
  state.outcomes_since_last_retro++;
  await saveSelfImprovementState(state);
}

function createDefaultState(): SelfImprovementState {
  return {
    last_practice_at: null,
    last_retrospective_at: null,
    last_reference_refresh_at: null,
    practice_count: 0,
    retrospective_count: 0,
    outcomes_since_last_retro: 0,
  };
}
