import { readFile, readdir } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

export interface ParsedSkillDocument {
  frontmatter: Record<string, unknown>;
  body: string;
  sourcePath: string;
}

export async function findSkillMarkdownFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  results.sort();
  return results;
}

export async function parseSkillMarkdown(filePath: string): Promise<ParsedSkillDocument> {
  const raw = await readFile(filePath, 'utf-8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    return {
      frontmatter: {},
      body: raw,
      sourcePath: filePath,
    };
  }

  const frontmatterRaw = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const parsed = yaml.load(frontmatterRaw);
  const frontmatter = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;

  return {
    frontmatter,
    body,
    sourcePath: filePath,
  };
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
    .filter(Boolean);
}

export function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function toContextList(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) {
    return [];
  }

  const contextEntries: Array<Record<string, string>> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const normalized: Record<string, string> = {};
    for (const [key, raw] of Object.entries(item)) {
      if (!key) {
        continue;
      }
      normalized[key] = typeof raw === 'string' ? raw : String(raw ?? '');
    }

    if (Object.keys(normalized).length > 0) {
      contextEntries.push(normalized);
    }
  }

  return contextEntries;
}
