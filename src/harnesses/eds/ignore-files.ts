/**
 * Ensure .gitignore and .hlxignore exclude test directories and AI artifacts.
 *
 * Ported from eds-site-builder-harness-v2026-01-v1/src/orchestrator.js
 * ensureIgnoreFiles(). AEM EDS's ingest reads the repo root and we do NOT want
 * ai-docs/ or .playwright-mcp/ to be built into the published site:
 *
 *   .gitignore: excludes .playwright-mcp only (ai-docs IS committed so
 *               branch reviewers can see the spec pipeline state)
 *   .hlxignore: excludes ai-docs/ AND .playwright-mcp (both hidden from
 *               the AEM EDS build)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface IgnoreUpdate {
  gitignore: boolean;
  hlxignore: boolean;
}

const GIT_PATTERNS = ['.playwright-mcp'];
const HLX_PATTERNS = ['ai-docs/', '.playwright-mcp'];

async function ensureFile(filepath: string, patterns: string[]): Promise<boolean> {
  let content = '';
  if (existsSync(filepath)) {
    try {
      content = await readFile(filepath, 'utf-8');
    } catch {
      content = '';
    }
  }

  let modified = false;
  for (const pattern of patterns) {
    if (!content.includes(pattern)) {
      content = content.trim() + (content.trim() ? '\n' : '') + pattern + '\n';
      modified = true;
    }
  }

  if (modified) {
    await writeFile(filepath, content);
  }
  return modified;
}

export async function ensureIgnoreFiles(codeDir: string): Promise<IgnoreUpdate> {
  const gitignorePath = join(codeDir, '.gitignore');
  const hlxignorePath = join(codeDir, '.hlxignore');
  const [gitignore, hlxignore] = await Promise.all([
    ensureFile(gitignorePath, GIT_PATTERNS),
    ensureFile(hlxignorePath, HLX_PATTERNS),
  ]);
  return { gitignore, hlxignore };
}
