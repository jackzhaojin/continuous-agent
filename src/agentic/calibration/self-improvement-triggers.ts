/**
 * Self-Improvement Triggers
 *
 * Determines when to trigger passive learning activities:
 * - Retrospective: Weekly (Sunday) OR after 10+ outcomes
 *   Analyzes recent work, calibrates confidence scores, generates recommendations.
 *
 * Reference refresh and practice loops are NOT auto-generated.
 * Human preference: no auto-generating work above P4, no practice loops.
 *
 * AGENTIC: Decision-making about when to self-improve
 */

import { loadSelfImprovementState } from '../../deterministic/self-improvement-state.js';

export type SelfImprovementType = 'retrospective';

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
 * Check for self-improvement triggers.
 * Only retrospective is auto-triggered (runs inline, no worker spawned).
 * All auto-generated work is P4 to avoid competing with human-queued goals.
 */
export async function checkSelfImprovementTriggers(): Promise<SelfImprovementTrigger | null> {
  // Retrospective: passive learning from recent outcomes
  if (await shouldRunRetrospective()) {
    const state = await loadSelfImprovementState();
    return {
      type: 'retrospective',
      reason: state.outcomes_since_last_retro >= 10
        ? `${state.outcomes_since_last_retro} outcomes since last retrospective`
        : 'Weekly scheduled retrospective (Sunday)',
      priority: 'P4',
    };
  }

  return null;
}
