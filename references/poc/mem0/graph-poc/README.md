# mem0 SDK POC (entity-aware retrieval)

Minimal proof that the V3.0 second-brain stack works end-to-end against `api.mem0.ai`:

- TS SDK v3 (camelCase) accepts our metadata schema from the hosting decision doc
- Entity-aware retrieval works on hosted v3 (entity linking is built into the algorithm — no separate graph store, no toggle to enable)
- Scoped filters (`userId` / `appId` / `runId`) narrow results
- `getAll` + `history` work — the two calls the snapshot job depends on

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

### Six findings worth keeping

1. **Mixed casing in v3 SDK.** `add()` accepts top-level camelCase (`userId`, `appId`, `runId`); `search` / `getAll` / `deleteAll` need snake_case inside `filters` (`user_id`, `app_id`, `run_id`). The SDK auto-converts on the add path but passes `filters` through verbatim.
2. **`runId` is renamed to `sessionId` server-side.** Verified via `get(id)` — top-level field is `sessionId`. Means snapshot/migration scripts can't round-trip the original `runId` name.
3. **getAll is unreliable in v3.** Same filter shape that search accepts returns empty from getAll. The memories ARE stored with those scope fields (search proves it, and `get(id)` echoes them back). Treat as upstream API quirk; enumerate via search until mem0 publishes a fix.
4. **v3 auto-extracts a lot of structure per memory.** Beyond what we passed: temporal indexing, event slots, polarity, plan status. This is why "graph mode" no longer needs a toggle — entity/temporal extraction is baked into the algorithm.
5. **`scoreBreakdown.entity` stayed at 0** across our small dataset. Either we need more memories sharing entities, or the entity-score component activates only above a threshold. Doesn't change that retrieval worked — semantic carried it.
6. **Multi-hop graph traversal is NOT a feature of mem0 v3.** The "graph mode is built in" framing means entities are extracted and stored, but retrieval is still a similarity-threshold filter against the query — it does not walk the entity graph to pull in memories one hop away. The reader skill must do iterative search or lean on the LLM to combine. See "Step 7: Graph bridge stress test" above for the empirical proof.

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
