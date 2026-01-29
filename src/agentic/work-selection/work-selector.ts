import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { WorkItem, WorkStep } from '../../core/types.js';
import { buildSelectableWorkFromBundles, getDraftResearchTasks } from './goal-scanner.js';

export type { WorkItem };
export type { WorkStep };

/**
 * Selectable work - either a full task or a step within a task
 */
export interface SelectableWork {
  type: 'task' | 'step';
  task: WorkItem;
  step?: WorkStep;
  priority: 'P1' | 'P2' | 'P3';
}

interface ParsedSection {
  priority: 'P1' | 'P2' | 'P3';
  items: WorkItem[];
}

/**
 * Parse step status from various formats
 */
function parseStepStatus(statusText: string): WorkStep['status'] {
  const lower = statusText.toLowerCase().trim();
  if (lower.includes('complete') || lower.includes('done')) {
    return 'complete';
  } else if (lower.includes('block')) {
    return 'blocked';
  } else if (lower.includes('in progress') || lower.includes('wip')) {
    return 'in_progress';
  }
  return 'pending';
}

/**
 * Parse dependencies string like "Step 1,2,3" or "1, 2, 3"
 */
function parseDependencies(depsText: string): number[] {
  const deps: number[] = [];
  const matches = depsText.match(/\d+/g);
  if (matches) {
    for (const m of matches) {
      deps.push(parseInt(m, 10) - 1); // Convert to 0-based index
    }
  }
  return deps;
}

/**
 * Parse estimated turns from formats like "100-120" or "100"
 */
function parseEstimatedTurns(turnsText: string): number | undefined {
  const rangeMatch = turnsText.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    // Take average of range
    return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  }
  const singleMatch = turnsText.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  return undefined;
}

/**
 * Parse steps (#### headings) under a task (### heading)
 */
