import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
/**
 * Parse a goals.md file and extract work items by priority
 */
function parseGoalsFile(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentPriority = null;
    let itemCounter = 0;
    for (const line of lines) {
        const trimmedLine = line.trim();
        // Check for priority section headers
        if (trimmedLine.match(/^#+\s*P1\b/i) || trimmedLine.match(/^P1\s*[-:]/i)) {
            currentPriority = 'P1';
            continue;
        }
        if (trimmedLine.match(/^#+\s*P2\b/i) || trimmedLine.match(/^P2\s*[-:]/i)) {
            currentPriority = 'P2';
            continue;
        }
        if (trimmedLine.match(/^#+\s*P3\b/i) || trimmedLine.match(/^P3\s*[-:]/i)) {
            currentPriority = 'P3';
            continue;
        }
        // Skip if not in a priority section
        if (!currentPriority)
            continue;
        // Parse list items (- [ ] or - [x] or just -)
        const listMatch = trimmedLine.match(/^[-*]\s*(\[[ x]\])?\s*(.+)$/i);
        if (listMatch) {
            const checkbox = listMatch[1] || '';
            const description = listMatch[2].trim();
            // Determine status from checkbox
            let status = 'pending';
            if (checkbox.toLowerCase() === '[x]') {
                status = 'completed';
            }
            else if (description.toLowerCase().includes('blocked')) {
                status = 'blocked';
            }
            else if (description.toLowerCase().includes('in progress') || description.toLowerCase().includes('wip')) {
                status = 'in-progress';
            }
            itemCounter++;
            // Find or create section for this priority
            let section = sections.find(s => s.priority === currentPriority);
            if (!section) {
                section = { priority: currentPriority, items: [] };
                sections.push(section);
            }
            section.items.push({
                id: `work-${itemCounter}`,
                priority: currentPriority,
                description,
                status
            });
        }
    }
    // Sort sections by priority (P1 first, then P2, then P3)
    sections.sort((a, b) => {
        const priorityOrder = { P1: 1, P2: 2, P3: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    return sections;
}
/**
 * Select the next work item to execute
 * Returns the first unblocked item from the highest priority section
 */
export async function selectWork() {
    const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');
    // Check if goals file exists
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
        // Find first unblocked, non-completed item from highest priority
        for (const section of sections) {
            for (const item of section.items) {
                if (item.status !== 'completed' && item.status !== 'blocked') {
                    return item;
                }
            }
        }
        console.log(`[${new Date().toISOString()}] All work items are either completed or blocked`);
        return null;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] Error reading goals.md:`, error instanceof Error ? error.message : error);
        return null;
    }
}
/**
 * Get all work items (for debugging/status purposes)
 */
export async function getAllWorkItems() {
    const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');
    if (!existsSync(goalsPath)) {
        return [];
    }
    try {
        const content = await readFile(goalsPath, 'utf-8');
        const sections = parseGoalsFile(content);
        return sections.flatMap(s => s.items);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=work-selector.js.map