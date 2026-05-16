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
