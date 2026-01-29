/**
 * Self-Improvement Triggers
 *
 * Determines when to trigger self-improvement activities:
 * - Practice Loop: When idle (no P1/P2 work)
 * - Retrospective: Weekly (Sunday) OR after 10+ outcomes
 * - Reference Refresh: Weekly (Sunday)
 *
 * AGENTIC: Decision-making about when to self-improve
 */

import { loadSelfImprovementState } from '../../deterministic/self-improvement-state.js';

export type SelfImprovementType = 'practice' | 'retrospective' | 'reference-refresh';

export interface SelfImprovementTrigger {
  type: SelfImprovementType;
  reason: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
}

/**
 * Check if it's time for a retrospective
 * Triggers:
 * - Weekly (every Sunday at 00:00)
 * - After 10+ new outcomes since last retrospective
 */
async function shouldRunRetrospective(): Promise<boolean> {
  const state = await loadSelfImprovementState();

  // Check outcome count threshold
  if (state.outcomes_since_last_retro >= 10) {
    return true;
  }

  // Check if it's Sunday and hasn't run this week
  const now = new Date();
  const dayOfWeek = now.getDay();

  if (dayOfWeek === 0) { // Sunday
    if (!state.last_retrospective_at) {
      return true;
    }

    const lastRetro = new Date(state.last_retrospective_at);
    const daysSinceLastRetro = (now.getTime() - lastRetro.getTime()) / (1000 * 60 * 60 * 24);

    // Run if more than 6 days since last retrospective
    if (daysSinceLastRetro >= 6) {
      return true;
    }
  }

  return false;
}

/**
 * Check if it's time for reference refresh
 * Triggers:
 * - Weekly (every Sunday)
 * - If more than 7 days since last refresh
 */
async function shouldRunReferenceRefresh(): Promise<boolean> {
  const state = await loadSelfImprovementState();

  if (!state.last_reference_refresh_at) {
    return true; // Never run before
  }

  const now = new Date();
  const lastRefresh = new Date(state.last_reference_refresh_at);
  const daysSinceLastRefresh = (now.getTime() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24);

  // Run if more than 7 days since last refresh
  return daysSinceLastRefresh >= 7;
}

/**
 * Check if practice loop should run
 * Triggers when idle (called when no P0-P4 work available)
 */
async function shouldRunPracticeLoop(): Promise<boolean> {
  const state = await loadSelfImprovementState();

  // Don't run practice too frequently - minimum 1 hour between practice sessions
  if (state.last_practice_at) {
    const lastPractice = new Date(state.last_practice_at);
    const now = new Date();
    const hoursSinceLastPractice = (now.getTime() - lastPractice.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastPractice < 1) {
      return false; // Too soon
    }
  }

  return true;
}

/**
 * Check for self-improvement triggers
 * Returns highest priority trigger that should run now
 *
 * Priority order:
 * 1. Retrospective (P2) - Important for learning
 * 2. Reference Refresh (P2) - Keeps dependencies updated
 * 3. Practice Loop (P3) - Idle-time improvement
 */
export async function checkSelfImprovementTriggers(): Promise<SelfImprovementTrigger | null> {
  // Check retrospective first (highest priority self-improvement)
  if (await shouldRunRetrospective()) {
    const state = await loadSelfImprovementState();
    return {
      type: 'retrospective',
      reason: state.outcomes_since_last_retro >= 10
        ? `${state.outcomes_since_last_retro} outcomes since last retrospective`
        : 'Weekly scheduled retrospective (Sunday)',
      priority: 'P2',
    };
  }

  // Check reference refresh
  if (await shouldRunReferenceRefresh()) {
    return {
      type: 'reference-refresh',
      reason: 'Weekly scheduled reference refresh',
      priority: 'P2',
    };
  }

  // Check practice loop (lowest priority, runs when truly idle)
  if (await shouldRunPracticeLoop()) {
    return {
      type: 'practice',
      reason: 'Idle time - improve skill confidence',
      priority: 'P3',
    };
  }

  return null;
}
