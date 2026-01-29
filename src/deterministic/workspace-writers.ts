import { readFile, writeFile, writeFile as writeFileAsync } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

export async function appendGoalsFromQueue(titles: string[], priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' = 'P4'): Promise<string[]> {
  const goalsPath = path.join(process.cwd(), 'workspace', 'goals.md');
  if (!existsSync(goalsPath) || titles.length === 0) {
    return [];
  }

  const content = await readFile(goalsPath, 'utf-8');
  const added: string[] = [];

  const alreadyExists = (title: string): boolean => {
    const titlePattern = new RegExp(`^###\\s+${escapeRegex(title)}\\s*$`, 'm');
    return titlePattern.test(content);
  };

  const newEntries = titles
    .filter(title => !alreadyExists(title))
    .map(title => {
      added.push(title);
      return [
        `### ${title}`,
        `- **Status:** Pending`,
        `- **Description:** Imported from queue.md (Ready to Start)`,
        `- **Success Criteria:** TBD`,
        `- **Dependencies:** None identified`,
        '',
      ].join('\n');
    })
    .join('\n');

  if (!newEntries) {
    return [];
  }

  const sectionPattern = new RegExp(`(##\\s+${priority}\\b[\\s\\S]*?)(\\n##\\s+|\\n##\\s+Archive|$)`, 'i');
  let updatedContent = content;

  if (sectionPattern.test(content)) {
    updatedContent = content.replace(sectionPattern, (match, sectionBody, sectionTail) => {
      const trimmedSection = sectionBody.trimEnd();
      return `${trimmedSection}\n\n${newEntries}${sectionTail}`;
    });
  } else {
    updatedContent = `${content.trimEnd()}\n\n## ${priority}\n\n${newEntries}`;
  }

  await writeFile(goalsPath, updatedContent, 'utf-8');
  return added;
}

export async function updateProgressOnStart(itemTitle: string, statusNote: string): Promise<void> {
  const progressPath = path.join(process.cwd(), 'workspace', 'progress.md');
  if (!existsSync(progressPath)) {
    return;
  }

  const content = await readFile(progressPath, 'utf-8');
  const today = new Date().toISOString();

  let updated = content;
  const activePattern = /(## Currently Active[\s\S]*?)(\n##\s+Recently Started)/i;
  if (activePattern.test(content)) {
    updated = updated.replace(activePattern, (_match, sectionHead, sectionTail) => {
      return `${sectionHead}\n- ${itemTitle} (${statusNote})\n${sectionTail}`;
    });
  }

  const recentPattern = /(\| Work Item \| Started \| Status \| Notes \|\n\|[-|]+\|)/i;
  if (recentPattern.test(updated)) {
    updated = updated.replace(recentPattern, `$1\n| ${itemTitle} | ${today} | ${statusNote} | |`);
  }

  await writeFile(progressPath, updated, 'utf-8');
}

export async function recordCompletion(itemTitle: string, outcome: string, relatedGoal?: string): Promise<void> {
  const completedPath = path.join(process.cwd(), 'workspace', 'completed.md');
  if (!existsSync(completedPath)) {
    return;
  }

  const content = await readFile(completedPath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  const goalText = relatedGoal || itemTitle;

  const tablePattern = /(\| Date \| Work Item \| Outcome \| Related Goal \|\n\|[-|]+\|)/i;
  let updated = content;

  if (tablePattern.test(content)) {
    updated = content.replace(tablePattern, `$1\n| ${today} | ${itemTitle} | ${outcome} | ${goalText} |`);
    updated = updated.replace(/\| \*None yet\* \| \| \| \|/, '');
  }

  await writeFile(completedPath, updated, 'utf-8');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a new goal bundle in drafts/
 * V1.2: New goals start as draft bundles instead of goals.md entries
 */
export async function createGoalBundle(
  title: string,
  description: string,
  targetDir: string = path.join(process.cwd(), 'workspace', 'drafts')
): Promise<string | null> {
  const slug = title
    .toLowerCase()
    .replace(/\[self-enhance\]\s*/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const goalDir = path.join(targetDir, slug);

  if (existsSync(goalDir)) {
    return null; // Already exists
  }

  mkdirSync(goalDir, { recursive: true });

  const promptContent = `---
title: "${title.replace(/"/g, '\\"')}"
slug: "${slug}"
status: pending
created: "${new Date().toISOString().split('T')[0]}"
---

## Description
${description}

## Definition of Done
- [ ] Task completed as described
- [ ] All code compiles and tests pass
- [ ] Changes committed to git with clean status

## Approach
TBD

## Agent Notes
<!-- Accumulated by agent during execution -->
`;

  await writeFileAsync(path.join(goalDir, 'PROMPT.md'), promptContent, 'utf-8');

  return goalDir;
}
