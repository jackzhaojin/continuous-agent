# mem0 SDK POC (entity-aware retrieval)

Minimal proof that the V3.0 second-brain stack works end-to-end against `api.mem0.ai`. Companion POC at `../mcp-poc/` covers the agentic MCP path.

## Executive summary

Two POCs validate the V3.0 second-brain pattern (May 2026) using `mem0ai@3.0.3` (this POC, SDK-side) and `@anthropic-ai/claude-agent-sdk@0.2.29` + `uvx mem0-mcp-server` (sibling POC, agentic side). Auth via OAuth (`CLAUDE_CODE_OAUTH_TOKEN`) — no API key needed.

**What's locked in as production-ready:**

- ✅ **SDK write path** — `client.add()` (camelCase options) returns `{ eventId, status: "PENDING" }` in <1s. Server-side processing completes in **3.7–5.1s** (measured). Poll `GET /v1/event/{id}/` until `status === "SUCCEEDED"`. Once SUCCEEDED, `client.get(memoryId)` is instant.
- ✅ **SDK read path** — semantic search with snake_case `filters` works; metadata filters (`{ metadata: { type: "principle" } }`) narrow precisely; `history()` returns full version trail.
- ✅ **Agentic read via MCP** — Agent SDK with `mcpServers: { mem0: { type: "stdio", command: "uvx", args: ["mem0-mcp-server"], env: {...} } }` and `allowedTools` whitelist (search/get/get_memories/list_entities) makes the LLM autonomously query memory. Write tools mechanically inaccessible.
- ✅ **MCP write path** — `add_memory` via LLM works, returns `event_id` + PENDING — same async behavior as SDK.

**What's broken or surprising:**

- ⚠️ **`getAll()` with scope filters returns `count: 0`** even though search finds the same memories. Upstream v3 endpoint quirk; enumerate via paginated search instead.
- ⚠️ **No multi-hop graph traversal.** "Graph mode is built in" means entities are extracted, not that retrieval walks the graph. Memories one hop removed (e.g., SIGUSR2 referenced via PM2 referenced via continuous-agent) do **not** surface for queries that don't share keywords with that memory. The reader skill must do iterative search or rely on LLM-side synthesis.
- ⚠️ **Hosted HTTP MCP at `mcp.mem0.ai/mcp` rejects static bearer auth** — silently returns empty results. Use the stdio `uvx mem0-mcp-server` instead.
- ⚠️ **Three different casing rules in v3:** top-level request options camelCase (`userId`), `filters` keys snake_case (`user_id`), responses normalized back to camelCase by the SDK (`eventId`) but raw API + MCP wrapper return snake_case (`event_id`).
- ⚠️ **mem0 paraphrases content during extraction.** Embed literal discriminators if you need to find by content.

**Locked production pattern:**

```
Writes  →  harvester skill calls SDK client.add() + pollEventTerminal(eventId)
           Persist memory_id in harvester ledger. Single writer.

Reads   →  executive Agent SDK query() with:
             mcpServers: { mem0: uvx-stdio + MEM0_API_KEY env }
             allowedTools: read-only mem0 tools
           LLM decides when to query during planning/diagnosis/work selection.
```

Full timing, scoping, bridge-test, and quirk data lives in the `## Results` section of each README.

## Prerequisites

1. **Mem0 account** created under the executive agent's email identity (NOT your personal email).
2. **`.env.executive` at the repo root** with:
   - `V3_MEM0_API_KEY=m0-…`
   - `V3_MEM0_USER_ID=<your-agent-slug>`

> **No graph toggle needed.** In hosted v3, the separate graph store was removed and entity linking is automatic. Earlier drafts of the decision doc reference "enabling graph mode in the dashboard" — that step no longer exists.

## Run

```bash
cd references/poc/mem0/graph-poc
npm install
npm run poc          # adds 4 memories, exercises search/getAll/history, dumps a transcript
npm run cleanup      # removes everything this POC wrote, under scope user_id=<your> app_id=v3-mem0-graph-poc
```

Output transcripts land in `./.poc-output/run-<timestamp>.json` (gitignored).

## What's actually tested

