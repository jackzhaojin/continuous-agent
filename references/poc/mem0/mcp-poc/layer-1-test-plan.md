# Layer 1 — Interactive Claude Code MCP verification

Purpose: prove the mem0 MCP server is registered correctly and Claude Code can actually call its tools from an interactive session. This is the "does the plumbing work at all" check, before Layer 2 tests the agentic loop.

## Setup

```bash
# 1) Source the executive env so MEM0_API_KEY / MEM0_DEFAULT_USER_ID are exported
set -a; source ../../../../.env.executive; set +a
export MEM0_API_KEY="$V3_MEM0_API_KEY"
export MEM0_DEFAULT_USER_ID="$V3_MEM0_USER_ID"

# 2) Make sure uvx is installed (one-time)
which uvx || pip install uv

# 3) Launch Claude Code from THIS directory so it picks up the local .mcp.json
cd "$(dirname "$0")"
claude
```

## Verification prompts (run these inside the CC session)

Run each prompt in order; expected behavior is described below.

### Prompt 1 — list the tools

> What MCP tools do I have available from the mem0 server? List them with one-line descriptions.

**Expect:** Claude reports tools like `mem0__search_memories`, `mem0__add_memory`, `mem0__get_memories`, etc. If you don't see anything mem0-prefixed, the server didn't register — check the env vars and `which uvx`.

### Prompt 2 — search for prior context

> Use the mem0 search tool to find memories about the V3.0 hosting decision. Show me what came back, then summarize in one paragraph what was decided.

**Expect:** Claude calls `search_memories` with a query like "V3.0 hosting decision", returns ~1–4 results (assuming you've already run the SDK POC `graph-poc` to seed memories), then synthesizes. If empty, run `cd ../graph-poc && npm run poc` first to seed.

### Prompt 3 — entity-aware retrieval check

> Use the search tool to look up "harvester". Tell me which memories surfaced, and list the other concepts those memories reference (e.g. "second brain", "memory pack"). Note whether any memories surfaced that don't literally contain the word "harvester".

**Expect:** Hosted mem0 v3 has entity linking baked in (no dashboard toggle anymore — the separate graph store was removed). The MCP response may have an empty `relations[]` array; that's expected. The real test is whether the *results* show entity-aware retrieval — i.e., the principle memory (which mentions the pipeline) may surface alongside the procedural one (which mentions the harvester directly).

### Prompt 4 — confirm scoping works

> List all memories in the app_id "v3-mem0-graph-poc" using the get_memories tool. How many are there and what types?

**Expect:** ~4 results (the SDK POC seeds), each with metadata showing `type`: principle / semantic / episodic / procedural.

## What "pass" looks like

- [ ] Tools appear in the CC session
- [ ] `search_memories` returns results with metadata intact
- [ ] Entity-aware retrieval surfaces semantically related memories on prompt 3 (relations[] empty is fine — that's expected for hosted v3)
- [ ] Scoping filters narrow correctly

If all four boxes tick, the MCP layer works. Move to Layer 2 to verify it works *agentically* (i.e., the LLM chooses when to call it).

## Cleanup

The interactive session doesn't write anything by default. If you ran add_memory during exploration, drop them with the cleanup command in the SDK POC:

```bash
cd ../graph-poc && npm run cleanup
```
