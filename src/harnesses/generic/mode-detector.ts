/**
 * Mode detection + target-dir inspection helpers for the generic harness.
 *
 * Ported from generic-harness-v2026-01-v2/src/orchestrator.js helpers
 * (detectScenario, hasCompleteAIDocs, hasSignificantCode, detectSpecGaps,
 * isDirEmpty).
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { HarnessMode, HarnessModeType } from '../core/types.js';

const REQUIRED_SPEC_FILES = [
  'CONSTITUTION.md',
  'WHY_WHAT.md',
  'HOW.md',
  'TASKS.json',
];

const CODE_EXTENSIONS = /\.(js|ts|jsx|tsx|html|css|py|go|rs|java|c|cpp|h|hpp|rb|php|swift|kt)$/i;
const SKIPPED_SUBDIRS = new Set(['SPEC', 'TASKS', 'node_modules', '.git', 'ai-docs']);

export function hasCompleteAIDocs(docsDir: string): boolean {
  const specDir = join(docsDir, 'SPEC');
  return (
    REQUIRED_SPEC_FILES.every((f) => existsSync(join(specDir, f))) &&
    existsSync(join(specDir, 'STATUS.json'))
  );
}

export function detectSpecGaps(docsDir: string): { missing: string[]; hasStatus: boolean } {
  const specDir = join(docsDir, 'SPEC');
  const missing = REQUIRED_SPEC_FILES.filter((f) => !existsSync(join(specDir, f)));
  const hasStatus = existsSync(join(specDir, 'STATUS.json'));
  return { missing, hasStatus };
}

export async function isDirEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.length === 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw err;
  }
}

export async function hasSignificantCode(codeDir: string): Promise<boolean> {
  try {
    const entries = await readdir(codeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && SKIPPED_SUBDIRS.has(entry.name)) continue;
      if (entry.isFile() && CODE_EXTENSIONS.test(entry.name)) return true;
      if (entry.isDirectory()) {
        const sub = join(codeDir, entry.name);
        const subEntries = await readdir(sub).catch(() => [] as string[]);
        for (const name of subEntries) {
          if (CODE_EXTENSIONS.test(name)) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export interface ScenarioInfo {
  scenario: 1 | 2 | 3;
  mode: HarnessModeType;
  description: string;
}

export async function detectScenario(docsDir: string, codeDir: string): Promise<ScenarioInfo> {
  const hasCode = await hasSignificantCode(codeDir);
  const hasDocs = hasCompleteAIDocs(docsDir);
  if (!hasCode && !hasDocs) {
    return { scenario: 1, mode: 'bootstrap', description: 'New repo, zero AI files' };
  }
  if (hasCode && !hasDocs) {
    return { scenario: 2, mode: 'adopt', description: 'Existing code, generating AI docs' };
  }
  if (hasCode && hasDocs) {
    return {
      scenario: 3,
      mode: 'extend',
      description: 'Existing code + AI docs, adding features',
    };
  }
  return { scenario: 1, mode: 'bootstrap', description: 'Fallback to bootstrap' };
}

/**
 * HarnessOrchestrator.detectMode(): combines scenario detection with
 * STATUS.json inspection so the caller gets the same HarnessMode.type that
 * orchestrate() will ultimately use.
 */
export async function detectHarnessMode(
  targetDir: string,
  _promptFile: string,
): Promise<HarnessMode> {
  const docsDir = join(targetDir, 'ai-docs');
  const { hasStatus, missing } = detectSpecGaps(docsDir);
  const scenario = await detectScenario(docsDir, targetDir);

  if (hasStatus && missing.length === 0) {
    // STATUS.json exists and full spec suite is on disk — likely resume.
    return {
      type: 'resume',
      reason: 'STATUS.json + full SPEC present; will resume from last phase',
    };
  }

  return {
    type: scenario.mode,
    reason: `Scenario ${scenario.scenario}: ${scenario.description}`,
  };
}
