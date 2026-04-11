/**
 * Per-agent defaults for the EDS harness. Same shape as generic, but:
 *   - No `spec` agent (4-agent pipeline only)
 *   - Build/validate always benefit from Playwright (EDS always produces web)
 *   - Tools match the JS EDS harness runner configs
 */

import type { AgentWorkerVendor } from '../../core/vendor/types.js';

export type EdsAgentName =
  | 'spec-why'
  | 'spec-what'
  | 'spec-how'
  | 'spec-when'
  | 'research'
  | 'build'
  | 'validate';

export interface EdsAgentConfig {
  prompt: string;
  tools: string[];
  /** EDS is always web — kept for shape compatibility with generic. */
  needsPlaywright: boolean;
}

export const EDS_AGENT_CONFIGS: Record<EdsAgentName, EdsAgentConfig> = {
  'spec-why': {
    prompt: 'plan/why',
    tools: ['Read', 'Write', 'Glob', 'Grep'],
    needsPlaywright: false,
  },
  'spec-what': {
    prompt: 'plan/what',
    tools: ['Read', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    needsPlaywright: false,
  },
  'spec-how': {
    prompt: 'plan/how',
    tools: ['Read', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    needsPlaywright: false,
  },
  'spec-when': {
    prompt: 'plan/when',
    tools: ['Read', 'Write', 'Glob', 'Grep'],
    needsPlaywright: false,
  },
  research: {
    prompt: 'research',
    tools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    needsPlaywright: false,
  },
  build: {
    prompt: 'build',
    tools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep'],
    needsPlaywright: true,
  },
  validate: {
    prompt: 'validate',
    tools: ['Read', 'Write', 'Glob', 'Grep', 'Bash'],
    needsPlaywright: true,
  },
};

export const DEFAULT_AGENT_MODELS: Record<EdsAgentName, string> = {
  'spec-why': 'claude-opus-4-5',
  'spec-what': 'claude-opus-4-5',
  'spec-how': 'claude-opus-4-5',
  'spec-when': 'claude-opus-4-5',
  research: 'claude-opus-4-5',
  build: 'claude-sonnet-4-5',
  validate: 'claude-sonnet-4-5',
};

export function resolveAgentModel(
  agent: EdsAgentName,
  overrides: Record<string, string>,
): string {
  const envKey = `MODEL_${agent.toUpperCase().replace(/-/g, '_')}`;
  return (
    overrides[envKey] ||
    overrides[agent] ||
    process.env[envKey] ||
    DEFAULT_AGENT_MODELS[agent]
  );
}

export function resolveMaxTurns(
  vendor: AgentWorkerVendor,
  configMax: number | undefined,
): number {
  if (configMax && configMax > 0) return configMax;
  switch (vendor) {
    case 'kimi':
    case 'kimi-wire':
      return 120;
    case 'kimi-cli':
      return 80;
    case 'codex':
      return 60;
    default:
      return 50;
  }
}
