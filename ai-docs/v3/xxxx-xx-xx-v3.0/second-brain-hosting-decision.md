---
title: Second Brain Hosting Decision — Mem0 Cloud + Graph Mode
status: Decided
decided_on: 2026-05-15
decision_type: hosting-decision-record
applies_to:
  - ai-docs/v3/xxxx-xx-xx-v3.0/goal.md
supersedes: none
related:
  - ai-docs/v1/init/continuous-executive-agent-v1-prd.md
  - ai-docs/v1/init/continuous-executive-agent-v1-reference-management-addendum.md
tags:
  - second-brain
  - hosting
  - mem0
  - graph-memory
  - v3.0
---

# Second Brain Hosting Decision — Mem0 Cloud + Graph Mode

## Decision

**The V3.0 second brain is hosted on the Mem0 Cloud Platform (`api.mem0.ai`) with Graph Memory enabled.**

Markdown in the private repo remains the canonical source of truth for all operational artifacts and authored documents. Mem0 is a derived, retrieval-optimized projection of distilled knowledge — never a primary write surface for the agent's day-to-day artifacts. Cloud hosting is a hard requirement for V3.0; self-hosting is a future migration option but is explicitly out of scope for this release.

This decision unblocks V3.0 implementation per the goal doc's pre-implementation gate.

### Locked Architecture Pillars (2026-05-15)

1. **Executive-tier only.** The second brain is accessed exclusively by the **executive agent**. Worker agents never hold mem0 credentials, never have the mem0 MCP server in their config, and never call the mem0 API at runtime.
2. **Pre-search + inject for workers.** The executive runs a scoped mem0 search before spawning each worker and bakes top-K results into a "memory pack" section of the worker's generated `CLAUDE.md`. Workers consume that pack as static markdown — same shape as any other reference doc.
3. **Skills-first, with TS only inside skill `references/`.** Harvester, reader, classifier, and snapshot are each implemented as **skills** (SKILL.md). Deterministic helpers (mem0 SDK calls, schema validation, snapshot serialization) live inside each skill's own `references/` folder, bundled with the skill and invoked via Bash. There is **no** standalone `src/agentic/memory/` module. Skill-as-a-service is the pattern; markdown defines intent, packaged scripts handle plumbing.
4. **One writer.** Only the **harvester skill, invoked by the executive**, writes to mem0. Any direct `client.add()` from worker code or ad-hoc scripts is an anti-pattern and should fail review.

---

## V3.0 Decision Requirements — Satisfied

The V3.0 goal doc requires five elements be specified before implementation begins. Each is answered below.

### 1. Online accessibility

**Mem0 Cloud Platform.** Reachable via:
- REST API at `https://api.mem0.ai/v1/` (v2 search at `/v2/`, v3 list at `/v3/`)
- TypeScript SDK (`npm install mem0ai`)
- MCP server (works with Claude Code, Cursor, Codex out of the box)
- Web dashboard at `https://app.mem0.ai/dashboard/memories` for human inspection

No local machine dependency. Multi-device, multi-agent access from any environment with the API key.

### 2. Canonical source of truth

**The private GitHub repo (markdown + YAML frontmatter) remains canonical.** Mem0 stores derived knowledge, not authored content.

Authoritative write order:
1. Agent or human writes markdown → git commit
2. A harvester (see §5) reads the new/changed markdown and produces atomic mem0 memories
3. Mem0 holds the distilled, query-optimized version

If mem0 and the repo disagree, **the repo wins**. Mem0 can always be rebuilt from the repo; the inverse is not true.

### 3. Sync / index path

**One-way: markdown → mem0**, via a deterministic harvester pattern (mirrors the existing `ai-knowledge-harvester` skill).

Triggers for harvesting:
- End of run (worker outcome → episodic memories)
- Retro completion (`retro-*.md` → reflective + procedural memories)
- Spec or PRD merge to main (principles → immutable memories)
- Manual `/harvest <path>` invocation for backfill

The harvester is the **only writer** to mem0. The agent never adds memories directly during normal operation. This keeps the source-of-truth invariant clean.

