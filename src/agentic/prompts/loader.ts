/**
 * Prompt Loader
 *
 * Loads and renders Markdown prompts with YAML frontmatter.
 * Supports individual prompt versioning with symlink-based current versions.
 */

import fs from 'fs/promises';
import path from 'path';
import { logAgentic, log } from '../../core/logging.js';

// Prompts live in src/ (not compiled to dist/), so use project root
const PROMPTS_DIR = path.join(process.cwd(), 'src', 'agentic', 'prompts');

/**
 * Prompt metadata from YAML frontmatter
 */
export interface PromptMetadata {
  name: string;
  description: string;
  version: string;
  variables?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
  [key: string]: any;
}

/**
 * Loaded prompt with metadata and content
 */
export interface LoadedPrompt {
  metadata: PromptMetadata;
  content: string;
  filePath: string;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { metadata: PromptMetadata; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Prompt file must have YAML frontmatter');
  }

  const [, yamlContent, markdownContent] = match;

  // Simple YAML parser for our limited needs
  const metadata: any = {};
  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;
  let currentArray: any[] = [];
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item
    if (trimmed.startsWith('- ')) {
      if (inArray) {
        const item = trimmed.substring(2).trim();
        // Check if it's a key-value pair in array
        if (item.includes(':')) {
          const [key, value] = item.split(':').map(s => s.trim());
          const lastItem = currentArray[currentArray.length - 1];
          if (typeof lastItem === 'object') {
            lastItem[key] = value;
          } else {
            currentArray.push({ [key]: value });
          }
        } else {
          currentArray.push(item);
        }
      }
      continue;
    }

    // Key-value pair
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (value === '') {
        // Start of array or object
        currentKey = key;
        currentArray = [];
        inArray = true;
      } else {
        // Simple value
        metadata[key] = value;
        inArray = false;
      }
    } else if (currentKey && inArray) {
      // Indented content belongs to current key
      const indent = line.match(/^\s*/)?.[0].length || 0;
      if (indent > 0) {
        currentArray.push(trimmed);
      }
    }

    // Save array to metadata
    if (currentKey && inArray && currentArray.length > 0) {
      if (!trimmed.startsWith('-') && trimmed.includes(':')) {
        metadata[currentKey] = currentArray;
      }
    }
  }

  // Save any remaining array
  if (currentKey && inArray && currentArray.length > 0) {
    metadata[currentKey] = currentArray;
  }

  return {
    metadata: metadata as PromptMetadata,
    content: markdownContent.trim()
  };
}

/**
 * Render prompt template with variables
 *
 * Simple {{VARIABLE}} replacement
 */
export function renderPrompt(template: string, variables: Record<string, any>): string {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    rendered = rendered.replaceAll(placeholder, String(value));
  }

  // Check for unreplaced variables
  const unreplaced = rendered.match(/{{(\w+)}}/g);
  if (unreplaced) {
    const missing = unreplaced.map(v => v.slice(2, -2));
    throw new Error(`Missing variables: ${missing.join(', ')}`);
  }

  return rendered;
}

/**
 * Load a prompt by category and name
 *
 * Follows symlinks to get current version
 *
 * @param category - Prompt category (e.g., 'worker', 'research', 'retry')
 * @param name - Prompt name without version (e.g., 'worker-base')
 */
export async function loadPrompt(category: string, name: string): Promise<LoadedPrompt> {
  const promptDir = path.join(PROMPTS_DIR, category);
  const promptFile = path.join(promptDir, `${name}.md`);

  try {
    const content = await fs.readFile(promptFile, 'utf-8');
    const { metadata, content: markdownContent } = parseFrontmatter(content);

    // Log prompt loading
    logAgentic(`📜 PROMPT LOADED: ${category}/${name} (v${metadata.version || 'unknown'})`);

    return {
      metadata,
      content: markdownContent,
      filePath: promptFile
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      log(`❌ PROMPT NOT FOUND: ${category}/${name}.md`);
      throw new Error(`Prompt not found: ${category}/${name}.md`);
    }
    throw error;
  }
}

/**
 * Load and render a prompt in one step
 *
 * @param category - Prompt category
 * @param name - Prompt name
 * @param variables - Variables to substitute
 */
export async function loadAndRender(
  category: string,
  name: string,
  variables: Record<string, any>
): Promise<{ metadata: PromptMetadata; rendered: string }> {
  const prompt = await loadPrompt(category, name);

  // Validate required variables
  if (prompt.metadata.variables) {
    for (const varDef of prompt.metadata.variables) {
      if (typeof varDef === 'object' && varDef.required && !(varDef.name in variables)) {
        log(`❌ MISSING VARIABLE: ${varDef.name} for prompt ${category}/${name}`);
        throw new Error(`Missing required variable: ${varDef.name}`);
      }
    }
  }

  const rendered = renderPrompt(prompt.content, variables);
  log(`  ↳ Rendered with ${Object.keys(variables).length} variables (${rendered.length} chars)`);

  return {
    metadata: prompt.metadata,
    rendered
  };
}

/**
 * Compose multiple prompts together
 *
 * @param prompts - Array of [category, name, variables] tuples
 * @param separator - String to join prompts with
 */
export async function composePrompts(
  prompts: Array<[string, string, Record<string, any>]>,
  separator: string = '\n\n---\n\n'
): Promise<string> {
  const rendered: string[] = [];
  const promptNames = prompts.map(([cat, name]) => `${cat}/${name}`);

  logAgentic(`📚 COMPOSING ${prompts.length} PROMPTS: [${promptNames.join(', ')}]`);

  for (const [category, name, variables] of prompts) {
    const { rendered: content } = await loadAndRender(category, name, variables);
    rendered.push(content);
  }

  log(`  ✓ Composed ${rendered.length} prompts (${rendered.join('').length} chars total)`);

  return rendered.join(separator);
}

/**
 * List all available prompts in a category
 */
export async function listPrompts(category: string): Promise<string[]> {
  const promptDir = path.join(PROMPTS_DIR, category);

  try {
    const files = await fs.readdir(promptDir);
    return files
      .filter(f => f.endsWith('.md') && !f.includes('-v'))
      .map(f => f.replace('.md', ''));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
