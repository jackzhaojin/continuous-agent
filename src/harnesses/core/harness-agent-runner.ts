/**
 * Vendor-agnostic agent runner for harnesses.
 *
 * Replaces direct `query()` calls from `@anthropic-ai/claude-agent-sdk`.
 * Every harness (generic, eds, study) invokes agents exclusively through
 * this wrapper so that Claude / Codex / Kimi parity is maintained in one
 * codepath.
 *
 * Responsibilities:
 *   1. Adapt the prompt for the target vendor (skill/CLAUDE.md injection + tool
 *      name rewriting via vendor-adapter.ts).
 *   2. Map Claude-native tool names to the vendor's native names.
 *   3. Call provider.spawn() and yield back a normalized stream plus an
 *      accumulated result record compatible with the JS harness's SubagentResult
 *      shape (output, success, handoff).
 */

import type { AgentWorkerMessage } from '../../core/vendor/types.js';
import { adaptPromptForVendor, mapToolNames } from '../../agentic/intelligence/vendor-adapter.js';
import type { RunHarnessAgentArgs } from './types.js';

export interface HarnessAgentResult {
  agentName: string;
  success: boolean;
  output: string;
  /** Parsed JSON handoff block extracted from the last ```json fenced block. */
  handoff: Record<string, unknown> | null;
  modelUsed: string;
  errors: string[];
  durationMs: number;
  /** Raw messages from the provider (for transcript logging). */
  messages: AgentWorkerMessage[];
}

/**
 * Execute one agent invocation against the configured vendor.
 *
 * Mirrors the semantics of `runSubagent()` in the JS generic harness:
 *   - Accumulates `text` across all assistant messages.
 *   - On a `result` message, captures resultSuccess and any errors.
 *   - Extracts the LAST ```json fenced block as the authoritative handoff.
 *
 * This function does NOT write prompt output files — the orchestrator is
 * responsible for persisting `result.output` + handoff JSON to disk so the
 * write layout can differ between harnesses.
 */
export async function runHarnessAgent(args: RunHarnessAgentArgs): Promise<HarnessAgentResult> {
  const {
    agentName,
    promptMarkdown,
    model,
    cwd,
    allowedTools,
    maxTurns,
    provider,
    vendor,
    skillBodies,
    claudeMdContent,
  } = args;

  const adaptedPrompt = adaptPromptForVendor(promptMarkdown, vendor, {
    skillBodies,
    claudeMdContent,
  });
  const adaptedTools = mapToolNames(allowedTools, vendor);

  const result: HarnessAgentResult = {
    agentName,
    success: false,
    output: '',
    handoff: null,
    modelUsed: model,
    errors: [],
    durationMs: 0,
    messages: [],
  };

  const startedAt = Date.now();

  try {
    const stream = provider.spawn({
      prompt: adaptedPrompt,
      model,
      maxTurns,
      cwd,
      allowedTools: adaptedTools,
      settingSources: vendor === 'claude' ? ['user', 'project'] : undefined,
    });

    for await (const msg of stream) {
      result.messages.push(msg);
      if (msg.type === 'assistant' && msg.text) {
        result.output += msg.text;
      } else if (msg.type === 'result') {
        if (typeof msg.text === 'string' && msg.text.length > 0 && result.output.length === 0) {
          // Only use result text if we didn't accumulate any assistant text.
          // Kimi/Codex result messages contain a summary line (e.g. "Kimi CLI
          // exited with code 0") which would overwrite the real output and
          // destroy the handoff JSON block needed by extractHandoffJson().
          result.output = msg.text;
        }
        result.success = msg.resultSuccess === true;
        if (msg.resultErrors && msg.resultErrors.length > 0) {
          result.errors.push(...msg.resultErrors);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    result.success = false;
  }

  result.durationMs = Date.now() - startedAt;
  result.handoff = extractHandoffJson(result.output);
  return result;
}

/**
 * Extract the LAST fenced ```json block from an agent's output. Matches the
 * JS harness behaviour — agents may emit multiple JSON blocks mid-output, but
 * only the final one is authoritative (the structured handoff).
 */
export function extractHandoffJson(output: string): Record<string, unknown> | null {
  if (!output) return null;
  const matches = output.match(/```json\s*\n([\s\S]*?)```/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const inner = last.match(/```json\s*\n([\s\S]*?)```/);
  if (!inner) return null;
  try {
    return JSON.parse(inner[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Port of the JS harness `didPass()` helper — determines whether an agent
 * outcome counts as a pass.
 *
 * Order of precedence:
 *   1. handoff.result === 'fail'  → false
 *   2. handoff.result === 'pass'  → true
 *   3. handoff.result === true    → true
 *   4. handoff.success === true   → true
 *   5. provider-level success     → true
 *   6. output contains `"result": "pass"` substring → true
 *   7. otherwise → false
 */
export function didAgentPass(result: HarnessAgentResult): boolean {
  const handoff = result.handoff as { result?: unknown; success?: unknown } | null;
  const handoffResult = handoff?.result;
  if (typeof handoffResult === 'string') {
    if (handoffResult.toLowerCase() === 'fail') return false;
    if (handoffResult.toLowerCase() === 'pass') return true;
  }
  if (handoffResult === true) return true;
  if (handoff?.success === true) return true;
  if (result.success === true) return true;

  const lowered = (result.output || '').toLowerCase();
  if (lowered.includes('authentication_error') || lowered.includes('invalid bearer token')) {
    return false;
  }
  if (/"result"\s*:\s*"pass"/i.test(result.output || '')) return true;
  return false;
}
