# mem0 Cloud — Operational Limitations & Quirks

> **Read this before any memory operation.** This document is the single source of truth for how mem0 v3 actually behaves (vs how its docs describe it). Every memory skill in `.claude/skills/memory-*` links here. Update this file when behavior changes; do not duplicate the content into individual SKILL.md files.
>
> **Provenance:** all findings below are empirically verified in the POCs at `references/poc/mem0/{graph-poc,mcp-poc}/`. See those READMEs for the raw runs (May 2026, `mem0ai@3.0.3`, `@anthropic-ai/claude-agent-sdk@0.2.29`, `uvx mem0-mcp-server`).

---

## TL;DR — the eight things to remember

1. **Writes are async.** `add()` returns `PENDING` in <1s; the memory is durably written after ~3–5s server-side, polled via `GET /v1/event/{eventId}/`.
2. **Reads can't find writes from the same turn.** Plan write turns and read turns separately.
3. **No multi-hop traversal.** Mem0 ranks by semantic similarity; it does **not** walk the entity graph. If two memories are linked through a third, retrieval will only surface the third if its text matches the query.
4. **`getAll()` is broken.** Returns `count: 0` even with valid scope filters. Enumerate via paginated search instead.
5. **Always nest scope under `filters`** — `{ filters: { user_id: … } }` (bare object works) or `{ filters: { AND: [{ user_id: … }] } }` (also works). What does NOT work: passing `user_id` as a *top-level* search option (SDK errors), and the hosted MCP's auto-`user_id` injection (silently empty). See §4b. **The `mem0` CLI bakes the safe form in** — you never write raw filters.
6. **Three different casing rules** depending on which surface you touch.
7. **mem0 paraphrases content during extraction.** Embed literal identifiers (tags, IDs, dates) if you need to find a memory back by exact match.
8. **The executive reads/writes via the `mem0` CLI, not the MCP.** The hosted HTTP MCP (`https://mcp.mem0.ai/mcp/`) is wired in `.mcp.json` for *ad-hoc human use in Claude Code only*. See §7.

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

> Note: the snapshot/enumerate path uses paginated `search()`, never `client.getAll({ filters })` (which is broken in v3, per the bug above).

---

## 4b. Where scope filters go (the empty-results trap)

**Verified 2026-05-23 (SDK `mem0ai@3.0.3` + hosted MCP).** Two different surfaces, two different failure modes — this is the most common way to get a falsely-empty result.

**SDK (`client.search`) — what works, measured (10 results each):**

```jsonc
// ✅ bare object under `filters`
{ "filters": { "user_id": "irin.julg" }, "version": "v2", "topK": 10 }
// ✅ AND-wrapped under `filters`
{ "filters": { "AND": [ { "user_id": "irin.julg" } ] }, "version": "v2" }

// ❌ entity param at the TOP LEVEL (no `filters` key) — SDK throws:
client.search("…", { user_id: "irin.julg" })
//   "Top-level entity parameters [user_id] are not supported. Use filters: { user_id }."
```

So on the SDK the rule is simply: **nest scope under `filters`** (either form). Both `cleanup.ts` (bare object) and the `mem0` CLI (AND-wrapped) are correct.

**Hosted MCP (`mcp__mem0__search_memories`) — different:** it **auto-injects `user_id`**, but that injection does **not** match — searches come back `{ results: [] }` even though the dashboard shows data. You must pass an explicit `filters: { AND: [{ user_id: … }] }` argument. (This is exactly why ad-hoc MCP searches "find nothing.") The bare `{ user_id }` argument was also observed empty through the MCP. **Use the AND-wrapped form for any MCP search.**

**Operational rule:**

- The executive **always goes through the `mem0` CLI**, which AND-wraps from `--user-id`/`--app-id`/`--run-id` flags — the form that works on *both* SDK and MCP. You never hand-write a filter.
- `--type` and `--min-confidence` are applied client-side by the CLI (mem0 metadata-field filtering is unreliable), so they always behave.
- Ad-hoc MCP search in Claude Code: pass `filters: { AND: [{ user_id: "…" }] }` explicitly, or you'll get a false empty.

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

## 7. The executive uses the CLI, not the MCP (MCP is ad-hoc-only)