### 4. Agent read / write contract

**Read** (executive-only, frequent). The executive invokes the **`memory-reader` skill** during planning, work selection, and pre-spawn prep. The skill's `references/search.ts` (or equivalent) wraps the mem0 SDK with scoping defaults — `user_id: agent-jack`, current `app_id`, confidence floor, top_k. The executive uses the returned memories two ways:

- **Inline planning context.** Executive consults memories to choose work, draft contracts, decide retry strategy.
- **Memory pack injection.** Before spawning a worker, the executive (via the `worker-spawner` flow) calls the reader skill, takes the top-K relevant memories, and bakes them into a `## Memory Pack` section in the worker's generated `CLAUDE.md`. **Workers never call mem0** — they consume static markdown.

**Write** (executive-only, harvester skill). Only the **`memory-harvester` skill**, triggered by the executive at well-defined moments (end-of-run, retro merge, manual `/harvest`, spec merge), writes to mem0. The skill's `references/classify.ts` validates each candidate write against the metadata schema (§Metadata Schema) before calling `client.add()`. Workers, ad-hoc scripts, and the conversational agent have no write path.

**Traceability.** Memory IDs and `created_at` timestamps are preserved in the harvester skill's run log (`ledgers/harvest-runs/{date}.jsonl`) so any memory can be traced to the markdown source that produced it.

### 5. Failure / degraded behavior

| Failure | Detection | Behavior |
|---|---|---|
| Mem0 API unreachable | Connection error from SDK | Executive loop logs `WORKER_MEMORY_UNAVAILABLE`, continues without retrieved context. Worker plans proceed using ledger files only. |
| Mem0 rate-limited | 429 response | Exponential backoff, fall through to ledger-only mode after 3 retries |
| Stale memories suspected | Confidence drift in outputs | Re-run harvester from latest markdown; mem0 is rebuildable |
| Async extraction pending | `add()` returns `{"status": "PENDING"}` | Harvester polls `GET /v1/event/{id}` for `SUCCEEDED` or waits 6s before next read |
| Mem0 platform sunset (worst case) | External signal | Migration plan documented in §10; SDK identical against self-hosted |

**Critical invariant:** the agent never blocks on mem0. If mem0 is degraded, the agent is degraded (loses cross-run learnings) but not stopped.

---

## Why Mem0 (vs alternatives)

| Option | Verdict | Reason |
|---|---|---|
| **Mem0 cloud** | ✅ Chosen | SOTA on memory benchmarks (91.6 LoCoMo, 94.8 LongMemEval); MCP server out of box; graph layer optional; Apache 2.0 OSS escape hatch; $24M Series A backed; full audit trail via memory history endpoint |
| Mem0 OSS pointed at Supabase | Future option | Reduces lock-in further but adds infra burden; revisit after cloud evaluation |
| Plain Postgres + pgvector | Rejected | Reimplements extraction, consolidation, conflict-resolution — exactly mem0's differentiator |
| Obsidian / Logseq vault as primary | Partially adopted | Markdown repo serves this role; Logseq optional as human-facing viewer |
| AppFlowy / AFFiNE | Rejected | PKM for humans, not agent infrastructure; storage format hostile to agent I/O |
| Custom RAG | Rejected | Mem0 is what we'd end up building |

## Why Cloud (vs self-hosted)

For V3.0 specifically:

- **Zero ops** at evaluation phase — Docker compose, Postgres, pgvector, Neo4j, FastAPI server is non-trivial to operate alongside agent infrastructure
- **Free tier (10K memories)** covers initial knowledge load; the harvester produces small numbers of high-value memories, not raw chat history
- **Graph memory is first-class** on cloud platform with hosted Neo4j AuraDB — no separate graph DB to manage
- **Dashboard included** without self-hosted-server setup
- **SDK is identical** between cloud and self-hosted, so migration cost is bounded (see §10)

The price of cloud is: API key dependency, vendor compliance posture (SOC 2 Type 1, HIPAA), and per-tier pricing if 10K memories is exceeded ($19/mo Starter, $249/mo Pro). Acceptable for V3.0.

## Why Graph Mode

