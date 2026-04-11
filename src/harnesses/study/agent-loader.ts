/**
 * Study harness agent loader.
 *
 * Ported from study-harness-v2026-03-v1/src/skills/loader.js. Reads an
 * AGENT.md file from src/harnesses/study/agents/{name}/AGENT.md, parses its
 * YAML frontmatter (name, description, tools, model), and returns the prompt
 * body with {{VARIABLE}} placeholders substituted.
 *
 * Frontmatter parser is a tiny hand-rolled YAML reader — enough for
 * scalars and inline/block lists. No external js-yaml dependency. If a field
 * needs richer YAML, switch to js-yaml later.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveAgentsDir(): string {
  const sibling = join(HERE, 'agents');
  if (existsSync(sibling)) return sibling;
  const repoRoot = resolve(HERE, '..', '..', '..', '..');
  const srcFallback = join(repoRoot, 'src', 'harnesses', 'study', 'agents');
  if (existsSync(srcFallback)) return srcFallback;
  return sibling;
}

function resolveSkillsDir(): string {
  const sibling = join(HERE, 'skills');
  if (existsSync(sibling)) return sibling;
  const repoRoot = resolve(HERE, '..', '..', '..', '..');
  const srcFallback = join(repoRoot, 'src', 'harnesses', 'study', 'skills');
  if (existsSync(srcFallback)) return srcFallback;
  return sibling;
}

const AGENTS_DIR = resolveAgentsDir();
const SKILLS_DIR = resolveSkillsDir();

export interface StudyAgent {
  name: string;
  description: string;
  tools: string[];
  model: string | null;
  prompt: string;
}

export interface StudySkill {
  name: string;
  description: string;
  body: string;
}

/**
 * Parse a simple YAML frontmatter block. Supports:
 *   key: value
 *   key: [a, b, c]
 *   key:
 *     - a
 *     - b
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw || !raw.trim() || raw.trim().startsWith('#')) {
      i++;
      continue;
    }
    const m = raw.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const [, key, rest] = m;
    const value = rest.trim();
    if (value === '' || value === '|' || value === '>') {
      // Block list follows
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i] || '')) {
        items.push(lines[i]!.replace(/^\s*-\s+/, '').trim());
        i++;
      }
      out[key] = items;
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      out[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === 'true') {
      out[key] = true;
    } else if (value === 'false') {
      out[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      out[key] = Number(value);
    } else {
      out[key] = value.replace(/^['"]|['"]$/g, '');
    }
    i++;
  }
  return out;
}

function parseFrontmatterFile(content: string, filePath: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    throw new Error(`${filePath} must have YAML frontmatter between --- delimiters`);
  }
  return { meta: parseFrontmatter(m[1]), body: m[2].trim() };
}

function applyContext(prompt: string, context: Record<string, string>): string {
  let out = prompt;
  for (const [key, value] of Object.entries(context)) {
    out = out.replaceAll(`{{${key}}}`, value ?? '');
  }
  return out;
}

export async function loadAgent(
  agentName: string,
  context: Record<string, string> = {},
): Promise<StudyAgent> {
  const agentPath = join(AGENTS_DIR, agentName, 'AGENT.md');
  const content = await readFile(agentPath, 'utf-8');
  const { meta, body } = parseFrontmatterFile(content, agentPath);
  const tools = Array.isArray(meta.tools) ? (meta.tools as string[]) : [];
  return {
    name: (meta.name as string) || agentName,
    description: (meta.description as string) || '',
    tools,
    model: (meta.model as string) || null,
    prompt: applyContext(body, context),
  };
}

export async function loadSkill(skillName: string): Promise<StudySkill | null> {
  const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(skillPath)) return null;
  const content = await readFile(skillPath, 'utf-8');
  try {
    const { meta, body } = parseFrontmatterFile(content, skillPath);
    return {
      name: (meta.name as string) || skillName,
      description: (meta.description as string) || '',
      body,
    };
  } catch {
    return { name: skillName, description: '', body: content };
  }
}
