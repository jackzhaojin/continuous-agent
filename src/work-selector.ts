import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface WorkItem {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  status: string;
}

interface ParsedSection {
  priority: 'P1' | 'P2' | 'P3';
  items: WorkItem[];
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
      currentPriority = 'P1';
      currentItem = null;
      continue;
    }
    if (trimmedLine.match(/^#{1,2}\s*P2\b/i)) {
      currentPriority = 'P2';
      currentItem = null;
      continue;
    }
    if (trimmedLine.match(/^#{1,2}\s*P3\b/i)) {
      currentPriority = 'P3';
      currentItem = null;
      continue;
    }

    // Check for Archive or other non-priority sections - stop parsing
    if (trimmedLine.match(/^#{1,2}\s*(Archive|Completed|Done)\b/i)) {
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
      currentItem = {
        id: `work-${itemCounter}`,
        priority: currentPriority,
        title: goalMatch[1].trim(),
        description: '',
        status: 'pending'
      };
      continue;
    }

    // Parse metadata lines under a goal
    if (currentItem) {
      // Status line: - **Status:** Not Started
      const statusMatch = trimmedLine.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        const statusText = statusMatch[1].toLowerCase().trim();
        if (statusText.includes('complete') || statusText.includes('done')) {
          currentItem.status = 'completed';
        } else if (statusText.includes('progress') || statusText.includes('wip') || statusText.includes('started')) {
          currentItem.status = 'in-progress';
        } else if (statusText.includes('block')) {
          currentItem.status = 'blocked';
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
 * Select the next work item to execute
 * Returns the first unblocked item from the highest priority section
 */
export async function selectWork(): Promise<WorkItem | null> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error reading goals.md:`, error instanceof Error ? error.message : error);
    return null;
  }
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
