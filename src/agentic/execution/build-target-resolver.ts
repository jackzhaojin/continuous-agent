import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { BuildTarget, WorkItem } from '../../core/types.js';

const DEFAULT_MONOREPO_BASE =
  process.env.AGENT_OUTPUTS_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox');
const DEFAULT_WORKTREE_REPO =
  process.env.AGENT_WORKTREE_REPO_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox-v2');
const DEFAULT_WORKTREE_PARENT =
  process.env.AGENT_WORKTREE_PARENT_PATH || path.join(os.homedir(), 'dev', 'ai-sandbox-v2-worktrees');

function inferSlug(workItem: WorkItem, fallback: string): string {
  if (workItem.target_dir) {
    const candidate = path.basename(workItem.target_dir.trim());
    if (candidate) return candidate;
  }
  if (workItem.id.startsWith('goal-')) return workItem.id.slice(5);
  if (workItem.id.startsWith('contract-')) return workItem.id.slice(9);
  return fallback;
}

export function resolveBuildTargetType(workItem: WorkItem): BuildTarget {
  if (workItem.build_target) return workItem.build_target;
  if (workItem.target_dir) return 'existing';
  return 'worktree';
}

export function resolveExistingTargetDir(targetDir: string): string {
  const resolved = path.resolve(targetDir);
  if (!existsSync(resolved)) {
    throw new Error(`target_dir does not exist: ${resolved}`);
  }
  return resolved;
}

export function resolveHarnessDefaultTarget(harnessName: string, slug: string): string {
  return path.join(DEFAULT_MONOREPO_BASE, 'harnesses', harnessName, slug);
}

export function ensureWorktreeTarget(workItem: WorkItem, fallbackSlug: string): string {
  if (!existsSync(DEFAULT_WORKTREE_REPO)) {
    throw new Error(
      `worktree repo not found: ${DEFAULT_WORKTREE_REPO}. Set AGENT_WORKTREE_REPO_PATH or create ai-sandbox-v2.`,
    );
  }

  const slug = inferSlug(workItem, fallbackSlug);
  const targetPath = path.join(DEFAULT_WORKTREE_PARENT, slug);
  if (existsSync(targetPath)) {
    return targetPath;
  }

  mkdirSync(DEFAULT_WORKTREE_PARENT, { recursive: true });
  const branch = workItem.target_branch?.trim() || `proj/${slug}`;

  execSync(
    `git -C ${shellQuote(DEFAULT_WORKTREE_REPO)} worktree add ${shellQuote(targetPath)} -b ${shellQuote(branch)}`,
    { stdio: 'pipe' },
  );
  return targetPath;
}

function shellQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

export const BUILD_TARGET_PATHS = {
  monorepoBase: DEFAULT_MONOREPO_BASE,
};
