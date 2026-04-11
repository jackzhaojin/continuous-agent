/**
 * Prompt template loader for the generic harness.
 *
 * Ported from generic-harness-v2026-01-v2/src/prompts/loader.js. Prompt files
 * live alongside this module at ./prompts/*.md and contain `{{VAR}}` tokens
 * that are replaced with values from the context map.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the prompts directory. In tsx/dev mode the prompts sit next to this
 * source file. In a compiled dist build the .js is under dist/ but the prompts
 * remain in src/ (we don't currently copy them on build). Try the sibling
 * `prompts/` first, then fall back to the src/-relative location.
 */
function resolvePromptsDir(): string {
  const sibling = join(HERE, 'prompts');
  if (existsSync(sibling)) return sibling;
  // Walk up from dist/harnesses/generic/ to repo root, then src/harnesses/generic/prompts/
  const repoRoot = resolve(HERE, '..', '..', '..', '..');
  const srcFallback = join(repoRoot, 'src', 'harnesses', 'generic', 'prompts');
  if (existsSync(srcFallback)) return srcFallback;
  return sibling; // let readFile throw with a path users can diagnose
}

const PROMPTS_DIR = resolvePromptsDir();

const PROMPT_FILES: Record<string, string> = {
  spec: 'spec_prompt.md',
  'plan/why': 'plan/why_prompt.md',
  'plan/what': 'plan/what_prompt.md',
  'plan/how': 'plan/how_prompt.md',
  'plan/when': 'plan/when_prompt.md',
  research: 'task/research_prompt.md',
  build: 'task/build_prompt.md',
  validate: 'task/validate_prompt.md',
};

export async function loadPromptFile(name: string): Promise<string> {
  const filename = PROMPT_FILES[name];
  if (!filename) {
    throw new Error(
      `Unknown prompt: ${name}. Valid prompts: ${Object.keys(PROMPT_FILES).join(', ')}`,
    );
  }
  const fullPath = join(PROMPTS_DIR, filename);
  return readFile(fullPath, 'utf-8');
}

export async function loadPrompt(
  name: string,
  context: Record<string, string> = {},
): Promise<string> {
  let template = await loadPromptFile(name);
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    template = template.replaceAll(placeholder, value ?? '');
  }
  return template;
}