| Step | What it proves |
|------|----------------|
| 1. `client.add()` × 4 | The SDK accepts our metadata schema (type / category / confidence / importance / source / harvest_run) plus immutability for principles. |
| 2. Text search | Semantic retrieval works; results carry our metadata back. |
| 3. Entity-aware retrieval | Searching for "harvester" surfaces memories that reference it directly *and* memories about linked concepts (e.g., the principle memory mentioning the second-brain pipeline). `relations[]` may be empty in v3 hosted — that's expected. |
| 4. `getAll` | Snapshot pagination behaves; we can dump everything under a scope. |
| 5. `history` | Version trail available — needed for the snapshot job's audit log. |

## Results

Run on **2026-05-16** against `mem0ai@3.0.3`, `api.mem0.ai`, user `irin.julg`, app `v3-mem0-graph-poc`. All six steps executed end-to-end.

| Step | Outcome | Notes |
|------|---------|-------|
| 1. Add 4 memories | ✅ Pass | All four seeds landed with full metadata (`type` / `category` / `confidence` / `importance` / `source` / `harvestRun`) preserved |
| 2. Text search ("How is the second brain hosted?") | ✅ Pass | All 4 returned ranked: principle 0.39, semantic 0.31, episodic 0.29, procedural 0.23 |
| 3. Entity-aware search ("harvester") | ✅ Pass | All 4 returned; procedural scored highest (0.41) since it literally mentions the term, episodic second (0.35) via entity link. `relations[]` empty — expected for v3 hosted |
| 4. getAll under scope | ⚠️ Quirk | Returned `{ count: 0, results: [] }` even though search just found the same memories under the same filter. Reproduces with single-key filters too. Snapshot job will need a paginated-search fallback |
| 5. history on first memory | ✅ Pass | Full version trail returned including embedding vector, scope fields, and ADD event |
| 6a. Metadata filter (`type: "principle"`) | ✅ Pass | Narrowed to exactly 1 result. This is the production pattern for the reader skill — composite filter `{ user_id, app_id, metadata: { type } }` in a single flat object, no AND wrapper needed |
| 6b. Direct `get(id)` | ✅ Pass | Returned full record; revealed v3 auto-extracts `structuredAttributes` (`dayOfWeek`, `weekOfYear`, `quarter`, `isWeekend`) and reserves slots for `eventDate`, `polarity`, `temporalRelation`, `planStatus` |

### Step 7: Graph bridge stress test (added 2026-05-16)

Three new memories written under `app_id: v3-mem0-graph-bridge-test` forming an entity chain (`Jack → continuous-agent → PM2 → SIGUSR2`). mem0 auto-split memory 1 into two atomic facts, so 4 memories stored from 3 writes.

Bridge query: **"How does Jack's continuous-agent project handle worker reloads?"**

| Surfaced? | Memory | Score | Why |
|-----------|--------|-------|-----|
| ✅ | "Jack runs the continuous-agent project" | 0.467 | Text match on "Jack's continuous-agent" |
| ✅ | "Jack's agent identity is irin.julg" | 0.386 | Text match on "Jack" |
| ✅ | "continuous-agent runs executive loop using PM2" | 0.320 | Text match on "continuous-agent" |
| ❌ | "PM2 receives SIGUSR2 from npm run build for hot-reload" | (filtered) | The actual answer — but no overlap with "Jack" or "worker reloads" keywords; scored 0.133 against this query, below the similarity cutoff |

The SIGUSR2 memory **exists** (verified via `search("PM2")` returns it at 0.277; `search("SIGUSR2 hot-reload")` returns it at 0.454) — it just doesn't surface when the query keywords don't lexically match.

**Conclusion: mem0 v3 does NOT do automatic multi-hop graph traversal.** What "entity linking built into the algorithm" actually means is: entities get extracted and stored, and entity-aware ranking can boost semantic scores — but retrieval is fundamentally a similarity-threshold filter against the query. Memories one hop away (PM2 → SIGUSR2 → reload) do not get pulled when the query keywords don't overlap with that memory's text.

**Implications for the reader skill:** Cannot rely on "memories find their own linked memories." Must do one of:
- Issue **multiple queries** to surface different facets of the same question (this is what Claude did naturally in the MCP POC — 5–8 search calls per planning task)
- **Extract entities** from initial results and re-query (iterative expansion)
- Lean on the **LLM at the call site** to combine returned memories — the synthesis lives in the prompt, not in mem0

### Step 8: Async write propagation — latency benchmark + event polling

