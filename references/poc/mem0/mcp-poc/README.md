# mem0 MCP POC

Verifies the *agentic* path into the second brain — i.e., when an LLM (not deterministic code) decides when and how to query memory. Complements `../graph-poc/` which covers the deterministic SDK path.

## Why both POCs

| Path | Driver | When the executive uses it |
|------|--------|-----------------------------|
| **SDK** (`../graph-poc/`) | Deterministic code (skills `references/`) | Harvester writes, snapshot job, pre-spawn memory pack build — fixed triggers, known input |
| **MCP** (this POC) | LLM in the loop | Planning, work selection, contract drafting, failure diagnosis — judgment calls where the LLM decides whether to query |

In production the executive will have **read-only** MCP access (writes go through the harvester skill). The POC uses the official server as-is and defers read-only enforcement to the implementation phase.

## Two layers

### Layer 1 — interactive Claude Code

Manual smoke test. Proves the MCP server registers, tools are discoverable, and search returns results with metadata intact. See `layer-1-test-plan.md` for the four prompts to run.

### Layer 2 — headless / programmatic

`claude -p` with `--mcp-config` pointing at `.mcp.json`. Runs a single planning-style prompt that requires the LLM to use search to answer. Captures the full JSON transcript including tool calls. This is the actual pattern the executive will follow when it integrates memory-aware planning. See `layer-2-headless.sh`.

## Prerequisites

1. **Run the SDK POC first** to seed memories — Layer 2 has nothing to find if the second brain is empty:
   ```bash
   cd ../graph-poc && npm install && npm run poc
   ```
2. **uvx** on PATH (`pip install uv` if missing) — the mem0 MCP server runs via `uvx mem0-mcp-server`.
3. **`.env.executive`** at repo root with `V3_MEM0_API_KEY` and `V3_MEM0_USER_ID`.

> **No graph toggle needed.** Hosted mem0 v3 has entity linking built into the memory algorithm by default — there's no dashboard switch. The `MEM0_ENABLE_GRAPH_DEFAULT=true` line in `.mcp.json` is preserved as a hint for the MCP server's CLI-side extraction behavior; it may be a no-op on hosted.

## Run

```bash
# Layer 1 — interactive
set -a; source ../../../../.env.executive; set +a
export MEM0_API_KEY="$V3_MEM0_API_KEY"
export MEM0_DEFAULT_USER_ID="$V3_MEM0_USER_ID"
claude            # opens CC in this dir, .mcp.json registers mem0 automatically
# then follow layer-1-test-plan.md

# Layer 2 — headless
./layer-2-headless.sh
# transcript lands in .poc-output/
```

## What "pass" looks like

| Layer | Pass criteria |
|-------|---------------|
| 1 | All four prompts in `layer-1-test-plan.md` return expected output; prompt 3 demonstrates entity-aware retrieval (memories about linked concepts surface, even if `relations[]` is empty) |
| 2 | Transcript JSON contains at least one `tool_use` block calling `mem0__search_memories`; final assistant message cites memory ids from results (not hallucinated); the "linked entities" answer is grounded in retrieved memories rather than the LLM's prior knowledge |

## Files

| File | Purpose |
|------|---------|
| `.mcp.json` | Project-scoped MCP registration (uvx-based local server) |
| `layer-1-test-plan.md` | Manual test steps for interactive CC |
| `layer-2-headless.sh` | Programmatic test using `claude -p` |
| `.poc-output/` | Layer 2 JSON transcripts (gitignored) |

## Notes from current mem0 MCP docs (May 2026)

- Tool names: `add_memory`, `search_memories`, `get_memories`, `get_memory`, `update_memory`, `delete_memory`, `delete_all_memories`, `delete_entities`, `list_entities`. We only care about the read-shaped ones for the executive's planning use case.
- **Graph mode**: hosted mem0 v3 has entity linking baked into the memory algorithm — there is no separate graph store, no dashboard toggle, and no `enable_graph` per-call flag (removed in v2→v3). The `MEM0_ENABLE_GRAPH_DEFAULT` env still exists for the CLI/OSS path; on hosted it may be a no-op.
- The remote hosted MCP at `https://mcp.mem0.ai/mcp` is an alternative to uvx if you don't want a local Python toolchain. Swap the `.mcp.json` server block to `"type": "http", "url": "..."` with the appropriate auth header.
- `MEM0_DEFAULT_USER_ID` is what the server uses when a tool call doesn't specify `user_id` explicitly. We set it from `V3_MEM0_USER_ID` so prompts can elide the scope arg and still hit the agent's memory.
