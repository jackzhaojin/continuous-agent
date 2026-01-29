/**
 * Goals Index Generator - DETERMINISTIC
 *
 * Auto-generates workspace/goals.md from goal bundles.
 * Produces a clean checkbox list — human-readable at a glance.
 * Called during Phase 1 (Health Check) of every iteration.
 */

import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { parsePromptMd } from './prompt-md-parser.js';
import { log } from '../core/logging.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');
const GOALS_MD_PATH = path.join(WORKSPACE_DIR, 'goals.md');

interface GoalSummary {
  title: string;
  slug: string;
  priority: string;
  status: string;
  steps: { number: number; title: string; status: string }[];
}

/**
 * Regenerate workspace/goals.md from all goal bundles.
 */
export async function regenerateGoalsIndex(): Promise<void> {
  const goals: GoalSummary[] = [];

  // Scan in-progress by priority
  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    const dir = path.join(WORKSPACE_DIR, 'in-progress', priority);
    if (!existsSync(dir)) continue;

    for (const slug of await listDirs(dir)) {
      const goal = await readGoal(path.join(dir, slug), slug, priority);
      if (goal) goals.push(goal);
    }
  }

  // Scan blocked
  const blockedDir = path.join(WORKSPACE_DIR, 'blocked');
  if (existsSync(blockedDir)) {
    for (const slug of await listDirs(blockedDir)) {
      const goal = await readGoal(path.join(blockedDir, slug), slug, 'BLOCKED');
      if (goal) goals.push(goal);
    }
  }

  // Scan ondeck
  const ondeckDir = path.join(WORKSPACE_DIR, 'ondeck');
  if (existsSync(ondeckDir)) {
    for (const slug of await listDirs(ondeckDir)) {
      const goal = await readGoal(path.join(ondeckDir, slug), slug, 'ONDECK');
      if (goal) goals.push(goal);
    }
  }

  // Render
  const lines: string[] = ['# Goals', ''];

  // Group by priority
  const grouped = new Map<string, GoalSummary[]>();
  for (const g of goals) {
    const list = grouped.get(g.priority) || [];
    list.push(g);
    grouped.set(g.priority, list);
  }

  for (const [priority, group] of grouped) {
    lines.push(`## ${priority}`, '');
    for (const goal of group) {
      if (goal.steps.length > 0) {
        const done = goal.steps.filter(s => s.status === 'complete').length;
        const total = goal.steps.length;
        const allDone = done === total;
        const check = allDone ? 'x' : ' ';
        lines.push(`- [${check}] ${goal.title} — ${done}/${total} steps`);
        for (const step of goal.steps) {
          const sc = step.status === 'complete' ? 'x' : ' ';
          lines.push(`  - [${sc}] Step ${step.number}: ${step.title}`);
        }
      } else {
        const check = goal.status === 'complete' ? 'x' : ' ';
        lines.push(`- [${check}] ${goal.title}`);
      }
    }
    lines.push('');
  }

  if (goals.length === 0) {
    lines.push('*No goals. Add bundles to `workspace/ondeck/`.*', '');
  }

  await writeFile(GOALS_MD_PATH, lines.join('\n'), 'utf-8');
  log(`  Regenerated goals.md (${goals.length} goals)`);
}

async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

async function readGoal(goalDir: string, slug: string, priority: string): Promise<GoalSummary | null> {
  const promptPath = path.join(goalDir, 'PROMPT.md');
  if (!existsSync(promptPath)) return null;

  try {
    const { frontmatter, body } = await parsePromptMd(promptPath);
    return {
      title: frontmatter.title || slug,
      slug,
      priority: frontmatter.priority || priority,
      status: (frontmatter.status || 'pending').toLowerCase(),
      steps: parseSteps(body),
    };
  } catch {
    return null;
  }
}

function parseSteps(body: string): { number: number; title: string; status: string }[] {
  const steps: { number: number; title: string; status: string }[] = [];
  const lines = body.split('\n');
  let inSteps = false;
  let current: { number: number; title: string } | null = null;
  let currentStatus = 'pending';

  for (const line of lines) {
    const t = line.trim();
    if (t.match(/^##\s+Steps$/i)) { inSteps = true; continue; }
    if (inSteps && t.match(/^##\s+[^#]/)) { inSteps = false; break; }
    if (!inSteps) continue;

    const m = t.match(/^#{3,4}\s+(?:Step\s+)?(\d+)[:.]\s*(.+)$/i);
    if (m) {
      if (current) steps.push({ ...current, status: currentStatus });
      current = { number: parseInt(m[1], 10), title: m[2].trim() };
      currentStatus = 'pending';
      continue;
    }

    if (current) {
      const sm = t.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (sm) {
        const s = sm[1].toLowerCase();
        if (s.includes('complete') || s.includes('done')) currentStatus = 'complete';
        else if (s.includes('in progress') || s.includes('in_progress')) currentStatus = 'in_progress';
        else if (s.includes('block')) currentStatus = 'blocked';
        else currentStatus = 'pending';
      }
    }
  }

  if (current) steps.push({ ...current, status: currentStatus });
  return steps;
}
