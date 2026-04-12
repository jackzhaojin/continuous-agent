/**
 * EDS prompt loader.
 *
 * Same shape as the generic prompt loader but rooted at src/harnesses/eds/prompts/.
 * EDS prompts include AEM/EDS block-specific instructions and can't be swapped
 * with generic prompts.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolvePromptsDir(): string {
  const sibling = join(HERE, 'prompts');
  if (existsSync(sibling)) return sibling;
  const repoRoot = resolve(HERE, '..', '..', '..', '..');
  const srcFallback = join(repoRoot, 'src', 'harnesses', 'eds', 'prompts');
  if (existsSync(srcFallback)) return srcFallback;
  return sibling;
}

const PROMPTS_DIR = resolvePromptsDir();

const PROMPT_FILES: Record<string, string> = {
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
  return readFile(join(PROMPTS_DIR, filename), 'utf-8');
}

export async function loadPrompt(
  name: string,
  context: Record<string, string> = {},
): Promise<string> {
  let template = await loadPromptFile(name);
  for (const [key, value] of Object.entries(context)) {
    template = template.replaceAll(`{{${key}}}`, value ?? '');
  }
  return template;
}