function parseSteps(lines: string[], startIndex: number): { steps: WorkStep[]; endIndex: number } {
  const steps: WorkStep[] = [];
  let i = startIndex;
  let stepNumber = 0;
  let currentStep: Partial<WorkStep> | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Stop if we hit another task (###) or priority section (##)
    if (trimmedLine.match(/^#{1,3}\s+(?!Step\b|step\b)/i) && !trimmedLine.match(/^####/)) {
      break;
    }

    // Check for step headers (#### Step N: Title)
    const stepMatch = trimmedLine.match(/^####\s+(?:Step\s+)?(\d+[a-z]?)[:.]?\s*(.+)$/i);
    if (stepMatch) {
      // Save previous step
      if (currentStep && currentStep.title) {
        steps.push(currentStep as WorkStep);
      }

      stepNumber++;
      currentStep = {
        step_number: stepNumber - 1, // 0-based
        title: stepMatch[2].trim(),
        description: '',
        status: 'pending',
        dependencies: [],
      };
      i++;
      continue;
    }

    // Parse step metadata
    if (currentStep) {
      // Status line
      const statusMatch = trimmedLine.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        currentStep.status = parseStepStatus(statusMatch[1]);
        i++;
        continue;
      }

      // Description line
      const descMatch = trimmedLine.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
      if (descMatch) {
        currentStep.description = descMatch[1].trim();
        i++;
        continue;
      }

      // Dependencies line
      const depsMatch = trimmedLine.match(/^[-*]\s*\*\*Dependencies?:\*\*\s*(.+)$/i);
      if (depsMatch) {
        currentStep.dependencies = parseDependencies(depsMatch[1]);
        i++;
        continue;
      }

      // Estimated turns
      const turnsMatch = trimmedLine.match(/^[-*]\s*\*\*Est\.?\s*(?:Turns|Duration):\*\*\s*(.+)$/i);
      if (turnsMatch) {
        currentStep.estimated_turns = parseEstimatedTurns(turnsMatch[1]);
        i++;
        continue;
      }

      // Output path
      const outputMatch = trimmedLine.match(/^[-*]\s*\*\*Output:\*\*\s*(.+)$/i);
      if (outputMatch) {
        currentStep.output_path = outputMatch[1].trim();
        i++;
        continue;
      }

      // Completed timestamp
      const completedMatch = trimmedLine.match(/^[-*]\s*\*\*Completed:\*\*\s*(.+)$/i);
      if (completedMatch) {
        currentStep.completed_at = completedMatch[1].trim();
        i++;
        continue;
      }

      // Started timestamp
      const startedMatch = trimmedLine.match(/^[-*]\s*\*\*Started:\*\*\s*(.+)$/i);
      if (startedMatch) {
        currentStep.started_at = startedMatch[1].trim();
        i++;
        continue;
      }
    }

    i++;
  }

  // Save last step
  if (currentStep && currentStep.title) {
    steps.push(currentStep as WorkStep);
  }

  return { steps, endIndex: i };
}

/**
 * Parse a goals.md file and extract work items by priority
 *
 * Expected format:
 * ## P1 - Critical Priority
 * ### Goal Title Here
 * - **Status:** Not Started
 * - **Description:** What to do
 */
function parseGoalsFile(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = content.split('\n');

  let currentPriority: 'P1' | 'P2' | 'P3' | null = null;
  let currentItem: Partial<WorkItem> | null = null;
  let itemCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for priority section headers (## P1, ## P2, ## P3)
    if (trimmedLine.match(/^#{1,2}\s*P1\b/i)) {
      // Save current item before switching sections
      if (currentItem && currentItem.title && currentPriority) {
        saveItem(sections, currentItem as WorkItem, currentPriority);
      }
      currentPriority = 'P1';
      currentItem = null;
      continue;
    }
    if (trimmedLine.match(/^#{1,2}\s*P2\b/i)) {
      // Save current item before switching sections
      if (currentItem && currentItem.title && currentPriority) {
        saveItem(sections, currentItem as WorkItem, currentPriority);
      }
      currentPriority = 'P2';
      currentItem = null;
      continue;
    }
    if (trimmedLine.match(/^#{1,2}\s*P3\b/i)) {
      // Save current item before switching sections
      if (currentItem && currentItem.title && currentPriority) {
        saveItem(sections, currentItem as WorkItem, currentPriority);
      }
      currentPriority = 'P3';
      currentItem = null;
      continue;
    }

    // Check for Archive or other non-priority sections - stop parsing
    if (trimmedLine.match(/^#{1,2}\s*(Archive|Completed|Done)\b/i)) {
      // Save current item before entering archive section
      if (currentItem && currentItem.title && currentPriority) {
        saveItem(sections, currentItem as WorkItem, currentPriority);
      }
      currentPriority = null;
      currentItem = null;
      continue;
    }

    // Skip if not in a priority section
    if (!currentPriority) continue;

    // Check for goal headers (### Goal Title)
    const goalMatch = trimmedLine.match(/^###\s+(.+)$/);
    if (goalMatch) {
      // Save previous item if exists
      if (currentItem && currentItem.title) {
        saveItem(sections, currentItem as WorkItem, currentPriority);
      }

      itemCounter++;

      // Check for [SELF-ENHANCE] prefix - indicates self-enhancement task
      // IMPORTANT: Keep the full title including prefix for goals.md regex matching
      const rawTitle = goalMatch[1].trim();
      const selfEnhance = /^\[SELF-ENHANCE\]/i.test(rawTitle);

      currentItem = {
        id: `work-${itemCounter}`,
        priority: currentPriority,
        title: rawTitle,
        description: '',
        status: 'pending',
        selfEnhance: selfEnhance,
      };

      // CRITICAL: Parse metadata lines BEFORE looking for steps
      // This ensures Output path is captured for resume functionality
      // Metadata lines are between the goal header and the first step
      let metadataEndIndex = i + 1;
      while (metadataEndIndex < lines.length) {
        const metaLine = lines[metadataEndIndex].trim();

        // Stop at step headers or next goal/section
        if (metaLine.match(/^####/) || metaLine.match(/^#{1,3}\s+(?!Step)/i)) {
          break;
        }

        // Parse Status
        // Note: Status like "In Progress (Step 2 of 4, 25% complete)" contains "complete"
        // so we must check for "in progress" FIRST
        const statusMatch = metaLine.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
        if (statusMatch) {
          const statusText = statusMatch[1].toLowerCase().trim();
          // Check in_progress FIRST - it may contain "% complete" suffix
          if (statusText.includes('in progress') || statusText.includes('wip')) {
            currentItem.status = 'in_progress';
          } else if (statusText.includes('block')) {
            currentItem.status = 'blocked';
          } else if (statusText.includes('not started') || statusText === 'pending') {
            currentItem.status = 'pending';
          } else if (statusText.startsWith('complete') || statusText.includes('done')) {
            // Use startsWith for 'complete' to avoid matching "25% complete"
            currentItem.status = 'complete';
          }
        }

        // Parse Description
        const descMatch = metaLine.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
        if (descMatch) {
          currentItem.description = descMatch[1].trim();
        }

        // Parse Output path - CRITICAL for resume across restarts
        const outputMatch = metaLine.match(/^[-*]\s*\*\*Output:\*\*\s*(.+)$/i);
        if (outputMatch) {
          currentItem.output_path = outputMatch[1].trim();
        }

        // Parse Branch - for self-enhancement tasks to resume on same branch
        const branchMatch = metaLine.match(/^[-*]\s*\*\*Branch:\*\*\s*(.+)$/i);
        if (branchMatch) {
          currentItem.branch = branchMatch[1].trim();
        }

        metadataEndIndex++;
      }

      // Now look ahead to parse steps if any exist
      const { steps, endIndex } = parseSteps(lines, metadataEndIndex);
      if (steps.length > 0) {
        currentItem.steps = steps;
        // Calculate current step and progress
        const completedSteps = steps.filter(s => s.status === 'complete').length;
        const firstIncomplete = steps.findIndex(s => s.status !== 'complete' && s.status !== 'blocked');
        currentItem.current_step = firstIncomplete >= 0 ? firstIncomplete : undefined;
        currentItem.progress_pct = Math.round((completedSteps / steps.length) * 100);
        // Adjust loop index to skip step lines we've already processed
        i = endIndex - 1; // -1 because the loop will increment
      } else {
        // No steps found, skip to where metadata parsing ended
        i = metadataEndIndex - 1;
      }
      continue;
    }

    // Parse metadata lines under a goal (for tasks without steps)
    if (currentItem) {
      // Status line: - **Status:** Not Started
      // Note: Status like "In Progress (Step 2 of 4, 25% complete)" contains "complete"
      // so we must check for "in progress" FIRST
      const statusMatch = trimmedLine.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        const statusText = statusMatch[1].toLowerCase().trim();
        // Check in_progress FIRST - it may contain "% complete" suffix
        if (statusText.includes('in progress') || statusText.includes('wip')) {
          currentItem.status = 'in_progress';
        } else if (statusText.includes('block')) {
          currentItem.status = 'blocked';
        } else if (statusText.includes('not started') || statusText === 'pending') {
          currentItem.status = 'pending';
        } else if (statusText.startsWith('complete') || statusText.includes('done')) {
          // Use startsWith for 'complete' to avoid matching "25% complete"
          currentItem.status = 'complete';
        } else {
          currentItem.status = 'pending';
        }
        continue;
      }

      // Description line: - **Description:** What to do
      const descMatch = trimmedLine.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
      if (descMatch) {
        currentItem.description = descMatch[1].trim();
        continue;
      }

      // Output path line: - **Output:** /path/to/project
      // This allows resuming work on the same project across restarts
      const outputMatch = trimmedLine.match(/^[-*]\s*\*\*Output:\*\*\s*(.+)$/i);
      if (outputMatch) {
        currentItem.output_path = outputMatch[1].trim();
        continue;
      }

      // Branch line: - **Branch:** self-enhance/feature-name
      // For self-enhancement tasks to resume on same branch
      const branchMatch = trimmedLine.match(/^[-*]\s*\*\*Branch:\*\*\s*(.+)$/i);
      if (branchMatch) {
        currentItem.branch = branchMatch[1].trim();
        continue;
      }
    }
  }

  // Don't forget the last item
  if (currentItem && currentItem.title && currentPriority) {
    saveItem(sections, currentItem as WorkItem, currentPriority);
  }

  // Sort sections by priority (P1 first, then P2, then P3)
  sections.sort((a, b) => {
    const priorityOrder = { P1: 1, P2: 2, P3: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return sections;
}

function saveItem(sections: ParsedSection[], item: WorkItem, priority: 'P1' | 'P2' | 'P3'): void {
  let section = sections.find(s => s.priority === priority);
  if (!section) {
    section = { priority, items: [] };
    sections.push(section);
  }
  section.items.push(item);
}

/**
 * Get priority value for sorting (lower = higher priority)
 */
function priorityValue(priority: 'P1' | 'P2' | 'P3'): number {
  const order = { P1: 1, P2: 2, P3: 3 };
  return order[priority];
}

/**
 * Check if step dependencies are met
 */
function areStepDependenciesMet(step: WorkStep, allSteps: WorkStep[]): boolean {
  if (!step.dependencies || step.dependencies.length === 0) {
    return true;
  }
  return step.dependencies.every(depIndex => {
    const depStep = allSteps[depIndex];
    return depStep && depStep.status === 'complete';
  });
}

/**
 * Select the next work with step awareness
 * Returns both the task and the specific step to execute (if multi-step)
 */
export async function selectWorkWithSteps(): Promise<SelectableWork | null> {
  // V1.2: Try folder-based goal bundles first
  try {
    const bundleWork = await buildSelectableWorkFromBundles();
    if (bundleWork.length > 0) {
      const selected = bundleWork[0];
      if (selected.type === 'step') {
        console.log(`[${new Date().toISOString()}] [Bundle] Selected step: [${selected.priority}] ${selected.task.title} - Step ${selected.step!.step_number + 1}: ${selected.step!.title}`);
      } else {
        console.log(`[${new Date().toISOString()}] [Bundle] Selected task: [${selected.priority}] ${selected.task.title}`);
      }
      return selected;
    }

    // Check drafts for research tasks
    const researchTasks = await getDraftResearchTasks();
    if (researchTasks.length > 0) {
      console.log(`[${new Date().toISOString()}] [Bundle] Selected draft research: ${researchTasks[0].task.title}`);
      return researchTasks[0];
    }
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Bundle scanning failed, falling back to goals.md: ${error}`);
  }

  // V1.1 fallback: Parse goals.md directly
  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');

  if (!existsSync(goalsPath)) {
    console.log(`[${new Date().toISOString()}] No goals.md found at ${goalsPath}`);
    return null;
  }

  try {
    const content = await readFile(goalsPath, 'utf-8');
    const sections = parseGoalsFile(content);

    if (sections.length === 0) {
      console.log(`[${new Date().toISOString()}] No priority sections found in goals.md`);
      return null;
    }

    // Collect all selectable work (tasks and steps)
    const allSelectableWork: SelectableWork[] = [];

    for (const section of sections) {
      for (const task of section.items) {
        // Skip completed or blocked tasks
        if (task.status === 'complete' || task.status === 'blocked') {
          continue;
        }

        if (task.steps && task.steps.length > 0) {
          // Multi-step task: find the next available step
          for (const step of task.steps) {
            // Skip completed or blocked steps
            if (step.status === 'complete' || step.status === 'blocked') {
              continue;
            }

            // Check if dependencies are met
            if (areStepDependenciesMet(step, task.steps)) {
              allSelectableWork.push({
                type: 'step',
                task: task,
                step: step,
                priority: task.priority,
              });
              // Only add the first available step per task
              break;
            }
          }
        } else {
          // Single-step task: add the whole task
          allSelectableWork.push({
            type: 'task',
            task: task,
            priority: task.priority,
          });
        }
      }
    }

    if (allSelectableWork.length === 0) {
      console.log(`[${new Date().toISOString()}] All work items are either completed or blocked`);
      return null;
    }

    // Sort by priority (P1 > P2 > P3)
    allSelectableWork.sort((a, b) => priorityValue(a.priority) - priorityValue(b.priority));

    // Return highest priority work
    const selected = allSelectableWork[0];
    if (selected.type === 'step') {
      console.log(`[${new Date().toISOString()}] Selected step: [${selected.priority}] ${selected.task.title} - Step ${selected.step!.step_number + 1}: ${selected.step!.title}`);
    } else {
      console.log(`[${new Date().toISOString()}] Selected task: [${selected.priority}] ${selected.task.title}`);
    }

    return selected;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error reading goals.md:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Select the next work item to execute (backward compatible)
 * Returns the first unblocked item from the highest priority section
 */
export async function selectWork(): Promise<WorkItem | null> {
  const result = await selectWorkWithSteps();
  return result?.task || null;
}

/**
 * Get all work items (for debugging/status purposes)
 */
export async function getAllWorkItems(): Promise<WorkItem[]> {
  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');

  if (!existsSync(goalsPath)) {
    return [];
  }

  try {
    const content = await readFile(goalsPath, 'utf-8');
    const sections = parseGoalsFile(content);
    return sections.flatMap(s => s.items);
  } catch {
    return [];
  }
}

/**
 * Update goals.md with step progress
 * Updates status for a specific step within a task
 */
export async function updateStepStatus(
  taskTitle: string,
  stepNumber: number,
  newStatus: WorkStep['status'],
  additionalData?: {
    actual_turns?: number;
    output_path?: string;
    completed_at?: string;
    started_at?: string;
  }
): Promise<boolean> {
  console.log(`[${new Date().toISOString()}] [DEBUG] >>> updateStepStatus CALLED: task="${taskTitle}", step=${stepNumber + 1}, status="${newStatus}"`);

  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');

  try {
    let content = await readFile(goalsPath, 'utf-8');

    // FIXED: First find the task section, then find the step within it
    // This prevents updating steps in other tasks with the same step number
    const escapedTitle = taskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find the task section: ### Task Title ... until next ### or ## or end
    const taskSectionPattern = new RegExp(
      `(###\\s+${escapedTitle}[\\s\\S]*?)(####\\s+(?:Step\\s+)?${stepNumber + 1}[a-z]?[:.]?\\s+[^\\n]+\\n(?:.*?\\n)*?)(- \\*\\*Status:\\*\\*)\\s*([^\\n]+)`,
      'i'
    );

    console.log(`[${new Date().toISOString()}] [DEBUG] updateStepStatus: task="${taskTitle}", step=${stepNumber + 1}, status="${newStatus}"`);
    const matchResult = taskSectionPattern.test(content);
    console.log(`[${new Date().toISOString()}] [DEBUG] Pattern match result: ${matchResult}`);

    if (matchResult) {
      // Format status text
      let statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1).replace('_', ' ');

      content = content.replace(taskSectionPattern, `$1$2$3 ${statusText}`);

      // Add additional data if provided
      if (additionalData?.completed_at && newStatus === 'complete') {
        // Add completed timestamp if not already present (scoped to task section)
        const completedPattern = new RegExp(
          `###\\s+${escapedTitle}[\\s\\S]*?####\\s+(?:Step\\s+)?${stepNumber + 1}[^\\n]+\\n(?:.*?\\n)*?- \\*\\*Completed:\\*\\*`,
          'i'
        );
        if (!completedPattern.test(content)) {
          // Add completed line after status (scoped to task section)
          const statusLine = new RegExp(
            `(###\\s+${escapedTitle}[\\s\\S]*?####\\s+(?:Step\\s+)?${stepNumber + 1}[^\\n]+\\n(?:.*?\\n)*?- \\*\\*Status:\\*\\*[^\\n]+)`,
            'i'
          );
          content = content.replace(statusLine, `$1\n- **Completed:** ${additionalData.completed_at}`);
        }
      }

      await writeFile(goalsPath, content, 'utf-8');
      console.log(`[${new Date().toISOString()}] Updated step ${stepNumber + 1} status to: ${statusText}`);
      return true;
    }

    console.log(`[${new Date().toISOString()}] Could not find step ${stepNumber + 1} in goals.md`);
    return false;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error updating step status:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Update parent task status based on step completion
 */
export async function updateTaskProgressFromSteps(taskTitle: string, steps: WorkStep[]): Promise<boolean> {
  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');

  try {
    let content = await readFile(goalsPath, 'utf-8');

    const completedSteps = steps.filter(s => s.status === 'complete').length;
    const totalSteps = steps.length;
    const progressPct = Math.round((completedSteps / totalSteps) * 100);
    const currentStepNum = steps.findIndex(s => s.status === 'in_progress') + 1 || completedSteps + 1;

    // Build status text
    let statusText: string;
    if (progressPct === 100) {
      statusText = 'Complete';
    } else if (steps.some(s => s.status === 'blocked')) {
      statusText = `Blocked (Step ${currentStepNum} of ${totalSteps}, ${progressPct}% complete)`;
    } else {
      statusText = `In Progress (Step ${currentStepNum} of ${totalSteps}, ${progressPct}% complete)`;
    }

    // Update the task status
    const titlePattern = new RegExp(
      `(###\\s+${escapeRegex(taskTitle)}[\\s\\S]*?- \\*\\*Status:\\*\\*)\\s*[^\\n]+`,
      'i'
    );

    if (titlePattern.test(content)) {
      content = content.replace(titlePattern, `$1 ${statusText}`);
      await writeFile(goalsPath, content, 'utf-8');
      console.log(`[${new Date().toISOString()}] Updated task "${taskTitle}" status to: ${statusText}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error updating task progress:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
