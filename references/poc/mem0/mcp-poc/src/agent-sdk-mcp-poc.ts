/**
 * Agent SDK + mem0 MCP POC
 *
 * Proves the agentic read path for the V3.0 second brain:
 *   - Auth via CLAUDE_CODE_OAUTH_TOKEN (Pro/Max subscription, no API key)
 *   - mem0 MCP server attached via Agent SDK's inline `mcpServers` option
 *   - Tool surface locked to READ-ONLY mem0 tools (search/get/list)
 *   - Claude gets a planning-style prompt and must decide WHEN to query mem0
 *
 * This is the pattern the executive will use in production: hand a planning
 * task to Claude, let it choose to query memory as part of its reasoning.
 *
 * Prereqs:
 *   - The SDK POC (../graph-poc) has been run at least once to seed memories
 *   - .env.executive at repo root has V3_MEM0_API_KEY and V3_MEM0_USER_ID
 *   - .env.worker at repo root has CLAUDE_CODE_OAUTH_TOKEN
 *     (or the var is exported in the shell)
 *
 * Run: npm run poc
 */

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

// ---------- env ----------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../..");

// Load executive env (mem0 creds), then worker env (OAuth) — neither overrides
// existing process.env, so shell-exported vars win.
loadEnv({ path: join(repoRoot, ".env.executive") });
loadEnv({ path: join(repoRoot, ".env.worker") });

const OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const MEM0_API_KEY = process.env.V3_MEM0_API_KEY;
const MEM0_USER_ID = process.env.V3_MEM0_USER_ID;

if (!OAUTH_TOKEN) {
  console.error(
    "[fatal] Missing CLAUDE_CODE_OAUTH_TOKEN. " +
      "Run `claude setup-token` or set it in .env.worker.",
  );
  process.exit(1);
}
if (!MEM0_API_KEY || !MEM0_USER_ID) {
  console.error(
    "[fatal] Missing V3_MEM0_API_KEY or V3_MEM0_USER_ID in .env.executive.",
  );
  process.exit(1);
}

// ---------- constants ----------

const APP_ID = "v3-mem0-graph-poc"; // matches the SDK POC's app_id (original 4-seed test)
const APP_ID_BRIDGE = "v3-mem0-graph-bridge-test"; // shared with SDK POC for graph stress test
const MODEL = process.env.MODEL || "claude-sonnet-4-5";

// Read-only tool surface — mirrors the production "executive reads, harvester writes" pillar.
// MCP tools follow the `mcp__<serverName>__<toolName>` naming convention in Claude.
const READ_ONLY_MEM0_TOOLS = [
  "mcp__mem0__search_memories",
  "mcp__mem0__get_memories",
  "mcp__mem0__get_memory",
  "mcp__mem0__list_entities",
];

// Tool surface for the write-test phase only — add_memory enabled so we can
// exercise the MCP write path and prove it works end-to-end. Production
// executive will NEVER use this surface; harvester skill writes via SDK.
const WRITE_AND_READ_MEM0_TOOLS = [
  ...READ_ONLY_MEM0_TOOLS,
  "mcp__mem0__add_memory",
];

// ---------- prompt ----------

const PLANNING_PROMPT = `You are the executive agent for a continuously-running autonomous build system. You have a mem0 second-brain memory layer attached via MCP.

The memory store contains seeded knowledge about V3.0 second-brain hosting decisions, scoped to:
  - user_id: "${MEM0_USER_ID}"
  - app_id: "${APP_ID}"

Task: use the mem0 read tools (do NOT rely on training data) to answer:

  (a) What was decided about V3.0 second-brain hosting?
  (b) Who or what is the only writer to the second brain, and why?
  (c) Based on what the memories say, what should be tested or built next?

Constraints:
  - Cite the memory id(s) you reference in your answer
  - If a search returns nothing, say so explicitly rather than guessing
  - You have READ-ONLY access — do not attempt to add, update, or delete memories
  - Keep the final answer under 250 words

Search now and produce the answer.`;

// ---------- shared mcp server config ----------

const MEM0_MCP_SERVERS = {
  mem0: {
    type: "stdio",
    command: "uvx",
    args: ["mem0-mcp-server"],
    env: {
      MEM0_API_KEY: MEM0_API_KEY!,
      MEM0_DEFAULT_USER_ID: MEM0_USER_ID!,
    },
  },
} as never;

// ---------- write-then-bridge phase ----------

const WRITE_PROMPT = `You have access to mem0 via MCP tools. Your task has two phases.

PHASE 1 — Write three memories
Use mcp__mem0__add_memory three times to add the following memories. For each, pass these arguments:
  user_id: "${MEM0_USER_ID}"
  agent_id: "executive"
  app_id: "${APP_ID_BRIDGE}"
  run_id: "2026-05-16-graph-bridge"
  metadata: <object shown below per memory>

Memory 4:
  text: "The azure-function-deploy skill v0.2.0 packages Azure Functions for deployment."
  metadata: { type: "procedural", category: "technical", confidence: 0.9, importance: "medium", source: "graph-bridge-test", harvest_run: "2026-05-16-graph-bridge" }

Memory 5:
  text: "Jack owns the credit-card-stockpile project."
  metadata: { type: "episodic", category: "project", confidence: 1.0, importance: "medium", source: "graph-bridge-test", harvest_run: "2026-05-16-graph-bridge" }

Memory 6:
  text: "The credit-card-stockpile project uses Cosmos DB for storage and Azure Functions for compute."
  metadata: { type: "semantic", category: "technical", confidence: 0.95, importance: "high", source: "graph-bridge-test", harvest_run: "2026-05-16-graph-bridge" }

PHASE 2 — Bridge query
After all three add_memory calls succeed, wait briefly (one short delay turn), then call mcp__mem0__search_memories with:
  query: "What databases does Jack use?"
  filters: { AND: [{ user_id: "${MEM0_USER_ID}" }, { app_id: "${APP_ID_BRIDGE}" }] }
  limit: 10

PHASE 3 — Answer
Based on the search results, answer: "What databases does Jack use, and which memories let you arrive at that answer?" Cite the memory IDs. If the bridge required combining information across multiple memories (e.g., one about Jack's project, another about the project's database), explain the chain.

Constraints:
  - Use ONLY the mcp__mem0__ tools — no other tools needed
  - Keep the final answer under 200 words`;