Three canary memories written under `app_id: v3-mem0-latency-bench`, with timing instrumented across four signals: `client.add()` return, `GET /v1/event/{id}/` reaching `SUCCEEDED`, mem0's own `latency` field on the event body, and `client.get(memoryId)` once the memory_id is known.

Measured **2026-05-16**:

| Signal | min | median | max | notes |
|--------|-----|--------|-----|-------|
| `client.add()` return | 352ms | 396ms | 516ms | Returns immediately with `{ eventId, status: "PENDING" }` |
| Event SUCCEEDED (client wall-clock) | 3.7s | 5.4s | 25.7s | Observed via 1.5s poll loop on `/v1/event/{id}/`; the max is poll-interval noise |
| Event SUCCEEDED (**server-reported**) | 3.7s | 4.6s | 5.1s | The `latency` field on the event body. Authoritative |
| `client.get(memoryId)` | 298ms | 479ms | 498ms | Direct lookup once memory_id is known. Near-instant |

### Production guidance for the harvester (locked in)

1. **`client.add()` returns sub-second with `PENDING`.** Never treat the add() response itself as "written."
2. **Poll `GET /v1/event/{eventId}/` at 1.5–2s intervals.** Status flow is `PENDING → RUNNING → SUCCEEDED`. Treat `SUCCEEDED`/`FAILED`/`CANCELLED` as terminal; `RUNNING` is intermediate, **not** terminal.
3. **The event response carries `results[0].id` = the memory_id.** Persist it in the harvester ledger immediately for traceability.
4. **Server-reported latency (`body.latency`) is ~3–5s** for our payload sizes. Client-observed times can be longer due to poll-interval rounding, but the actual processing time is bounded.
5. **Once SUCCEEDED, `client.get(memoryId)` is instant** (~300–500ms). Use direct get for verification, never for "is it indexed yet."
6. **Semantic search lags behind direct get.** A memory can be `client.get`-able while still not surfacing in a `client.search(...)` for a related query. Treat `SUCCEEDED + memory_id` as "durably written"; treat semantic searchability as a separate, looser signal.
7. **mem0 paraphrases content during extraction.** Our raw "Latency benchmark canary ALPHA: CANARY-ALPHA-{stamp} (timestamp …)" became "User recorded a latency benchmark canary named ALPHA with identifier CANARY-ALPHA-{stamp} at timestamp …". The canary tag and timestamp survived, but the prose was rewritten. Keep this in mind when authoring memories — embed the discriminator (tag, ID, fact) literally; don't expect verbatim content preservation.

### Reused helper: pollEventTerminal()

