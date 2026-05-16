# mem0 Cloud — Operational Limitations & Quirks

> **Read this before any memory operation.** This document is the single source of truth for how mem0 v3 actually behaves (vs how its docs describe it). Every memory skill in `.claude/skills/memory-*` links here. Update this file when behavior changes; do not duplicate the content into individual SKILL.md files.
>
> **Provenance:** all findings below are empirically verified in the POCs at `references/poc/mem0/{graph-poc,mcp-poc}/`. See those READMEs for the raw runs (May 2026, `mem0ai@3.0.3`, `@anthropic-ai/claude-agent-sdk@0.2.29`, `uvx mem0-mcp-server`).

---

## TL;DR — the seven things to remember

1. **Writes are async.** `add()` returns `PENDING` in <1s; the memory is durably written after ~3–5s server-side, polled via `GET /v1/event/{eventId}/`.
2. **Reads can't find writes from the same turn.** Plan write turns and read turns separately.
3. **No multi-hop traversal.** Mem0 ranks by semantic similarity; it does **not** walk the entity graph. If two memories are linked through a third, retrieval will only surface the third if its text matches the query.
4. **`getAll()` is unreliable.** Returns `count: 0` even with valid scope filters. Enumerate via paginated search instead.
5. **Three different casing rules** depending on which surface you touch.
6. **mem0 paraphrases content during extraction.** Embed literal identifiers (tags, IDs, dates) if you need to find a memory back by exact match.
7. **Use the stdio MCP server, not the hosted HTTP one** — the hosted endpoint at `https://mcp.mem0.ai/mcp` requires OAuth handshake, not static bearer auth.

---

## 1. Async write durability

`client.add()` (or `mcp__mem0__add_memory`) returns immediately with `{ eventId, status: "PENDING" }`. The memory is **not yet stored** — extraction is happening server-side.

**Status flow:** `PENDING → RUNNING → SUCCEEDED` (with `FAILED` and `CANCELLED` as the other terminals).
**`RUNNING` is intermediate, not terminal.** Treat only `SUCCEEDED`/`FAILED`/`CANCELLED` as done.

**Timing (measured 2026-05-16):**

| Signal | min | median | max |
|---|---|---|---|
| `client.add()` return | 352ms | 396ms | 516ms |
| Event SUCCEEDED (server `latency` field) | 3.7s | 4.6s | 5.1s |
| Event SUCCEEDED (client wall-clock with 1.5s polling) | 3.7s | 5.4s | 25.7s |
| `client.get(memoryId)` after SUCCEEDED | 298ms | 479ms | 498ms |

**Pattern (locked):**

1. Call `add()`, capture `eventId`.
2. Poll `GET https://api.mem0.ai/v1/event/{eventId}/` every 1.5–2s.
3. When status is terminal, `body.results[0].id` is the memory_id. Persist it.
4. Once SUCCEEDED, `client.get(memoryId)` is instant.
5. **Semantic searchability is a separate, longer-tailed signal.** A memory can be `get`-able while still not surfacing in `search()`. Don't couple "write succeeded" to "search finds it."