Mem0 graph mode extracts entities from each fact and links them across memories. For the continuous executive agent specifically, this enables:

- **Capability traversal**: "What workers, retros, and outcomes touch the Cosmos DB decision?" returns linked memories even when the query doesn't match their text
- **Dependency surfacing**: when planning a new project, find connected prior work via entity links rather than keyword grep
- **Retro-to-outcome chains**: link `retro-2.4.1.md` lessons to the capabilities they describe and the runs they reference

Enabled via the platform settings — no extra infrastructure to manage.

---

## Memory Classification Scheme

Every memory written by the harvester carries a `type` in its metadata. Five canonical types:

| Type | What it captures | Default `immutable` | Typical confidence | Source examples |
|---|---|---|---|---|
| `principle` | Core rules and approval gates from the constitution / PRDs | `true` | 1.0 | `continuous-executive-agent-v1-prd.md` |
| `semantic` | Cross-run facts ("X works", "Y fails") | `false` | 0.7–0.95 | Retros, post-execution analyses |
| `procedural` | How-to-do-X learned from execution | `false` | 0.6–0.9 | SKILL.md additions, worker-base patterns |
| `episodic` | Timestamped "this happened in run N" facts | `false` | 1.0 (factual) | Worker outcomes, run ledgers |
| `reflective` | Patterns observed across many runs | `false` | 0.7–0.95 | Retro summaries, capability rollups |

Operational artifacts (`goals.md`, `progress.md`, `needs-you.md`, `completed.md`) are **NOT** classified into any of these — they stay in markdown / git and are never written to mem0.

## Metadata Schema

Every memory write follows this contract. The schema is **enforced by the harvester skill's bundled validator** (`memory-harvester/references/classify.ts`) — not by a shared TS module under `src/`. The TypeScript shape below is documentation of the contract; the actual code lives inside the skill.

```typescript
// memory-harvester/references/classify.ts (bundled with the skill)
interface MemoryWrite {
  user_id: string;                    // canonical agent owner (always "agent-jack" today)
  agent_id: "executive";              // V3.0: executive-only writes; field reserved for future multi-agent
  app_id: string;                     // matches projects/{slug}/ folder
  run_id?: string;                    // optional; required when type === "episodic"

  metadata: {
    type: "principle" | "semantic" | "procedural" | "episodic" | "reflective";
    category: "technical" | "functional" | "project";  // existing skill taxonomy
    confidence: number;               // 0.0–1.0, existing pattern
    importance: "critical" | "high" | "medium" | "low";
    source: string;                   // path/to/markdown.md the harvester read
    harvest_run: string;              // for traceability
  };

  immutable: boolean;                 // true for principles
}
```

Scoping IDs map directly to the existing folder structure: `app_id` equals the project folder slug, `agent_id` is `"executive"` for all V3.0 writes (workers never write), `run_id` matches the ledger date format.

---

## Backup & Portability

**Daily snapshot via `memory-snapshot` skill.** A PM2 cron entry invokes the `memory-snapshot` skill once per day; the skill's `references/snapshot.ts` does the deterministic work:

1. `client.getAll({ filters: { user_id: "agent-jack" } })` with pagination
2. For each memory, `client.history(id)` to capture full version trail
3. Write JSON to `ai-docs/v3/mem0-snapshots/{YYYY-MM-DD}.json`
4. Git commit (push only on explicit human instruction, per project rule)

This means:
- Mem0 is fully reconstructible from the repo at any point
- Every memory has an offline, version-controlled backup
- Migration off cloud is a `snapshot.forEach(m => client.add(m))` script away — and that migration script itself can be a one-off skill