```typescript
async function pollEventTerminal(eventId, apiKey, maxMs = 60000, intervalMs = 1500) {
  const start = Date.now();
  const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
  while (Date.now() - start < maxMs) {
    const res = await fetch(`https://api.mem0.ai/v1/event/${eventId}/`, {
      headers: { Authorization: `Token ${apiKey}` }, // NOT Bearer
    });
    if (res.ok) {
      const body = await res.json();
      if (TERMINAL.has(body.status)) return { status: body.status, ms: Date.now() - start, body };
    }
    await sleep(intervalMs);
  }
  return { status: "TIMEOUT", ms: Date.now() - start };
}
```

This is the harvester's "wait for write durability" primitive. Bundle inside `memory-harvester/references/event-polling.ts`.

### Seven findings worth keeping

1. **Mixed casing in v3 — three different rules to remember.**
   - **Requests via `add()`** — top-level options use camelCase (`userId`, `appId`, `runId`, `topK`). The SDK runs `camelToSnakeKeys()` before sending.
   - **Requests inside `filters` (`search` / `getAll` / `deleteAll`)** — snake_case keys (`user_id`, `app_id`, `run_id`). The SDK passes `filters` through verbatim with no conversion. Mixing camelCase here returns the cryptic `"Unknown filter key 'userId'..."` error that lists the allowed snake_case keys.
   - **Responses** — the SDK normalizes back to camelCase. `add()` returns `{ eventId, status }`, search results have `scoreBreakdown`, `createdAt`, etc. The raw API and the MCP wrapper return snake_case (`event_id`, `score_breakdown`, `created_at`). Cost me an iteration when I read `event_id` from the SDK and got `undefined`.
2. **`runId` is renamed to `sessionId` server-side.** Verified via `get(id)` — top-level field is `sessionId`. Means snapshot/migration scripts can't round-trip the original `runId` name.
3. **getAll is unreliable in v3.** Same filter shape that search accepts returns empty from getAll. The memories ARE stored with those scope fields (search proves it, and `get(id)` echoes them back). Treat as upstream API quirk; enumerate via search until mem0 publishes a fix.
4. **v3 auto-extracts a lot of structure per memory.** Beyond what we passed: temporal indexing, event slots, polarity, plan status. This is why "graph mode" no longer needs a toggle — entity/temporal extraction is baked into the algorithm.
5. **`scoreBreakdown.entity` stayed at 0** across our small dataset. Either we need more memories sharing entities, or the entity-score component activates only above a threshold. Doesn't change that retrieval worked — semantic carried it.
6. **Multi-hop graph traversal is NOT a feature of mem0 v3.** The "graph mode is built in" framing means entities are extracted and stored, but retrieval is still a similarity-threshold filter against the query — it does not walk the entity graph to pull in memories one hop away. The reader skill must do iterative search or lean on the LLM to combine. See "Step 7: Graph bridge stress test" above for the empirical proof.
7. **Async write durability has a clean two-signal model.** `client.add()` returns `PENDING` in <1s; `GET /v1/event/{id}/` returning `SUCCEEDED` after ~3–5s server-reported is the harvester's "durably written" signal. Direct `client.get(memoryId)` works instantly after that. Semantic searchability is a separate, longer-tailed signal — production code should not couple "write succeeded" to "search finds it." See Step 8 above for the timing data and the `pollEventTerminal()` helper.

## Other gotchas accumulated during the POC

- **Auth scheme for raw `/v1/event/{id}/` is `Authorization: Token <key>`, not `Bearer`.** The SDK abstracts this away, but the harvester's event polling helper hits the raw endpoint directly and must use the right scheme. Bearer silently returns empty/auth errors depending on the path.
- **The event endpoint returns a treasure trove**, not just status. The `body` has `id`, `event_type`, `status`, `payload` (echo of the original add request), `results[].id` (the actual memory_id), `results[].data.memory` (the extracted/paraphrased content mem0 actually stored), `results[].linked_memory_ids` (entities the memory connects to), `started_at` / `completed_at` / `latency` (server-reported timing in ms), and `graph_status` (a separate signal for graph-layer processing, was `null` for our writes). Worth persisting the whole body in the harvester ledger for traceability.
- **mem0 paraphrases your content.** Raw input "Latency benchmark canary ALPHA: CANARY-ALPHA-mp8h890a (timestamp …)" became "User recorded a latency benchmark canary named ALPHA with identifier CANARY-ALPHA-mp8h890a at timestamp …" The discriminator (canary tag, timestamp) survived, but the prose was rewritten. **Embed identifying tokens literally** if you need to find a memory back by content — don't expect verbatim preservation.
- **`runId` is stored as `sessionId` server-side** (visible via `client.get(memoryId)`). Snapshot/migration scripts that round-trip data need to remap this field.
- **`scoreBreakdown.entity` stays at 0** across all the dataset sizes we tested (4 seeds, 7 memories with shared entities). v3's "automatic entity linking" appears to surface as semantic-similarity contributions, not as a separate score component in the response — at least at our small scale.

## Notes from current docs (May 2026)

- The SDK is **camelCase** (`userId`, `topK`) — snake_case was removed in v2→v3. Filter clauses inside `search` may still accept snake_case (`user_id`); the POC uses snake_case there to match the most recent example in the docs.
- **Graph mode no longer exists as a toggle on hosted v3.** The separate graph store was removed; entity linking is built into the memory algorithm and runs automatically. The `enable_graph` per-call flag was removed in the v2→v3 SDK migration. Earlier drafts of our decision doc referenced enabling it in the dashboard — that step is obsolete.
- `add()` runs extraction asynchronously. The POC waits 8 seconds before searching; production code should poll `client.events.get(eventId)` instead.

## Scope used by this POC

```
userId:  $V3_MEM0_USER_ID   (your executive agent's slug)
agentId: executive
appId:   v3-mem0-graph-poc  (so cleanup is precise)
runId:   2026-05-16-graph-poc
```
