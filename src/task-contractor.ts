/**
 * Task Contractor - Creates task contracts from work items
 *
 * Transforms high-level work items from goals.md into detailed
 * task contracts that can be executed by worker agents.
 */

import type { WorkItem } from './work-selector.js';
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

/**
 * Determine the appropriate max_turns based on task complexity
 */
function estimateMaxTurns(workItem: WorkItem): number {
  // Use both title and description for keyword analysis
  const text = `${workItem.title} ${workItem.description}`.toLowerCase();

  // Simple tasks: 10 turns
  if (
    text.includes('fix typo') ||
    text.includes('update version') ||
    text.includes('add comment') ||
    text.includes('rename')
  ) {
    return 10;
  }

  // Medium complexity: 20 turns
  if (
    text.includes('refactor') ||
    text.includes('add test') ||
    text.includes('update config') ||
    text.includes('implement feature')
  ) {
    return 20;
  }

  // Complex tasks: 30 turns
  if (
    text.includes('migrate') ||
    text.includes('rewrite') ||
    text.includes('architect') ||
    text.includes('design') ||
    text.includes('build') ||
    text.includes('app') ||
    text.includes('integration')
  ) {
    return 30;
  }

  // Default based on priority
  switch (workItem.priority) {
    case 'P1':
      return 25;
    case 'P2':
      return 20;
    case 'P3':
      return 15;
    default:
      return 20;
  }
}

/**
 * Generate definition of done based on work type
 */
function generateDefinitionOfDone(workItem: WorkItem): string[] {
  // Use both title and description for keyword analysis
  const text = `${workItem.title} ${workItem.description}`.toLowerCase();
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

  // Fallback if no specific matches
  if (dod.length === 2) {
    dod.push('Task objective achieved as described');
    dod.push('Changes are minimal and focused');
  }

  return dod;
}

/**
 * Determine which tools to allow based on task type
 */
function determineAllowedTools(workItem: WorkItem): string[] {
  // Use both title and description for keyword analysis
  const text = `${workItem.title} ${workItem.description}`.toLowerCase();

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
 * @returns A complete task contract ready for worker execution
 */
export function createTaskContract(
  workItem: WorkItem,
  reposAllowed: string[] = ['.']
): TaskContract {
  const taskId = `task-${randomUUID().slice(0, 8)}`;

  return {
    id: taskId,
    goal: buildGoalPrompt(workItem),
    scope: {
      repos_allowed: reposAllowed,
      tools_allowed: determineAllowedTools(workItem),
    },
    definition_of_done: generateDefinitionOfDone(workItem),
    max_turns: estimateMaxTurns(workItem),
    created_at: new Date().toISOString(),
  };
}

/**
 * Build a clear goal prompt from the work item
 */
function buildGoalPrompt(workItem: WorkItem): string {
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
