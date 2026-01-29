/**
 * Self-Improvement Task Generator
 *
 * Creates goal bundles for self-improvement activities.
 * All tasks are prefixed with [SELF-ENHANCE] for tracking.
 *
 * V1.2: Bundles only — no goals.md writes.
 *
 * AGENTIC: Task creation logic
 */

import path from 'path';
import type { SelfImprovementTrigger } from './self-improvement-triggers.js';
import { createGoalBundle } from '../../deterministic/workspace-writers.js';

/**
 * Generate a self-improvement task as a goal bundle.
 * Returns true if task was created, false if it already exists or on error.
 */
export async function generateSelfImprovementTask(trigger: SelfImprovementTrigger): Promise<boolean> {
  try {
    const task = buildTask(trigger);
    const priorityDir = path.join(process.cwd(), 'workspace', 'in-progress', trigger.priority);

    const result = await createGoalBundle(task.title, task.description, priorityDir);

    if (result === null) {
      console.log(`[${new Date().toISOString()}] Self-improvement task already exists: ${task.title}`);
      return false;
    }

    console.log(`[${new Date().toISOString()}] Created self-improvement bundle: ${task.title}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error generating self-improvement task:`, error);
    return false;
  }
}

interface Task {
  title: string;
  description: string;
  skillId?: string;
}

function buildTask(trigger: SelfImprovementTrigger): Task {
  switch (trigger.type) {
    case 'practice':
      return {
        title: '[SELF-ENHANCE] Practice Loop',
        description: `Run practice tasks to improve skill confidence. Trigger: ${trigger.reason}`,
      };

    case 'retrospective':
      return {
        title: '[SELF-ENHANCE] Weekly Retrospective',
        description: `Analyze recent work outcomes and update skill confidence. Trigger: ${trigger.reason}`,
      };

    case 'reference-refresh':
      return {
        title: '[SELF-ENHANCE] Reference Refresh',
        description: `Refresh external references (Mode A/B) to keep them up-to-date. Trigger: ${trigger.reason}`,
      };

    default:
      return {
        title: '[SELF-ENHANCE] Unknown',
        description: 'Unknown self-improvement task',
      };
  }
}

