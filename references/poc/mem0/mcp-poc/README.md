# mem0 MCP POC

Verifies the *agentic* path into the second brain — i.e., when an LLM (not deterministic code) decides when and how to query memory. Complements `../graph-poc/` which covers the deterministic SDK path.

## Why both POCs

| Path | Driver | When the executive uses it |
|------|--------|-----------------------------|
| **SDK** (`../graph-poc/`) | Deterministic code (skills `references/`) | Harvester writes, snapshot job, pre-spawn memory pack build — fixed triggers, known input |
| **MCP** (this POC) | LLM in the loop | Planning, work selection, contract drafting, failure diagnosis — judgment calls where the LLM decides whether to query |

In production the executive will have **read-only** MCP access (writes go through the harvester skill). The POC uses the official server as-is and defers read-only enforcement to the implementation phase.

## Two layers

### Layer 1 — interactive Claude Code (manual)

Manual smoke test. Proves the MCP server registers, tools are discoverable, and search returns results with metadata intact. See `layer-1-test-plan.md` for the four prompts to run.

### Layer 2 — Agent SDK + OAuth (programmatic) ⭐ primary

`src/agent-sdk-mcp-poc.ts` uses `@anthropic-ai/claude-agent-sdk` with `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max subscription — no API key), registers the hosted mem0 MCP inline via `query({ options: { mcpServers: {...} } })`, and whitelists only the four READ-ONLY mem0 tools via `allowedTools`. This is the actual production pattern: the executive will call the Agent SDK with this exact shape when it needs the LLM to query memory as part of planning.

The read-only constraint is enforced mechanically: even though the mem0 MCP exposes write tools (`add_memory`, `delete_memory`, etc.), they are not in `allowedTools` so the LLM cannot invoke them. This is the operational expression of our "harvester is the only writer" pillar.

The older `layer-2-headless.sh` (uses `claude -p`) is kept as an alternative path but is **not** the production pattern.

## Prerequisites

1. **Run the SDK POC first** to seed memories — both layers have nothing to find if the second brain is empty:
   ```bash
   cd ../graph-poc && npm install && npm run poc
   ```
2. **`.env.executive`** at repo root with `V3_MEM0_API_KEY` and `V3_MEM0_USER_ID`.
3. **`.env.worker`** at repo root with `CLAUDE_CODE_OAUTH_TOKEN` (run `claude setup-token` if missing).
4. **uvx** on PATH (only for Layer 1's local MCP server): `pip install uv` if missing.

> **No graph toggle needed.** Hosted mem0 v3 has entity linking built into the memory algorithm by default — there's no dashboard switch.

## Run

```bash
# Layer 2 (primary) — Agent SDK + OAuth, programmatic
npm install
npm run poc
# transcript lands in .poc-output/agent-sdk-run-<timestamp>.json

# Layer 1 — interactive Claude Code (manual)
set -a; source ../../../../.env.executive; set +a
export MEM0_API_KEY="$V3_MEM0_API_KEY"
export MEM0_DEFAULT_USER_ID="$V3_MEM0_USER_ID"
claude            # opens CC in this dir, .mcp.json registers mem0 automatically
# then follow layer-1-test-plan.md

