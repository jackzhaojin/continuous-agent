/**
 * Goal Index Generator - DETERMINISTIC
 * Regenerates workspace/goals.md from the folder tree
 * goals.md becomes a read-only auto-generated index
 */

import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { parsePromptMd } from './prompt-md-parser.js';
import { log, logDeterministic } from '../core/logging.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');

interface GoalIndexEntry {
  title: string;
  status: string;
  sourcePath: string;
  outputPath?: string;
  priority?: string;
  steps?: { title: string; status: string }[];
  progress?: string;
}

/**
 * Scan a priority directory and collect goal entries
 */
async function scanPriorityDir(priorityDir: string, priority: string): Promise<GoalIndexEntry[]> {
  const entries: GoalIndexEntry[] = [];

  if (!existsSync(priorityDir)) return entries;

  try {
    const dirs = await readdir(priorityDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue;

      const promptPath = path.join(priorityDir, dir.name, 'PROMPT.md');
      if (!existsSync(promptPath)) continue;

      try {
        const parsed = await parsePromptMd(promptPath);
        const entry: GoalIndexEntry = {
          title: parsed.frontmatter.title || dir.name,
          status: parsed.frontmatter.status || 'pending',
          sourcePath: path.join(priorityDir, dir.name),
          outputPath: parsed.frontmatter.output_path as string | undefined,
          priority,
        };

        // Parse steps from body for progress display
        const stepMatches = parsed.body.match(/^#{3,4}\s+(?:Step\s+)?\d+[:.]\s*.+$/gim);
        if (stepMatches) {
          entry.steps = [];
          // Simple step count for index display
          const bodyLines = parsed.body.split('\n');
          let currentStepTitle = '';
          let currentStepStatus = 'pending';

          for (const line of bodyLines) {
            const stepMatch = line.trim().match(/^#{3,4}\s+(?:Step\s+)?(\d+)[:.]\s*(.+)$/i);
            if (stepMatch) {
              if (currentStepTitle) {
                entry.steps.push({ title: currentStepTitle, status: currentStepStatus });
              }
              currentStepTitle = stepMatch[2].trim();
              currentStepStatus = 'pending';
            }
            const statusMatch = line.trim().match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
            if (statusMatch && currentStepTitle) {
              currentStepStatus = statusMatch[1].trim().toLowerCase();
            }
          }
          if (currentStepTitle) {
            entry.steps.push({ title: currentStepTitle, status: currentStepStatus });
          }

          // Calculate progress
          const completed = entry.steps.filter(s => s.status.includes('complete')).length;
          const total = entry.steps.length;
          if (total > 0) {
            entry.progress = `Step ${completed + 1 > total ? total : completed + 1} of ${total}, ${Math.round((completed / total) * 100)}% complete`;
          }
        }

        entries.push(entry);
      } catch (err) {
        log(`  Warning: Failed to parse ${promptPath}: ${err}`);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return entries;
}

/**
 * Scan a simple state directory (drafts, blocked, ondeck)
 */
async function scanStateDir(dirPath: string, state: string): Promise<GoalIndexEntry[]> {
  const entries: GoalIndexEntry[] = [];

  if (!existsSync(dirPath)) return entries;

  try {
    const dirs = await readdir(dirPath, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue;

      const promptPath = path.join(dirPath, dir.name, 'PROMPT.md');
      if (!existsSync(promptPath)) continue;

      try {
        const parsed = await parsePromptMd(promptPath);
        entries.push({
          title: parsed.frontmatter.title || dir.name,
          status: state,
          sourcePath: path.join(dirPath, dir.name),
          outputPath: parsed.frontmatter.output_path as string | undefined,
        });
      } catch {
        // Skip unparseable entries
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return entries;
}

/**
 * Generate the goals.md index from the folder tree
 */
export async function generateGoalsIndex(): Promise<void> {
  logDeterministic('Regenerating goals.md index from folder tree...');

  const goalsPath = path.join(WORKSPACE_DIR, 'goals.md');

  // Collect entries from all state directories
  const p0Entries = await scanPriorityDir(path.join(WORKSPACE_DIR, 'in-progress', 'P0'), 'P0');
  const p1Entries = await scanPriorityDir(path.join(WORKSPACE_DIR, 'in-progress', 'P1'), 'P1');
  const p2Entries = await scanPriorityDir(path.join(WORKSPACE_DIR, 'in-progress', 'P2'), 'P2');
  const p3Entries = await scanPriorityDir(path.join(WORKSPACE_DIR, 'in-progress', 'P3'), 'P3');
  const p4Entries = await scanPriorityDir(path.join(WORKSPACE_DIR, 'in-progress', 'P4'), 'P4');
  const draftEntries = await scanStateDir(path.join(WORKSPACE_DIR, 'drafts'), 'draft');
  const ondeckEntries = await scanStateDir(path.join(WORKSPACE_DIR, 'ondeck'), 'ondeck');
  const blockedEntries = await scanStateDir(path.join(WORKSPACE_DIR, 'blocked'), 'blocked');

  // Check if any bundles exist - if not, skip regeneration to preserve legacy goals.md
  const totalEntries = p0Entries.length + p1Entries.length + p2Entries.length + p3Entries.length + p4Entries.length + draftEntries.length + ondeckEntries.length + blockedEntries.length;
  if (totalEntries === 0) {
    logDeterministic('  No goal bundles found - skipping goals.md regeneration (preserving legacy format)');
    return;
  }

  // Build markdown content
  const lines: string[] = [
    '# Strategic Goals (Auto-generated \u2014 edit PROMPT.md files, not this file)',
    '',
    `> Last updated: ${new Date().toISOString()}`,
    '',
  ];

  // P0 section
  if (p0Entries.length > 0) {
    lines.push('## P0 - Emergency Priority', '');
    for (const entry of p0Entries) {
      lines.push(...formatEntry(entry));
    }
  }

  // P1 section
  if (p1Entries.length > 0) {
    lines.push('## P1 - Critical Priority', '');
    for (const entry of p1Entries) {
      lines.push(...formatEntry(entry));
    }
  }

  // P2 section
  if (p2Entries.length > 0) {
    lines.push('## P2 - High Priority', '');
    for (const entry of p2Entries) {
      lines.push(...formatEntry(entry));
    }
  }

  // P3 section
  if (p3Entries.length > 0) {
    lines.push('## P3 - Normal Priority', '');
    for (const entry of p3Entries) {
      lines.push(...formatEntry(entry));
    }
  }

  // P4 section
  if (p4Entries.length > 0) {
    lines.push('## P4 - Low Priority', '');
    for (const entry of p4Entries) {
      lines.push(...formatEntry(entry));
    }
  }

  // Drafts section
  if (draftEntries.length > 0) {
    lines.push('## Drafts', '');
    for (const entry of draftEntries) {
      lines.push(`### ${entry.title}`);
      lines.push(`- **Source:** ${entry.sourcePath}`);
      lines.push(`- **Status:** Researching`);
      lines.push('');
    }
  }

  // On Deck section
  if (ondeckEntries.length > 0) {
    lines.push('## On Deck', '');
    for (const entry of ondeckEntries) {
      lines.push(`### ${entry.title}`);
      lines.push(`- **Source:** ${entry.sourcePath}`);
      lines.push(`- **Status:** Ready (awaiting priority assignment)`);
      lines.push('');
    }
  }

  // Blocked section
  if (blockedEntries.length > 0) {
    lines.push('## Blocked', '');
    for (const entry of blockedEntries) {
      lines.push(`### ${entry.title}`);
      lines.push(`- **Source:** ${entry.sourcePath}`);
      lines.push(`- **Status:** Blocked`);
      lines.push('');
    }
  }

  // Write the file
  const content = lines.join('\n') + '\n';
  await writeFile(goalsPath, content, 'utf-8');

  logDeterministic(`  goals.md regenerated with ${totalEntries} entries`);
}

/**
 * Format a goal entry for the index
 */
function formatEntry(entry: GoalIndexEntry): string[] {
  const lines: string[] = [];
  lines.push(`### ${entry.title}`);

  // Status with progress
  if (entry.progress) {
    lines.push(`- **Status:** In Progress (${entry.progress})`);
  } else {
    const statusDisplay = entry.status.charAt(0).toUpperCase() + entry.status.slice(1).replace('_', ' ');
    lines.push(`- **Status:** ${statusDisplay}`);
  }

  lines.push(`- **Source:** ${entry.sourcePath}`);

  if (entry.outputPath) {
    lines.push(`- **Output:** ${entry.outputPath}`);
  }

  lines.push('');
  return lines;
}