**Decision (2026-05-23):** the executive agent reads and writes the second brain **only through the `mem0` CLI** (`mem0-cli.ts`, driven via Bash inside its hook `query()` turns). The hook turns get `allowedTools: ['Bash','Read','Skill']` and **no `mcpServers`**. This keeps memory access agentic (the LLM composes and iterates CLI commands) without coupling the loop to an MCP transport.

**The mem0 MCP server is wired in `.mcp.json` for ad-hoc human use only** — inspecting/searching from interactive Claude Code. It is the hosted HTTP server:

```jsonc
// .mcp.json (interactive Claude Code only — NOT used by the executive loop)
{ "mcpServers": { "mem0": {
  "type": "http",
  "url": "https://mcp.mem0.ai/mcp/",                 // trailing slash required (else 307)
  "headers": { "Authorization": "Token m0-…" }       // Token, NOT Bearer
}}}
```

Auth correction (2026-05-23): the hosted HTTP MCP **works fine with `Authorization: Token <key>`** (verified — returns a valid `initialize` handshake and live data). An earlier note here claimed the hosted endpoint only works via OAuth/`npx mcp-add`; that was wrong for the `Token` scheme. `Bearer` does fail; use `Token`. The earlier "stdio `uvx mem0-mcp-server` only" guidance is superseded — neither stdio nor MCP is on the executive's path anymore.

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
WRITES  →  memory-harvester skill (executive hook query() turn)
           - decides agentically WHAT/WHEN to harvest (post-run, post-retro, spec merge)
           - Bash → `mem0 add --payload '<json>'` (mem0-cli.ts)
             → applyDefaults → assertValid → client.add() → pollEventTerminal → ledger
           - blocks until SUCCEEDED; persists memory_id to ledgers/harvest-runs/{date}.jsonl
           - SINGLE WRITER — workers and ad-hoc scripts never write

READS   →  memory-reader skill (executive hook query() turn)
           - allowedTools: ['Bash','Read'] — NO mcpServers
           - Bash → `mem0 search --query … [--app-id] [--type] --top-k 10` (mem0-cli.ts)
           - LLM composes + iterates queries naturally (iterative search = the multi-hop)
           - returned content optionally formatted into a Memory Pack for worker CLAUDE.md

MCP     →  ad-hoc human inspection only, via .mcp.json (hosted HTTP, Token auth)
           - never in the executive's query() options
```

**Anti-patterns to reject in code review:**

- Direct `client.add()` from worker code → harvester (CLI) only.
- `mcpServers` in an executive hook `query()` → the executive uses the CLI, not MCP.
- A `user_id` passed as a top-level search option (not under `filters`) → SDK throws; nest under `filters` or use the CLI (§4b).
- Write-then-query in the same turn → split into two turns.
- Trusting `getAll` results → use paginated `search` / `mem0 enumerate`.
- Using `Authorization: Bearer` against the raw v1 event endpoint or hosted MCP → `Token` scheme.
- Putting prompt strings in TypeScript → markdown only.

---

## 11. Scoping defaults the reader should use

The reader drives the CLI, which auto-injects `user_id` and AND-wraps (see §4b):

```bash
./bin/mem0 search --query "<q>" [--app-id <slug>] [--type <t>] --top-k 10 --min-confidence 0.7
```

Equivalent filter the CLI builds internally (never hand-write this):

```jsonc
{ "filters": { "AND": [ { "user_id": "<V3_MEM0_USER_ID>" }, { "app_id": "<slug>" } ] } }
```

Reader budget:

- `--top-k = V3_MEM0_TOP_K` (default 10)
- `--min-confidence = V3_MEM0_CONFIDENCE_FLOOR` (default 0.7) — drop results below
- Memory Pack token budget: ≤2K tokens (truncate by score desc)

These are env-driven so production can tune without code change.

---

## 12. When in doubt

- Re-read this file (the SKILL.md tells you to).
- If observed behavior contradicts what this file says, **update this file** — single source of truth, not multiple inline copies.
- The two POC READMEs are the empirical record: `references/poc/mem0/graph-poc/README.md` and `references/poc/mem0/mcp-poc/README.md`. Cross-reference for the raw data.
