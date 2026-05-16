/**
 * Agentic test harness — runs an Agent SDK `query()` driven by a skill prompt,
 * captures the streamed messages into a structured trace, and returns it.
 *
 * See ./README.md for the design rationale (3-layer assertion model, no
 * external framework). This module is pure plumbing.
 *
 * Usage:
 *   const result = await runAgenticTest({
 *     skill: 'memory-hook-post-run-harvest',
 *     vars: { CONTEXT_JSON: JSON.stringify(ctx) },
 *     scope: { app_id: TEST_APP_ID },
 *     options: { model, mcpServers, allowedTools, ... },
 *   });
 *   expectSkillCalled(result, 'memory-harvester');
 *   await expectMem0MemoryExists(result.capturedMemoryId);
 */

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadSkillPrompt } from "../../src/agentic/intelligence/skill-prompt-loader.js";

export interface AgenticTestOptions {
  /** Skill name under `.claude/skills/` — loaded via loadSkillPrompt(). */
  skill: string;
  /** Variables for {{VAR}} placeholder substitution in the skill body. */
  vars?: Record<string, string>;
  /** Test scope (informational; cleanup helpers consume this). */
  scope?: { app_id?: string; user_id?: string; run_id?: string };
  /** Forwarded to Agent SDK query() options. */
  options: {
    model?: string;
    maxTurns?: number;
    mcpServers?: Record<string, unknown>;
    allowedTools?: string[];
    settingSources?: ("user" | "project")[];
    /** Pass extra raw options through. */
    [k: string]: unknown;
  };
  /** Echo `[tool_use]` lines to console as the run progresses. Default false. */
  verbose?: boolean;
}

export interface ToolCallTrace {
  /** Tool name, e.g. "Bash", "mcp__mem0__search_memories", "Skill". */
  name: string;
  /** Input JSON as passed to the tool. */
  input: unknown;
  /** Index in the stream (1-based) for ordering. */
  index: number;
  /** ms since test start when this tool_use block appeared. */
  ms: number;
}

export interface AgenticTestResult {
  /** Skill name that was invoked. */
  skill: string;
  /** Final assistant text (subtype:"success" result message). May be empty if run errored. */
  finalText: string;
  /** Ordered tool calls from the stream. */
  toolCalls: ToolCallTrace[];
  /** Skill names extracted from Skill-tool calls (one per `Skill` tool_use). */
  skillsInvoked: string[];
  /** Raw SDK messages — keep for advanced introspection / debugging. */
  messages: SDKMessage[];
  /** Total wall-clock duration in ms. */
  durationMs: number;
  /** Whether the SDK reported a `result` message with subtype "success". */
  succeeded: boolean;
  /** If the agent's tool calls produced a memory_id (parsed from Bash → harvest.ts output). */
  capturedMemoryId?: string;
  /** Any captured event IDs from harvest tool results. */
  capturedEventIds: string[];
  /** Errors observed in the stream (does not include thrown exceptions — those propagate). */
  errors: string[];
}

/**
 * Drive a single agentic turn from a skill prompt + vars.
 *
 * Captures the message stream into a structured trace that the assertion
 * helpers in ./assertions.ts can inspect.
 */
