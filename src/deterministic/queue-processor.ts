import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

interface QueueParseResult {
  ready: string[];
  backlog: string[];
}

interface QueueIngestResult {
  ingested: string[];
  remainingReady: string[];
}

function parseQueue(content: string): QueueParseResult {
  const lines = content.split('\n');
  let section: 'ready' | 'backlog' | null = null;
  const ready: string[] = [];
  const backlog: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## Ready to Start')) {
      section = 'ready';
      continue;
    }
    if (trimmed.startsWith('## Backlog')) {
      section = 'backlog';
      continue;
    }
    if (trimmed.startsWith('## ') && !trimmed.startsWith('## Ready to Start') && !trimmed.startsWith('## Backlog')) {
      section = null;
      continue;
    }

    if (!section) {
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      const item = bulletMatch[1].trim();
      if (item && !item.includes('*None*')) {
        if (section === 'ready') {
          ready.push(item);
        } else {
          backlog.push(item);
        }
      }
    }
  }

  return { ready, backlog };
}

function buildQueueContent(original: string, remainingReady: string[]): string {
  const lines = original.split('\n');
  const updated: string[] = [];
  let section: 'ready' | 'backlog' | null = null;
  let insertedReady = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## Ready to Start')) {
      section = 'ready';
      updated.push(line);
      continue;
    }
    if (trimmed.startsWith('## Backlog')) {
      section = 'backlog';
      updated.push(line);
      continue;
    }
    if (trimmed.startsWith('## ') && !trimmed.startsWith('## Ready to Start') && !trimmed.startsWith('## Backlog')) {
      section = null;
      updated.push(line);
      continue;
    }

    if (section === 'ready') {
      if (trimmed.match(/^[-*]\s+/)) {
        continue;
      }
      if (!insertedReady && trimmed === '') {
        updated.push(line);
        if (remainingReady.length > 0) {
          for (const item of remainingReady) {
            updated.push(`- ${item}`);
          }
        } else {
          updated.push('- *None*');
        }
        insertedReady = true;
        remainingReady = [];
        continue;
      }
    }

    updated.push(line);
  }

  if (!insertedReady) {
    const insertIndex = updated.findIndex(line => line.trim().startsWith('## Ready to Start'));
    if (insertIndex >= 0) {
      const payload = remainingReady.length > 0
        ? remainingReady.map(item => `- ${item}`)
        : ['- *None*'];
      updated.splice(insertIndex + 1, 0, '', ...payload);
    }
  }

  return updated.join('\n');
}

export async function ingestQueueTasks(): Promise<QueueIngestResult> {
  const queuePath = path.join(process.cwd(), 'workspace', 'queue.md');
  if (!existsSync(queuePath)) {
    return { ingested: [], remainingReady: [] };
  }

  const content = await readFile(queuePath, 'utf-8');
  const parsed = parseQueue(content);
  const remainingReady: string[] = [];
  const ingested: string[] = [];

  for (const item of parsed.ready) {
    if (!ingested.includes(item)) {
      ingested.push(item);
    }
  }

  const updatedContent = buildQueueContent(content, remainingReady);
  if (updatedContent !== content) {
    await writeFile(queuePath, updatedContent, 'utf-8');
  }

  return { ingested, remainingReady };
}
