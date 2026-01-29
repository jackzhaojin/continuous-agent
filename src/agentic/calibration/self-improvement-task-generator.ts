/**
 * Self-Improvement Task Generator
 *
 * Creates task entries in goals.md for self-improvement activities.
 * All tasks are prefixed with [SELF-ENHANCE] for tracking.
 *
 * AGENTIC: Task creation logic
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { SelfImprovementTrigger } from './self-improvement-triggers.js';
import { createGoalBundle } from '../../deterministic/workspace-writers.js';

/**
 * Generate a self-improvement task in goals.md
 * Returns true if task was added, false if already exists
 */
export async function generateSelfImprovementTask(trigger: SelfImprovementTrigger): Promise<boolean> {
  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');

  if (!existsSync(goalsPath)) {
    console.error(`[${new Date().toISOString()}] goals.md not found`);
    return false;
  }

  try {
    const content = await readFile(goalsPath, 'utf-8');

    // Generate task based on type
    const task = buildTask(trigger);

    // Check if task already exists (avoid duplicates)
    if (content.includes(task.title)) {
      console.log(`[${new Date().toISOString()}] Self-improvement task already exists: ${task.title}`);
      return false;
    }

    // Find the appropriate priority section
    const sectionHeader = trigger.priority === 'P2' ? '## P2 - High Priority' :
                          trigger.priority === 'P3' ? '## P3 - Normal Priority' :
                          `## ${trigger.priority}`;
    const sectionIndex = content.indexOf(sectionHeader);

    if (sectionIndex === -1) {
      console.error(`[${new Date().toISOString()}] Could not find ${sectionHeader} section in goals.md`);
      return false;
    }

    // Find the next section or end of file
    const nextSectionMatch = content.slice(sectionIndex + sectionHeader.length).match(/\n## /);
    const insertPosition = nextSectionMatch
      ? sectionIndex + sectionHeader.length + nextSectionMatch.index!
      : content.length;

    // Insert the task before the next section
    const taskEntry = formatTaskEntry(task);
    const newContent = content.slice(0, insertPosition) + '\n' + taskEntry + '\n' + content.slice(insertPosition);

    await writeFile(goalsPath, newContent, 'utf-8');

    // V1.2: Also create a goal bundle in in-progress
    try {
      const priorityDir = path.join(process.cwd(), 'workspace', 'in-progress', trigger.priority);

      await createGoalBundle(task.title, task.description, priorityDir);
    } catch (bundleError) {
      console.log(`[${new Date().toISOString()}] Failed to create goal bundle: ${bundleError}`);
    }

    console.log(`[${new Date().toISOString()}] Added self-improvement task: ${task.title}`);
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

function formatTaskEntry(task: Task): string {
  return `### ${task.title}
- **Status:** Pending
- **Description:** ${task.description}
- **Success Criteria:** Task completes successfully using the corresponding Claude Code skill
- **Dependencies:** None identified
`;
}
