/**
 * Execution Pattern Resolver — DETERMINISTIC
 *
 * Resolves the effective execution_pattern for a work item using precedence:
 *   PROMPT.md override > playbook default > system default (plan-then-execute)
 *
 * This is a pure deterministic module — no LLM calls, no side effects beyond logging.
 */

import type { ExecutionPattern, WorkItem } from '../core/types.js';
import { logDeterministic } from '../core/logging.js';
import type { PlaybookDefinition } from './library-loader-types.js';

/** System default when no override or playbook is matched */
const SYSTEM_DEFAULT_PATTERN: ExecutionPattern = 'plan-then-execute';

/** Valid execution patterns (used for runtime validation) */
const VALID_PATTERNS: ExecutionPattern[] = [
  'plan-then-execute',
  'loop-until-progress',
  'plan-mode',
  'deterministic-pipeline',
  'harness',
];

export interface PatternResolution {
  /** The resolved effective pattern */
  pattern: ExecutionPattern;
  /** How the pattern was determined */
  source: 'prompt-override' | 'playbook-default' | 'system-default';
  /** Human-readable explanation */
  reason: string;
}

/**
 * Check whether a string is a valid ExecutionPattern.
 */
function isValidPattern(value: unknown): value is ExecutionPattern {
  return typeof value === 'string' && VALID_PATTERNS.includes(value as ExecutionPattern);
}

/**
 * Resolve the effective execution pattern for a work item.
 *
 * Precedence:
 *   1. `item.execution_pattern` (from PROMPT.md frontmatter override)
 *   2. `matchedPlaybook.execution_pattern` (playbook default)
 *   3. System default: `plan-then-execute`
 *
 * @param item     The work item (may carry an execution_pattern override from PROMPT.md)
 * @param playbook Optional matched playbook whose default pattern applies if no override
 */
export function resolveExecutionPattern(
  item: WorkItem,
  playbook?: PlaybookDefinition | null,
): PatternResolution {
  // 1. PROMPT.md override (highest precedence)
  if (item.execution_pattern && isValidPattern(item.execution_pattern)) {
    const resolution: PatternResolution = {
      pattern: item.execution_pattern,
      source: 'prompt-override',
      reason: `PROMPT.md frontmatter sets execution_pattern="${item.execution_pattern}"`,
    };
    logDeterministic(`[pattern-resolver] ${resolution.reason} (source: ${resolution.source})`);
    return resolution;
  }

  // 2. Playbook default
  if (playbook?.execution_pattern && isValidPattern(playbook.execution_pattern)) {
    const resolution: PatternResolution = {
      pattern: playbook.execution_pattern,
      source: 'playbook-default',
      reason: `Playbook "${playbook.name}" sets execution_pattern="${playbook.execution_pattern}"`,
    };
    logDeterministic(`[pattern-resolver] ${resolution.reason} (source: ${resolution.source})`);
    return resolution;
  }

  // 3. System default
  const resolution: PatternResolution = {
    pattern: SYSTEM_DEFAULT_PATTERN,
    source: 'system-default',
    reason: `No override or playbook match — using system default "${SYSTEM_DEFAULT_PATTERN}"`,
  };
  logDeterministic(`[pattern-resolver] ${resolution.reason} (source: ${resolution.source})`);
  return resolution;
}