**Auth for raw `/v1/event/{id}/`:** `Authorization: Token <key>`, **NOT** `Bearer`. (The SDK abstracts this; the harvester's polling helper hits the raw endpoint and must use the `Token` scheme.)

**`pollEventTerminal()` helper** lives at `.claude/skills/memory-harvester/references/event-polling.ts`. Always use it from the harvester.

---

## 2. Read-after-write inside a single agent turn — DON'T

Empirically observed in the MCP POC Phase 2: the LLM wrote three memories then immediately searched within the same turn. All three were missed (status was still `PENDING`). The LLM correctly diagnosed the timing issue but couldn't loop back.

**Operational rule:**

- **A turn that writes never reads its own writes in the same turn.** End the turn after the harvester confirms `SUCCEEDED`. The next turn (potentially seconds or minutes later) is when those memories become queryable for new questions.
- Inside the harvester, `client.get(memoryId)` *does* work immediately after SUCCEEDED — use it for write verification only, not for synthesis.

---

## 3. No multi-hop graph traversal

"Graph mode is built in" in v3 means **entities are extracted and stored, not that retrieval walks the graph.** The decision-doc earlier referenced graph-mode toggles — those are obsolete; the behavior they implied is not.

**Empirical proof (graph-poc Step 7):** four memories formed a chain `Jack → continuous-agent → PM2 → SIGUSR2`. Query: "How does Jack's continuous-agent project handle worker reloads?" The SIGUSR2 memory (the actual answer, one hop removed) **did not surface** — its text didn't contain "Jack" or "worker reloads" and its semantic score against the query was 0.133, below the cutoff. The SIGUSR2 memory *does* exist (verified via `search("SIGUSR2 hot-reload")` returns it at 0.454).

**Operational rule — the reader must do its own multi-hop:**

1. **Issue multiple queries** to surface different facets of the same question. (Claude does this naturally — the MCP POC observed 5–8 refined searches per planning task.)
2. **Or extract entities** from initial results and re-query with those entity names as the query text.
3. **Or lean on the LLM at the call site** to combine returned memories into a synthesized answer. (Most natural via the Agent SDK pattern.)

**Do NOT rely on:** "memories find their own linked memories." They don't, in v3.

---

## 4. `getAll()` returns empty under valid scope filters

Same filter shape that `search()` accepts returns `{ count: 0, results: [] }` from `getAll()`. The memories are stored (search proves it; `get(id)` echoes back the scope fields).

**Operational rule:**

- **Snapshot / enumeration jobs use paginated search**, not `getAll`. See `memory-snapshot/references/snapshot.ts`.
- If you must call `getAll` for some reason, treat an empty response as "tell me nothing useful," not as "the scope is empty."

Verified through both the SDK and the MCP wrapper — the bug is upstream in mem0's `/v3/memories/` list endpoint.

---

## 5. Three casing rules

This trips up every memory operation if you're switching between surfaces. Memorize:

| Surface | Casing | Example |
|---|---|---|
| **Top-level options in `client.add()`** | **camelCase** | `userId`, `appId`, `runId`, `topK` |
| **Keys inside `filters: { ... }`** (search, getAll, deleteAll) | **snake_case** | `user_id`, `app_id`, `run_id` |
| **SDK responses** | normalized to camelCase | `{ eventId, status, scoreBreakdown, createdAt }` |
| **Raw API + MCP wrapper responses** | **snake_case** | `{ event_id, status, score_breakdown, created_at }` |

**Specific traps:**

- Mixing camelCase inside `filters` → cryptic error `"Unknown filter key 'userId'..."` listing the allowed snake_case keys.
- Reading `event_id` from MCP transcript, then writing `result.event_id` after switching to SDK → returns `undefined` because the SDK call gives you `eventId`.
- Code that handles both: `const eventId = first?.eventId ?? first?.event_id;`

**Field rename to watch:** `runId` is stored server-side as `sessionId`. Visible in `client.get(memoryId)` responses. Snapshot/migration scripts can't round-trip the original field name.

---

## 6. mem0 paraphrases content during extraction

Raw input:
> "Latency benchmark canary ALPHA: CANARY-ALPHA-mp8h890a (timestamp 2026-05-16T10:42…)"

What mem0 actually stored:
> "User recorded a latency benchmark canary named ALPHA with identifier CANARY-ALPHA-mp8h890a at timestamp 2026-05-16T10:42…"

The discriminator (canary tag, timestamp) survived. The prose was rewritten.

**Operational rule for the harvester:**

- **Embed identifying tokens literally** if you need to find a memory back by content: short canary tag, ULID, ISO timestamp, exact path. mem0 preserves these.
- **Don't expect verbatim preservation** of your authored prose. Searching by exact phrase often fails.
- **Don't depend on prose to discriminate.** Always include `harvest_run`, `source` (file path), and a stable identifier in metadata — that's what survives.

---

## 7. Stdio MCP server only; hosted HTTP MCP doesn't work with bearer auth

The hosted endpoint at `https://mcp.mem0.ai/mcp` returns empty results from every search/list when authenticated with a static `Authorization: Bearer ${MEM0_API_KEY}` header. No error — silent empty. It expects an OAuth handshake triggered by `npx mcp-add` (browser flow).

**Operational rule:**

- The executive uses **stdio MCP only** — `uvx mem0-mcp-server` launched in-process by Agent SDK's `mcpServers` config.
- The hosted HTTP MCP is for interactive clients (Cursor, Claude Code GUI) that can do browser OAuth. Not for programmatic agents.

**Locked production MCP config:**

```typescript
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
}
```

`uvx` must be on `PATH`. Install via `pip install uv` if missing.

---

## 8. Auto-extracted fields (free; document so you don't try to write them)

mem0 v3 automatically extracts the following on each memory write — they appear in `client.get(memoryId)` responses but are not in your input:

- `structuredAttributes.dayOfWeek`, `weekOfYear`, `quarter`, `isWeekend`
- Reserved slots for `eventDate`, `polarity`, `temporalRelation`, `planStatus`
- `linked_memory_ids` — entities the memory connects to

**Don't pass these in your `add()` call.** The schema validator in `references/classify.ts` rejects unknown top-level fields. mem0 fills them in.

---

## 9. Entity scoring at small scale

`scoreBreakdown.entity` stayed at 0 across all dataset sizes tested (4 seeds in the original POC, 7 memories with shared entities in the bridge test). At the small scale relevant to a single agent's harvest stream, **entity-component scoring effectively doesn't activate** — semantic similarity carries retrieval.

**Implication:** don't tune the reader against entity-score behavior. Tune against semantic similarity scores (typical relevant range: 0.20–0.55 for seeded test data).

---

## 10. Locked production pattern (summary)

```
WRITES  →  memory-harvester skill
           - decides agentically WHEN to harvest (post-run, post-retro, spec merge)
           - calls SDK client.add() via references/harvest.ts (Bash-invoked)
           - blocks on pollEventTerminal(eventId) until SUCCEEDED
           - persists memory_id to ledgers/harvest-runs/{date}.jsonl
           - SINGLE WRITER — workers and ad-hoc scripts never write

READS   →  executive Agent SDK query() at lifecycle hooks
           - mcpServers: { mem0: uvx-stdio + MEM0_API_KEY env }
           - allowedTools: read-only mem0 tools only
             (mcp__mem0__search_memories, get_memories, get_memory, list_entities)
           - LLM decides when to query; runs multiple iterative searches naturally
           - returned content optionally formatted into a Memory Pack for worker CLAUDE.md
```

**Anti-patterns to reject in code review:**

- Direct `client.add()` from worker code → harvester only.
- `mcp__mem0__add_memory` in any executive `allowedTools` list → read-only only.
- Write-then-query in the same turn → split into two turns.
- Trusting `getAll` results → use paginated search.
- Using `Authorization: Bearer` against the raw v1 event endpoint → `Token` scheme.
- Putting prompt strings in TypeScript → markdown only.

---

## 11. Scoping defaults the reader should use

```typescript
filters: {
  user_id: process.env.V3_MEM0_USER_ID,   // executive agent identity
  // app_id: bundle slug — set per-call if narrowing to one project
}
```

Reader skill enforces these:

- `topK = V3_MEM0_TOP_K` (default 10)
- Confidence floor = `V3_MEM0_CONFIDENCE_FLOOR` (default 0.7) — drop results below
- Memory Pack token budget: ≤2K tokens (truncate by score desc)

These are env-driven so production can tune without code change.

---

## 12. When in doubt

- Re-read this file (the SKILL.md tells you to).
- If observed behavior contradicts what this file says, **update this file** — single source of truth, not multiple inline copies.
- The two POC READMEs are the empirical record: `references/poc/mem0/graph-poc/README.md` and `references/poc/mem0/mcp-poc/README.md`. Cross-reference for the raw data.
