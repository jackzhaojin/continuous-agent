/**
 * Per-agent defaults + tool configuration for the generic harness.
 *
 * Ported from generic-harness-v2026-01-v2/src/agents/runner.js AGENT_CONFIGS
 * plus DEFAULT_AGENT_MODELS. Tool arrays must remain byte-for-byte identical
 * to the JS harness — the prompts reference these exact tool names.
 */

import type { AgentWorkerVendor } from '../../core/vendor/types.js';

export type GenericAgentName =
  | 'spec-why'
  | 'spec-what'
  | 'spec-how'
  | 'spec-when'
  | 'research'
  | 'build'
  | 'validate';

export interface GenericAgentConfig {
  /** Prompt template name passed to loadPrompt(). */
  prompt: string;
  /** Claude-native tool names — mapped per-vendor at runtime. */
  tools: string[];
  /** Whether this agent benefits from Playwright MCP on web projects. */
  needsPlaywright: boolean;
}

export const GENERIC_AGENT_CONFIGS: Record<GenericAgentName, GenericAgentConfig> = {
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

/**
 * Default models per agent. These match JS harness defaults, kept here so
 * standalone runs work without env overrides. Executive-mode runs pass a
 * full `modelOverrides` map instead.
 */
export const DEFAULT_AGENT_MODELS: Record<GenericAgentName, string> = {
  'spec-why': 'claude-opus-4-5',
  'spec-what': 'claude-opus-4-5',
  'spec-how': 'claude-opus-4-5',
  'spec-when': 'claude-opus-4-5',
  research: 'claude-opus-4-5',
  build: 'claude-sonnet-4-5',
  validate: 'claude-sonnet-4-5',
};

/**
 * Resolve the model to use for an agent, given:
 *   1. explicit modelOverrides from HarnessRunConfig (caller wins)
 *   2. MODEL_<AGENTNAME> env var
 *   3. agent default
 *
 * The key lookup is case-insensitive on the agent name and treats dashes as
 * underscores: spec-why → MODEL_SPEC_WHY.
 */
export function resolveAgentModel(
  agent: GenericAgentName,
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

/**
 * Vendor-aware max-turns-per-agent. Kimi wire tends to over-report turns,
 * Claude SDK matches the intuitive definition, Codex is in-between.
 */
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
