/**
 * Task Contractor - Creates task contracts from work items
 *
 * Transforms high-level work items from goals.md into detailed
 * task contracts that can be executed by worker agents.
 */
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
function estimateMaxTurns(workItem) {
    const description = workItem.description.toLowerCase();
    // Simple tasks: 10 turns
    if (description.includes('fix typo') ||
        description.includes('update version') ||
        description.includes('add comment') ||
        description.includes('rename')) {
        return 10;
    }
    // Medium complexity: 20 turns
    if (description.includes('refactor') ||
        description.includes('add test') ||
        description.includes('update config') ||
        description.includes('implement feature')) {
        return 20;
    }
    // Complex tasks: 30 turns
    if (description.includes('migrate') ||
        description.includes('rewrite') ||
        description.includes('architect') ||
        description.includes('design')) {
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
function generateDefinitionOfDone(workItem) {
    const description = workItem.description.toLowerCase();
    const dod = [];
    // Common requirements
    dod.push('All changes compile without TypeScript errors');
    dod.push('No new linting warnings introduced');
    // Task-specific requirements
    if (description.includes('test')) {
        dod.push('All tests pass');
        dod.push('Test coverage maintained or improved');
    }
    if (description.includes('fix') || description.includes('bug')) {
        dod.push('Bug is reproducible before fix');
        dod.push('Bug is resolved after fix');
        dod.push('Regression test added if applicable');
    }
    if (description.includes('feature') || description.includes('implement')) {
        dod.push('Feature works as described');
        dod.push('Edge cases handled');
        dod.push('Documentation updated if needed');
    }
    if (description.includes('refactor')) {
        dod.push('Behavior unchanged');
        dod.push('Code is cleaner/more maintainable');
        dod.push('Existing tests still pass');
    }
    if (description.includes('config') || description.includes('setup')) {
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
function determineAllowedTools(workItem) {
    const description = workItem.description.toLowerCase();
    // Tasks that might need web access
    if (description.includes('research') ||
        description.includes('docs') ||
        description.includes('documentation') ||
        description.includes('api') ||
        description.includes('dependency')) {
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
export function createTaskContract(workItem, reposAllowed = ['.']) {
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
function buildGoalPrompt(workItem) {
    return `
## Task: ${workItem.description}

**Priority:** ${workItem.priority}
**Work Item ID:** ${workItem.id}

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
//# sourceMappingURL=task-contractor.js.map