// ---------- main ----------

async function runQuery(
  label: string,
  prompt: string,
  allowedTools: string[],
  transcript: Record<string, unknown>,
) {
  console.log();
  console.log("=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
  console.log(`Allowed tools: ${allowedTools.join(", ")}`);
  console.log();

  const phaseMessages: unknown[] = [];
  let toolCallCount = 0;
  let finalText = "";

  const stream = query({
    prompt,
    options: {
      model: MODEL,
      maxTurns: 12,
      mcpServers: MEM0_MCP_SERVERS,
      allowedTools,
    },
  });

  for await (const message of stream) {
    const msg = message as SDKMessage;
    phaseMessages.push(msg);

    if (msg.type === "assistant" && "message" in msg) {
      const inner = (msg as { message: { content?: unknown[] } }).message;
      for (const block of inner.content ?? []) {
        const b = block as { type?: string; name?: string; input?: unknown };
        if (b.type === "tool_use") {
          toolCallCount++;
          console.log(`[tool_use #${toolCallCount}] ${b.name}`);
          console.log(`  input: ${JSON.stringify(b.input).slice(0, 220)}`);
        }
      }
    }

    if (msg.type === "user" && "message" in msg) {
      const inner = (msg as { message: { content?: unknown[] } }).message;
      for (const block of inner.content ?? []) {
        const b = block as { type?: string; content?: unknown };
        if (b.type === "tool_result") {
          const preview = JSON.stringify(b.content).slice(0, 180);
          console.log(`  result: ${preview}…`);
        }
      }
    }

    if (msg.type === "result") {
      const r = msg as { subtype?: string; result?: string };
      if (r.subtype === "success" && r.result) {
        finalText = r.result;
      }
    }
  }

  console.log();
  console.log(`--- ${label} :: FINAL ANSWER ---`);
  console.log(finalText || "(no text result captured)");
  console.log(`--- tool calls: ${toolCallCount} ---`);

  transcript[label] = {
    toolCallCount,
    finalText,
    messages: phaseMessages,
  };

  return { toolCallCount, finalText };
}

async function main() {
  const outDir = join(__dirname, "..", ".poc-output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(outDir, `agent-sdk-run-${stamp}.json`);

  console.log("=".repeat(72));
  console.log("Agent SDK + mem0 MCP POC");
  console.log("=".repeat(72));
  console.log(`Model:          ${MODEL}`);
  console.log(`Auth:           OAuth token (CLAUDE_CODE_OAUTH_TOKEN)`);
  console.log(`MCP server:     uvx mem0-mcp-server (local stdio, API-key scoped)`);
  console.log(`mem0 user_id:   ${MEM0_USER_ID}`);
  console.log(`mem0 app_id:    ${APP_ID}`);
  console.log(`Allowed tools:  ${READ_ONLY_MEM0_TOOLS.join(", ")}`);
  console.log(`Transcript:     ${outFile}`);
  console.log("=".repeat(72));
  console.log();

  const transcript: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    config: {
      model: MODEL,
      app_id: APP_ID,
      app_id_bridge: APP_ID_BRIDGE,
      user_id: MEM0_USER_ID,
    },
  };

  // Phase 1 — read-only planning test (the production pattern, locked surface)
  const planning = await runQuery(
    "PHASE 1 — read-only planning (original 4-seed dataset)",
    PLANNING_PROMPT,
    READ_ONLY_MEM0_TOOLS,
    transcript,
  );

  // Phase 2 — write-then-bridge test (MCP write path, then graph bridge query)
  // Allowed tools include add_memory so the LLM can write the 3 bridge memories.
  // This phase is NOT the production pattern; it proves the MCP write path
  // works end-to-end and exercises the graph layer.
  const writeBridge = await runQuery(
    "PHASE 2 — MCP writes + graph bridge query (bridge dataset)",
    WRITE_PROMPT,
    WRITE_AND_READ_MEM0_TOOLS,
    transcript,
  );

  console.log();
  console.log("=".repeat(72));
  console.log("SUMMARY");
  console.log("=".repeat(72));
  console.log(`Phase 1 (read-only)  tool calls: ${planning.toolCallCount}`);
  console.log(`Phase 2 (write+bridge) tool calls: ${writeBridge.toolCallCount}`);
  console.log(`Transcript saved:    ${outFile}`);
  console.log("=".repeat(72));

  writeFileSync(outFile, JSON.stringify(transcript, null, 2));
}

main().catch((err) => {
  console.error("[poc-error]", err);
  process.exit(1);
});
