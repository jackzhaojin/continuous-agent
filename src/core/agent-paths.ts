/**
 * Agent checkout location - DETERMINISTIC
 *
 * Defaults derive from where this checkout sits on disk instead of a fixed
 * `~/dev/<repo>` layout. Repos the agent works with (`ai-sandbox`,
 * `ai-sandbox-worktrees`) are expected next to it, e.g.
 * `~/dev/jackzhaojin/{continuous-agent,ai-sandbox,ai-sandbox-worktrees}`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/core/ (tsx) and dist/core/ (built) both sit two levels below the repo root.
const AGENT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Path to the agent repo (templates, ledgers, `claude-files-to-output/`,
 * `.env*`). Override with env var `AGENT_PATH`. Default: the checkout this
 * code runs from.
 */
export function getAgentPath(): string {
  return process.env.AGENT_PATH || AGENT_REPO_ROOT;
}

/**
 * Path to a repo that lives next to the agent checkout, e.g.
 * `getSiblingRepoPath('ai-sandbox')`. Anchored on this checkout, not on
 * `AGENT_PATH`, so overriding the agent path does not move the sandbox.
 */
export function getSiblingRepoPath(name: string): string {
  return path.join(path.dirname(AGENT_REPO_ROOT), name);
}
