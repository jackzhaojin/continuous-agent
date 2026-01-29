/**
 * PROMPT.md Parser - DETERMINISTIC
 * Parses PROMPT.md files with YAML frontmatter + markdown body
 */

import { readFile } from 'fs/promises';
import yaml from 'js-yaml';

export interface PromptMdFrontmatter {
  title: string;
  slug: string;
  status: string;
  priority?: string;
  complexity?: string;
  created?: string;
  tags?: string[];
  output_path?: string;
  branch?: string;
  source_project?: string;
  [key: string]: unknown;
}

export interface PromptMdFile {
  frontmatter: PromptMdFrontmatter;
  body: string;
  raw: string;
}

/**
 * Parse a PROMPT.md file into frontmatter + body
 */
export async function parsePromptMd(filePath: string): Promise<PromptMdFile> {
  const raw = await readFile(filePath, 'utf-8');
  return parsePromptMdContent(raw);
}

/**
 * Parse PROMPT.md content string
 */
export function parsePromptMdContent(content: string): PromptMdFile {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    // No frontmatter - treat entire content as body with defaults
    return {
      frontmatter: {
        title: 'Untitled',
        slug: 'untitled',
        status: 'pending',
      },
      body: content,
      raw: content,
    };
  }

  const frontmatterRaw = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  let frontmatter: PromptMdFrontmatter;
  try {
    const parsed = yaml.load(frontmatterRaw) as Record<string, unknown>;
    frontmatter = {
      title: String(parsed.title || 'Untitled'),
      slug: String(parsed.slug || 'untitled'),
      status: String(parsed.status || 'pending'),
      ...parsed,
    };
  } catch {
    frontmatter = {
      title: 'Untitled',
      slug: 'untitled',
      status: 'pending',
    };
  }

  return { frontmatter, body, raw: content };
}

/**
 * Update frontmatter in a PROMPT.md content string
 * Preserves the body, only modifies frontmatter values
 */
export function updateFrontmatter(
  content: string,
  updates: Partial<PromptMdFrontmatter>
): string {
  const parsed = parsePromptMdContent(content);
  const newFrontmatter = { ...parsed.frontmatter, ...updates };

  // Remove internal fields
  delete (newFrontmatter as Record<string, unknown>).raw;

  const yamlStr = yaml.dump(newFrontmatter, { lineWidth: -1, quotingType: '"' });
  return `---\n${yamlStr}---\n${parsed.body}`;
}
