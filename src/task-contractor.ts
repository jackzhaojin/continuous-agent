/**
 * Task Contractor - Creates task contracts from work items
 *
 * Transforms high-level work items from goals.md into detailed
 * task contracts that can be executed by worker agents.
 */

import type { WorkItem, WorkStep } from './work-selector.js';
import type { TaskContract } from './types.js';
import { randomUUID } from 'crypto';

/**
 * Default tools allowed for worker agents
 */
const DEFAULT_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
];

/**
 * Extended tools for more complex tasks
 */
const EXTENDED_TOOLS = [
  ...DEFAULT_TOOLS,
  'WebFetch',
  'WebSearch',
];

// Configuration from environment
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '250', 10);
const MAX_TURNS_PER_STEP = parseInt(process.env.MAX_TURNS_PER_STEP || '100', 10);

/**
 * Determine the appropriate max_turns based on task complexity
 * Respects MAX_TURNS environment variable as the cap
 * For multi-step tasks, uses MAX_TURNS_PER_STEP for individual steps
 */
function estimateMaxTurns(workItem: WorkItem, step?: WorkStep): number {
  // If this is a step within a multi-step task, use step budget
  if (step) {
    return step.estimated_turns || MAX_TURNS_PER_STEP;
  }

  // If the task has steps, this shouldn't be called for the whole task
  // But if it is, use the step budget
  if (workItem.steps && workItem.steps.length > 0) {
    return MAX_TURNS_PER_STEP;
  }

  // Single-step task: use full MAX_TURNS budget (proven to work)
  const maxTurnsEnv = MAX_TURNS;

  // Use both title and description for keyword analysis
  const text = `${workItem.title} ${workItem.description || ''}`.toLowerCase();

  // For simple tasks, use less turns (but still respect env max)
  if (
    text.includes('fix typo') ||
    text.includes('update version') ||
    text.includes('add comment') ||
    text.includes('rename')
  ) {
    return Math.min(50, maxTurnsEnv);
  }

  // For medium complexity tasks
  if (
    text.includes('refactor') ||
    text.includes('add test') ||
    text.includes('update config')
  ) {
    return Math.min(100, maxTurnsEnv);
  }

  // For complex tasks (building apps, integrations, etc) - use full MAX_TURNS
  if (
    text.includes('migrate') ||
    text.includes('rewrite') ||
    text.includes('architect') ||
    text.includes('design') ||
    text.includes('build') ||
    text.includes('app') ||
    text.includes('integration') ||
    text.includes('implement feature')
  ) {
    return maxTurnsEnv; // Use full configured max
  }

  // Default based on priority (but cap at MAX_TURNS)
  const defaultTurns = workItem.priority === 'P1' ? maxTurnsEnv :
                       workItem.priority === 'P2' ? Math.min(150, maxTurnsEnv) :
                       Math.min(100, maxTurnsEnv);

  return defaultTurns;
}

/**
 * Determine which tools to allow based on task type
 */
function determineAllowedTools(workItem: WorkItem): string[] {
  // Use both title and description for keyword analysis
  const text = `${workItem.title} ${workItem.description || ''}`.toLowerCase();

  // Tasks that might need web access
  if (
    text.includes('research') ||
    text.includes('docs') ||
    text.includes('documentation') ||
    text.includes('api') ||
    text.includes('dependency') ||
    text.includes('integration') ||
    text.includes('poc')
  ) {
    return EXTENDED_TOOLS;
  }

  return DEFAULT_TOOLS;
}

/**
 * Create a task contract from a work item
 *
 * @param workItem - The work item to create a contract for
 * @param reposAllowed - Optional list of repos the worker can access
 * @param step - Optional step for multi-step tasks
 * @returns A complete task contract ready for worker execution
 */
export function createTaskContract(
  workItem: WorkItem,
  reposAllowed: string[] = ['.'],
  step?: WorkStep
): TaskContract {
  const taskId = `task-${randomUUID().slice(0, 8)}`;

  return {
    id: taskId,
    goal: buildGoalPrompt(workItem, step),
    scope: {
      repos_allowed: reposAllowed,
      tools_allowed: determineAllowedTools(workItem),
    },
    definition_of_done: generateDefinitionOfDone(workItem, step),
    max_turns: estimateMaxTurns(workItem, step),
    created_at: new Date().toISOString(),
  };
}

