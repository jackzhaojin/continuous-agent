/**
 * runMemoryHook — the single chokepoint that turns a deterministic executive
 * phase boundary into a bounded *agentic* memory turn.
 *
 * Each of the five lifecycle hooks (A–E) is a `memory-hook-*` SKILL.md. This
 * helper loads that skill prompt (via the existing loadSkillPrompt loader, so
 * we get EXECUTIVE_SKILL_USED ledger logging for free), then runs an Agent SDK
 * `query()` turn with:
 *
 *   allowedTools: ['Bash', 'Read', 'Skill']     // Skill → invoke harvester/reader;
 *   settingSources: ['user', 'project']          // Bash → drive the mem0 CLI;
 *   cwd: <repo root>                             // Read → load the spec docs.
 *   NO mcpServers                                // executive uses the CLI, not MCP.
 *
 * The agent composes and iterates `bin/mem0 …` itself — that is the "agentic,
 * not predefined TS" property. The deterministic CLI enforces correctness.
 *
 * Gating: requires V3_MEMORY_ENABLED=true AND the per-hook flag = true. A hook
 * with its flag off no-ops cleanly (returns { ran: false }). Errors never throw
 * — they return in HookResult.error so the loop never blocks on memory.
 *
 * No prompt strings live here. Prompts are in the SKILL.md files.
 */

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadSkillPrompt } from "../intelligence/skill-prompt-loader.js";
import { log } from "../../core/logging.js";
import type { HookName, HookContext, HookResult } from "./types.js";

const AGENT_ROOT = process.env.AGENT_PATH || process.cwd();

/** Per-hook activation flag (additive to the V3_MEMORY_ENABLED master). */
const HOOK_FLAG: Record<HookName, string> = {
  "pre-work-selection": "V3_MEM_HOOK_PRE_WORK",
  "pre-spawn-pack": "V3_MEM_HOOK_PRE_SPAWN",
  "post-run-harvest": "V3_MEM_HOOK_POST_RUN",
  "failure-diagnosis": "V3_MEM_HOOK_FAIL_DIAG",
  "post-retro-harvest": "V3_MEM_HOOK_POST_RETRO",
};

/** Hook → wrapper skill directory under .claude/skills/. */
const HOOK_SKILL: Record<HookName, string> = {
  "pre-work-selection": "memory-hook-pre-work-selection",
  "pre-spawn-pack": "memory-hook-pre-spawn-pack",
  "post-run-harvest": "memory-hook-post-run-harvest",
  "failure-diagnosis": "memory-hook-failure-diagnosis",
  "post-retro-harvest": "memory-hook-post-retro-harvest",
};

/** Read hooks may iterate searches; write hooks do a few adds. 30 is ample. */
const MAX_TURNS = 30;

function isTrue(v: string | undefined): boolean {
  return (v ?? "").toLowerCase() === "true";
}

function memoryEnabled(): boolean {
  // Master switch. Defaults OFF here — the loop only runs hooks when explicitly
  // enabled, matching the staged-rollout posture (all flags ship OFF).
  return isTrue(process.env.V3_MEMORY_ENABLED);
}

/** Extract the `## Memory Pack` block (Hook B) from the final text. */
function extractMemoryPack(finalText: string): string | undefined {
  const idx = finalText.indexOf("## Memory Pack");
  if (idx === -1) return undefined;
  return finalText.slice(idx).trim();
}

/**
 * Run a memory hook. Never throws — gating misses return { ran:false }, and
 * runtime failures return { ran:true, error }. Callers should still wrap in
 * try/catch as belt-and-suspenders, but this won't be the thing that crashes
 * the loop.
 */
export async function runMemoryHook(
  name: HookName,
  ctx: HookContext,
): Promise<HookResult> {
  const flag = HOOK_FLAG[name];

  if (!memoryEnabled()) {
    return { ran: false, skipped: true, reason: "V3_MEMORY_ENABLED off", finalText: "" };
  }
  if (!isTrue(process.env[flag])) {
    return { ran: false, skipped: true, reason: `${flag} off`, finalText: "" };
  }

  const t0 = Date.now();
  const skill = HOOK_SKILL[name];

  try {
    const prompt = await loadSkillPrompt(
      skill,
      { CONTEXT_JSON: JSON.stringify(ctx, null, 2) },
      { usageContext: `memory-hook/${name}` },
    );

    const options = {
      allowedTools: ["Bash", "Read", "Skill"],
      settingSources: ["user", "project"] as ("user" | "project")[],
      cwd: AGENT_ROOT,
      maxTurns: MAX_TURNS,
      ...(process.env.MODEL ? { model: process.env.MODEL } : {}),
    } as Parameters<typeof query>[0]["options"];

    const toolCalls: string[] = [];
    let finalText = "";
    let succeeded = false;
    let streamErr: string | undefined;

    for await (const message of query({ prompt, options })) {
      const msg = message as SDKMessage;

      if (msg.type === "assistant" && "message" in msg) {
        const inner = (msg as { message: { content?: unknown[] } }).message;
        for (const block of inner.content ?? []) {
          const b = block as { type?: string; name?: string };
          if (b.type === "tool_use" && b.name) toolCalls.push(b.name);
        }
      }

      if (msg.type === "result") {
        const r = msg as { subtype?: string; result?: string; is_error?: boolean };
        if (r.subtype === "success" && typeof r.result === "string") {
          finalText = r.result;
          succeeded = true;
        }
        if (r.is_error) streamErr = `result error subtype: ${r.subtype}`;
      }
    }

    const durationMs = Date.now() - t0;
    log(
      `  [MEMORY] hook ${name} ran: ${toolCalls.length} tool calls, ` +
        `${durationMs}ms, ${succeeded ? "ok" : "no-success-result"}`,
    );

    const result: HookResult = {
      ran: true,
      finalText,
      toolCalls,
      durationMs,
    };
    if (name === "pre-spawn-pack") result.memoryPack = extractMemoryPack(finalText);
    if (!succeeded && streamErr) result.error = streamErr;
    return result;
  } catch (e) {
    const durationMs = Date.now() - t0;
    log(`  [MEMORY] hook ${name} FAILED (${durationMs}ms): ${(e as Error).message}`);
    return {
      ran: true,
      finalText: "",
      error: (e as Error).message,
      durationMs,
    };
  }
}