export async function runAgenticTest(
  opts: AgenticTestOptions,
): Promise<AgenticTestResult> {
  const t0 = Date.now();
  const prompt = await loadSkillPrompt(opts.skill, opts.vars ?? {});

  const messages: SDKMessage[] = [];
  const toolCalls: ToolCallTrace[] = [];
  const skillsInvoked: string[] = [];
  const errors: string[] = [];
  const capturedEventIds: string[] = [];
  let capturedMemoryId: string | undefined;
  let finalText = "";
  let succeeded = false;
  let toolIdx = 0;

  // settingSources: ['user', 'project'] is REQUIRED for the SDK to discover
  // `.claude/skills/`. See .claude/rules/reference-pocs.md.
  const queryOpts = {
    ...opts.options,
    settingSources: opts.options.settingSources ?? ["user", "project"],
  } as Parameters<typeof query>[0]["options"];

  const stream = query({ prompt, options: queryOpts });

  for await (const message of stream) {
    const msg = message as SDKMessage;
    messages.push(msg);

    if (msg.type === "assistant" && "message" in msg) {
      const inner = (msg as { message: { content?: unknown[] } }).message;
      for (const block of inner.content ?? []) {
        const b = block as { type?: string; name?: string; input?: unknown };
        if (b.type === "tool_use") {
          toolIdx++;
          const trace: ToolCallTrace = {
            name: b.name ?? "(unknown)",
            input: b.input,
            index: toolIdx,
            ms: Date.now() - t0,
          };
          toolCalls.push(trace);

          // If it's a Skill tool call, extract the skill name from input.
          if (trace.name === "Skill" && typeof b.input === "object" && b.input) {
            const skill = (b.input as { skill?: string; name?: string }).skill
              ?? (b.input as { skill?: string; name?: string }).name;
            if (skill) skillsInvoked.push(skill);
          }

          if (opts.verbose) {
            const preview = JSON.stringify(b.input).slice(0, 180);
            console.log(`  [tool_use #${toolIdx}] ${trace.name}  ${preview}`);
          }
        }
      }
    }

    if (msg.type === "user" && "message" in msg) {
      const inner = (msg as { message: { content?: unknown[] } }).message;
      for (const block of inner.content ?? []) {
        const b = block as { type?: string; content?: unknown; is_error?: boolean };
        if (b.type === "tool_result") {
          // Capture memory_id / eventId from any tool_result content (parsing
          // the harvest.ts stdout JSON if present).
          const raw = typeof b.content === "string"
            ? b.content
            : JSON.stringify(b.content);
          tryCaptureFromHarvestOutput(raw, (memId, evId) => {
            if (memId && !capturedMemoryId) capturedMemoryId = memId;
            if (evId) capturedEventIds.push(evId);
          });
          if (b.is_error) {
            errors.push(`tool_result error: ${raw.slice(0, 200)}`);
          }
        }
      }
    }

    if (msg.type === "result") {
      const r = msg as { subtype?: string; result?: string; is_error?: boolean };
      if (r.subtype === "success" && typeof r.result === "string") {
        finalText = r.result;
        succeeded = true;
      }
      if (r.is_error) {
        errors.push(`result error subtype: ${r.subtype}`);
      }
    }
  }

  return {
    skill: opts.skill,
    finalText,
    toolCalls,
    skillsInvoked,
    messages,
    durationMs: Date.now() - t0,
    succeeded,
    capturedMemoryId,
    capturedEventIds,
    errors,
  };
}

/** Try to parse a harvest.ts JSON summary out of a tool_result string. */
function tryCaptureFromHarvestOutput(
  raw: string,
  onCapture: (memoryId?: string, eventId?: string) => void,
): void {
  // harvest.ts emits a top-level JSON summary with `results: [{ memoryId, eventId, ... }]`.
  // Tool result content may be wrapped in extra layers; grep first then parse.
  const match = raw.match(/\{[\s\S]*"results"\s*:\s*\[[\s\S]*\}/);
  if (!match) return;
  try {
    const parsed = JSON.parse(match[0]) as {
      results?: Array<{ memoryId?: string; eventId?: string }>;
    };
    for (const r of parsed.results ?? []) {
      onCapture(r.memoryId, r.eventId);
    }
  } catch {
    /* not the harvest summary; ignore */
  }
}

/** Generate a unique test scope. Used for isolation + cleanup. */
export function makeTestScope(label = "v3-mem-test"): {
  app_id: string;
  run_id: string;
} {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = Math.random().toString(36).slice(2, 8);
  return {
    app_id: `${label}-${stamp}-${nonce}`,
    run_id: `${stamp}-${nonce}`,
  };
}