# Layer 2 alternative — claude -p headless (not the production pattern)
./layer-2-headless.sh
```

## What "pass" looks like

| Layer | Pass criteria |
|-------|---------------|
| 1 | All four prompts in `layer-1-test-plan.md` return expected output; prompt 3 demonstrates entity-aware retrieval (memories about linked concepts surface, even if `relations[]` is empty) |
| 2 | Transcript JSON contains at least one `tool_use` block calling `mem0__search_memories`; final assistant message cites memory ids from results (not hallucinated); the "linked entities" answer is grounded in retrieved memories rather than the LLM's prior knowledge |

## Results

Layer 2 run on **2026-05-16** with `@anthropic-ai/claude-agent-sdk@0.2.29`, `mem0-mcp-server` via `uvx`, OAuth-only auth. End-to-end pattern proven.

| Check | Outcome | Notes |
|-------|---------|-------|
| OAuth auth via `CLAUDE_CODE_OAUTH_TOKEN` | ✅ Pass | Agent SDK accepted the token; no `ANTHROPIC_API_KEY` needed |
| `mcpServers` inline option (stdio) | ✅ Pass | `uvx mem0-mcp-server` launched, picked up `MEM0_API_KEY` / `MEM0_DEFAULT_USER_ID` from the inline `env` block |
| Tool discovery | ✅ Pass | mem0 tools surfaced as `mcp__mem0__search_memories`, `get_memories`, `get_memory`, `list_entities` |
| Read-only `allowedTools` whitelist | ✅ Pass | LLM never attempted a write call — write tools were simply absent from the surface |
| Agentic tool use | ✅ Pass | Claude autonomously made **5 distinct, progressively refined searches** ("V3.0 decision" → "writer architecture" → "next steps" → "testing/POC") before answering — exactly the planning pattern the executive needs |
| Citation grounding | ✅ Pass | Final answer cited memory IDs `7934bc32`, `ebe1a911`, `a1990492`, `f3d04fc6` — all match the SDK POC's seeds. No hallucination |
| Synthesis quality | ✅ Pass | Correctly extracted: mem0 cloud chosen, Postgres+pgvector rejected (with reason), markdown is canonical (repo wins on conflict), harvester is sole writer, workers receive memory packs in prompt. Proposed concrete next steps grounded in retrieved content |

### Phase 2: MCP writes + graph bridge query (added 2026-05-16)

The POC's second phase exercises **writes via MCP** and the 2-hop bridge `Jack → credit-card-stockpile → Cosmos DB`.

| Check | Outcome | Notes |
|-------|---------|-------|
| `mcp__mem0__add_memory` whitelisted and called 3 times | ✅ Pass | Each write returned `{ event_id, status: "PENDING" }` |
| Claude correctly passed `user_id` / `agent_id` / `app_id` / `run_id` / `metadata` per the prompt | ✅ Pass | All three writes were properly scoped |
| Immediate post-write search | ❌ Bridge halves missing | Claude searched right after the writes; results showed only previously-existing memories. Claude correctly diagnosed this as "the newly added memories have status PENDING and likely haven't been indexed yet" |
| After 20s extraction wait | ✅ Bridge works | Re-querying surfaced both halves: "Jack owns credit-card-stockpile" (0.367) AND "credit-card-stockpile uses Cosmos DB" (0.271). The LLM could now synthesize "Jack uses Cosmos DB" |

**Critical production finding:** `add_memory` is **async via MCP**. Returns immediately with a `PENDING` status, but the memory is not searchable for ~6–20 seconds while extraction completes. The reader skill (which uses search, not getAll) is unaffected, but anything that writes-then-queries must wait or poll.

**Bridge query result:** the 2-hop bridge ("Jack owns project X" + "project X uses DB Y" → "Jack uses DB Y") works — but **only because both bridge halves passed the similarity threshold for the query "What databases does Jack use?"**. mem0 did not walk the entity graph; the LLM did the synthesis after both halves were returned. See `../graph-poc/README.md` Step 7 for the other half of this finding (where a one-hop-removed memory did NOT surface because its keywords didn't match the query).

### Three quirks worth knowing

1. **Hosted HTTP MCP at `mcp.mem0.ai/mcp` does NOT work with a static bearer header.** First attempt used `type: "http"` with `Authorization: Bearer ${MEM0_API_KEY}` — every search returned empty results, no auth error. The hosted endpoint expects an OAuth handshake triggered by `npx mcp-add` (browser flow), not API-key auth. The local stdio server (`uvx mem0-mcp-server`) accepts the API key directly via env and scopes against the same account as `api.mem0.ai`. **Use stdio for the executive's in-process MCP; the hosted MCP is for interactive clients that can do browser OAuth.**
2. **`get_memories` returns `count: 0` through the MCP wrapper** — same v3 quirk we found in the SDK POC. The MCP server passes the upstream API behavior through faithfully. Confirms the issue is in mem0's `/v3/memories/` list endpoint, not in either layer of our stack.
3. **`add_memory` is async — returns `PENDING`, takes ~6–20s to become searchable.** Anything that writes-then-queries in the same turn will miss its own writes. The harvester skill must either wait or use the `event_id` to poll `GET /v1/event/{id}` until `SUCCEEDED` before declaring the write complete.

### Production pattern (locked)

```typescript
query({
  prompt: planningTask,
  options: {
    model: "claude-sonnet-4-5",
    mcpServers: {
      mem0: {
        type: "stdio",
        command: "uvx",
        args: ["mem0-mcp-server"],
        env: {
          MEM0_API_KEY: process.env.V3_MEM0_API_KEY!,
          MEM0_DEFAULT_USER_ID: process.env.V3_MEM0_USER_ID!,
        },
      },
    },
    allowedTools: [
      "mcp__mem0__search_memories",
      "mcp__mem0__get_memories",
      "mcp__mem0__get_memory",
      "mcp__mem0__list_entities",
    ],
    // Auth: CLAUDE_CODE_OAUTH_TOKEN ambient
  },
});
```

This is the exact shape the executive will use when it needs the LLM to consult memory during planning, work selection, contract drafting, or failure diagnosis. Writes never go through this path — the harvester skill calls `client.add()` via the SDK on fixed triggers.

## Files

| File | Purpose |
|------|---------|
| `src/agent-sdk-mcp-poc.ts` | **Primary** — Agent SDK + OAuth + hosted mem0 MCP, with read-only tool whitelist |
| `package.json` | Declares `@anthropic-ai/claude-agent-sdk` and `tsx` |
| `.mcp.json` | Project-scoped MCP registration for Layer 1 (uvx-based local server) |
| `layer-1-test-plan.md` | Manual test steps for interactive CC |
| `layer-2-headless.sh` | Alternative `claude -p` path — not the production pattern |
| `.poc-output/` | JSON transcripts (gitignored) |

## Notes from current mem0 MCP docs (May 2026)

- Tool names: `add_memory`, `search_memories`, `get_memories`, `get_memory`, `update_memory`, `delete_memory`, `delete_all_memories`, `delete_entities`, `list_entities`. We only care about the read-shaped ones for the executive's planning use case.
- **Graph mode**: hosted mem0 v3 has entity linking baked into the memory algorithm — there is no separate graph store, no dashboard toggle, and no `enable_graph` per-call flag (removed in v2→v3). The `MEM0_ENABLE_GRAPH_DEFAULT` env still exists for the CLI/OSS path; on hosted it may be a no-op.
- **Use the stdio MCP server (`uvx mem0-mcp-server`), not the hosted HTTP one** — verified empirically 2026-05-16. The hosted endpoint at `https://mcp.mem0.ai/mcp` expects an OAuth handshake triggered by `npx mcp-add` (a browser-based flow), not a static `Authorization: Bearer` header. Passing the API key via bearer header silently returns empty results from every search/list. The local stdio server accepts `MEM0_API_KEY` directly via env and scopes against the same account as `api.mem0.ai`.
- `MEM0_DEFAULT_USER_ID` is what the server uses when a tool call doesn't specify `user_id` explicitly. We set it from `V3_MEM0_USER_ID` so prompts can elide the scope arg and still hit the agent's memory.
- **`get_memories` (the MCP wrapper around `client.getAll`) returns `count: 0` even when search finds the same memories** — same v3 quirk as the SDK POC. The MCP server passes this through faithfully; root cause is upstream in mem0's `/v3/memories/` list endpoint. Snapshot job in production should enumerate via paginated search until mem0 clarifies.
