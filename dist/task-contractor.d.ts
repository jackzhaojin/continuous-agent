/**
 * Task Contractor - Creates task contracts from work items
 *
 * Transforms high-level work items from goals.md into detailed
 * task contracts that can be executed by worker agents.
 */
import type { WorkItem } from './work-selector.js';
import type { TaskContract } from './types.js';
/**
 * Create a task contract from a work item
 *
 * @param workItem - The work item to create a contract for
 * @param reposAllowed - Optional list of repos the worker can access
 * @returns A complete task contract ready for worker execution
 */
export declare function createTaskContract(workItem: WorkItem, reposAllowed?: string[]): TaskContract;
//# sourceMappingURL=task-contractor.d.ts.map