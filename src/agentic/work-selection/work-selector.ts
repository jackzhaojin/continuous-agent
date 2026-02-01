import type { WorkItem, WorkStep } from '../../core/types.js';
import { buildSelectableWorkFromBundles, getDraftResearchTasks } from './goal-scanner.js';

export type { WorkItem };
export type { WorkStep };

/**
 * Selectable work - either a full task or a step within a task
 */
export interface SelectableWork {
  type: 'goal' | 'step';
  goal: WorkItem;
  step?: WorkStep;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
}

/**
 * Select the next work with step awareness
 * Returns both the task and the specific step to execute (if multi-step)
 *
 * V1.2: Uses folder-based goal bundles exclusively (PROMPT.md files).
 */
export async function selectWorkWithSteps(): Promise<SelectableWork | null> {
  try {
    const bundleWork = await buildSelectableWorkFromBundles();
    if (bundleWork.length > 0) {
      const selected = bundleWork[0];
      if (selected.type === 'step') {
        console.log(`[${new Date().toISOString()}] [Bundle] Selected step: [${selected.priority}] ${selected.goal.title} - Step ${selected.step!.step_number + 1}: ${selected.step!.title}`);
      } else {
        console.log(`[${new Date().toISOString()}] [Bundle] Selected goal: [${selected.priority}] ${selected.goal.title}`);
      }
      return selected;
    }

    // Check drafts for research tasks
    const researchTasks = await getDraftResearchTasks();
    if (researchTasks.length > 0) {
      console.log(`[${new Date().toISOString()}] [Bundle] Selected draft research: ${researchTasks[0].goal.title}`);
      return researchTasks[0];
    }
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Bundle scanning failed: ${error}`);
  }

  console.log(`[${new Date().toISOString()}] No goal bundles found`);
  return null;
}