/**
 * Build a clear goal prompt from the work item
 * For multi-step tasks, includes step-specific context
 */
function buildGoalPrompt(workItem: WorkItem, step?: WorkStep): string {
  // For step execution, build step-specific prompt
  if (step) {
    const stepDescription = step.description || '';
    const totalSteps = workItem.steps?.length || 1;
    const stepNumber = step.step_number + 1;

    return `
## Step ${stepNumber} of ${totalSteps}: ${step.title}

**Parent Task:** ${workItem.title}
**Priority:** ${workItem.priority}
**Work Item ID:** ${workItem.id}

### Step Description:
${stepDescription || 'Complete this step as described in the title.'}

### Context:
This is step ${stepNumber} of a ${totalSteps}-step task. Focus only on completing this specific step.
${step.dependencies && step.dependencies.length > 0 
  ? `\nThis step depends on: Step ${step.dependencies.map(d => d + 1).join(', ')} (already completed).` 
  : ''}

### Instructions:
1. Complete ONLY the work described for this step
2. Ensure the step's definition of done is met
3. Leave clear artifacts for subsequent steps
4. Report what you accomplished

### Constraints:
- Stay within scope of THIS STEP only
- Do not attempt work belonging to other steps
- Build on work from previous steps if applicable

### Output:
Provide a clear summary of:
- What was accomplished in this step
- Files created or modified
- Any setup needed for next steps
- Whether this step is complete
`.trim();
  }

  // For single-step tasks, use original prompt format
  const descriptionSection = workItem.description
    ? `\n**Description:** ${workItem.description}`
    : '';

  return `
## Task: ${workItem.title}

**Priority:** ${workItem.priority}
**Work Item ID:** ${workItem.id}${descriptionSection}

### Instructions:
Complete the task described above. Focus on:
1. Understanding the current state of the codebase
2. Making minimal, focused changes
3. Verifying your changes work correctly
4. Reporting what you accomplished

### Constraints:
- Stay within scope of the task
- Do not make unrelated changes
- If blocked, explain why and what's needed

### Output:
Provide a clear summary of:
- What changes were made
- What files were modified
- Any issues encountered
- Whether the task is complete
`.trim();
}

/**
 * Generate definition of done for a step or task
 */
function generateDefinitionOfDone(workItem: WorkItem, step?: WorkStep): string[] {
  // Use step description for DoD if available
  const text = step 
    ? `${step.title} ${step.description || ''}`.toLowerCase()
    : `${workItem.title} ${workItem.description || ''}`.toLowerCase();
  
  const dod: string[] = [];

  // Common requirements
  dod.push('All changes compile without TypeScript errors');
  dod.push('No new linting warnings introduced');

  // Task-specific requirements
  if (text.includes('test')) {
    dod.push('All tests pass');
    dod.push('Test coverage maintained or improved');
  }

  if (text.includes('fix') || text.includes('bug')) {
    dod.push('Bug is reproducible before fix');
    dod.push('Bug is resolved after fix');
    dod.push('Regression test added if applicable');
  }

  if (text.includes('feature') || text.includes('implement')) {
    dod.push('Feature works as described');
    dod.push('Edge cases handled');
    dod.push('Documentation updated if needed');
  }

  if (text.includes('refactor')) {
    dod.push('Behavior unchanged');
    dod.push('Code is cleaner/more maintainable');
    dod.push('Existing tests still pass');
  }

  if (text.includes('config') || text.includes('setup')) {
    dod.push('Configuration is valid');
    dod.push('System works with new configuration');
  }

  // Step-specific DoD additions
  if (step) {
    if (text.includes('research') || text.includes('plan')) {
      dod.push('Research findings documented');
      dod.push('Clear plan created for subsequent steps');
    }
    if (text.includes('initialize') || text.includes('setup')) {
      dod.push('Project structure created correctly');
      dod.push('Build system works');
    }
  }

  // Fallback if no specific matches
  if (dod.length === 2) {
    dod.push('Task objective achieved as described');
    dod.push('Changes are minimal and focused');
  }

  return dod;
}