Snapshot retention: indefinite in git. The repo is the disaster-recovery store.

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Cloud API key compromise | Medium | Key stored in `.env`, never committed; rotation script documented |
| Free-tier (10K) exceeded mid-evaluation | Low | Harvester produces high-signal memories only; monitor with `mem0-analytics` |
| Embedding model change breaks similarity | Medium | Document the embedder version; full re-add required if switched (vectors are not dimension-compatible) |
| Async extraction latency confuses tight loops | Low | Harvester uses event polling; agent reads are eventually-consistent by design |
| Vendor outage | Medium | Daily snapshots provide offline backup; agent degrades gracefully (§5) |
| Vendor sunset / acquisition | Low | Apache 2.0 OSS server is a drop-in replacement; SDK identical |
| Memory drift / contradictions | Medium | New ADD-only algorithm preserves history; resolution = sort by `created_at` desc and trust most recent |
| Memory pack inflates worker prompts | Medium | Reader skill enforces top_k cap + confidence floor; memory pack section is budgeted (e.g. ≤2K tokens) and truncated by relevance score before injection |
| Worker drift from outdated memory pack | Low | Memory pack is regenerated per spawn; never persisted across worker sessions. Stale memory ages out of search results via confidence decay in harvester |

---

## Re-evaluation Triggers

Revisit this decision if any of these become true:

- Memory count approaches 10K and harvester cannot be tightened further
- Mem0 introduces breaking algorithm changes the harvester cannot accommodate
- Self-hosted graph mode reaches feature parity with cloud and we have spare ops capacity
- Per-month spend exceeds defined budget (see PRD cost cap)
- A platform incident causes >24h of degraded agent operation

The migration path is `cloud → self-hosted (mem0 OSS) → mem0 OSS library + own DB`. Each step is well-defined and bounded.

---

## Implementation Checklist

V3.0 implementation can begin once the items below are complete. Each item is delivered as a **skill** (SKILL.md + `references/`) or as a small configuration change. No new `src/agentic/memory/` module is created — all deterministic plumbing ships *inside* the relevant skill's `references/` folder.

### Setup
- [ ] **Account & keys** — Create mem0 cloud account, mint API key, store in `.env` (executive only) and Vault entry. Worker output worktrees never receive this key.
- [ ] **Enable graph mode** — Toggle in project settings; verify Neo4j AuraDB connection via dashboard.

### Skills to build (each is `claude-files/skills/<name>/SKILL.md` + `references/`)
- [ ] **`memory-harvester` skill** — Reads new/changed markdown (retros, run outputs, spec merges), classifies into the five memory types, validates against the schema, calls `client.add()`. Bundled scripts: `references/classify.ts` (schema + classifier), `references/harvest.ts` (driver). Run log: `ledgers/harvest-runs/{date}.jsonl`.
- [ ] **`memory-reader` skill** — Executive-only. Wraps `client.search` with scoping defaults and confidence floor. Bundled: `references/search.ts`. Exposes two outputs: (a) raw result set for executive planning, (b) formatted "Memory Pack" markdown block ready for injection into a worker's CLAUDE.md.
- [ ] **`memory-snapshot` skill** — Daily backup runner. Bundled: `references/snapshot.ts`. PM2 cron entry invokes the skill, not the script directly.
- [ ] **`worker-spawner` integration** — Extend the existing worker-spawner flow to call `memory-reader` before each spawn and append the returned memory pack to the worker's generated CLAUDE.md. No new skill — modification to existing spawn path.

### Wiring & ops
- [ ] **MCP wiring (executive only)** — Add mem0 MCP server to the **executive's** Claude Code config for human-side inspection and ad-hoc exec queries. **Not** shipped to worker output worktrees.
- [ ] **Failure-mode tests** — Adhoc tests covering API unreachable, rate-limited, async pending scenarios. Live inside each skill's `references/` as runnable harness scripts.
- [ ] **Telemetry** — `mem0-analytics` integration for cost and latency visibility.
- [ ] **Backfill** — Initial `memory-harvester` run against existing `ai-docs/v3/` retros, capability notes, and ledgers.

---

## Open Questions (for V3.1 or later)

- Should the harvester also write *back* to markdown when it detects high-confidence patterns nowhere captured? (Probably no — keeps direction clean.)
- Multi-agent scoping when V4.0 introduces parallel agents — do we partition by `agent_id` or by `app_id`?
- When does the snapshot job become large enough that committing JSON to git is wasteful?

These do not block V3.0 implementation.

---

## Sign-off

Decision recorded. V3.0 implementation may proceed.
