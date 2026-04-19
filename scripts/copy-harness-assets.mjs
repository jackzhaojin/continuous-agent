#!/usr/bin/env node
/**
 * Mirror non-TypeScript assets from src/ to dist/ after tsc.
 *
 * Why: harness prompt loaders read .md templates with paths resolved relative
 * to their compiled .js (e.g. dist/harnesses/generic/prompts/plan/why_prompt.md).
 * tsc only emits .js/.d.ts/.map; without this step the prompts go missing in
 * dist/ and the harness fails at first phase with ENOENT.
 *
 * Mirrors the tsconfig.json `exclude` list for fixture/reference dirs we
 * don't want to ship.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const EXCLUDE_PREFIXES = [
  join(SRC, 'harnesses/study/agents'),
  join(SRC, 'harnesses/study/skills'),
  join(SRC, 'harnesses/eds/prompts/reference'),
];

const ASSET_EXTS = new Set(['.md', '.json', '.txt', '.yml', '.yaml']);

function isExcluded(absPath) {
  return EXCLUDE_PREFIXES.some((prefix) => absPath === prefix || absPath.startsWith(prefix + '/'));
}

let copied = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (isExcluded(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs);
      continue;
    }
    const dot = entry.lastIndexOf('.');
    if (dot < 0) continue;
    const ext = entry.slice(dot).toLowerCase();
    if (!ASSET_EXTS.has(ext)) continue;
    const rel = relative(SRC, abs);
    const dest = join(DIST, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(abs, dest);
    copied++;
  }
}

if (!existsSync(DIST)) {
  mkdirSync(DIST, { recursive: true });
}
walk(SRC);
console.log(`Copied ${copied} asset file(s) from src/ to dist/`);
