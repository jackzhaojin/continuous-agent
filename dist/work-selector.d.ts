export interface WorkItem {
    id: string;
    priority: 'P1' | 'P2' | 'P3';
    description: string;
    status: string;
}
/**
 * Select the next work item to execute
 * Returns the first unblocked item from the highest priority section
 */
export declare function selectWork(): Promise<WorkItem | null>;
/**
 * Get all work items (for debugging/status purposes)
 */
export declare function getAllWorkItems(): Promise<WorkItem[]>;
//# sourceMappingURL=work-selector.d.ts.map