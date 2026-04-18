# V3.0 Goal: Migrate Ledgers & AI State to Cloud Database (Without Losing Local AI Monitoring)

> **Renumbered from v2.4 → v3.0 on 2026-04-18.** Cloud migration is a major architectural shift unlikely to ship for some time; elevating to a v3.x milestone reflects the scope and timing. Open questions in-file that refer to "v2.4" or "v2.5" predate the renumber.

## Vision

Move mutable operational data into a cloud database (Supabase or Cosmos DB) **without regressing local AI observability**. The cloud DB is the canonical source of truth, while a deterministic local mirror keeps monitor-oriented workflows (e.g., local file watchers and out-of-the-box model monitor skills) functional.

## Why

- **No queryability** — Cannot aggregate, filter, or analyze historical data without parsing JSONL files line by line
- **No durability** — Local files are lost if the machine is wiped or disk fails
- **No concurrent access** — Multiple processes reading/writing JSONL files risk corruption
- **No scalability** — As ledgers grow, file I/O becomes a bottleneck
- **Limited observability** — No dashboards or real-time queries against operational data

## Non-Regression Principle: Keep AI Monitoring First-Class

Cloud migration must not break existing monitor patterns that rely on local files. We should explicitly support both:

- **Cloud canonical writes** for durability + shared observability
- **Local append-only mirror writes** for local monitor compatibility and quick debugging

This keeps us from taking a step backwards while we gain cloud capabilities.

## What Moves to Cloud DB

### Must Migrate (Mutable State → Cloud Source of Truth)

| Data | Current Location | Format | Cloud Table |
|------|-----------------|--------|-------------|
| Work ledger | `ledgers/work-ledger.jsonl` | JSONL | `work_ledger` |
| Executive logs | `ledgers/executive-*.log` | Log files | `executive_logs` |
| Contract events | `workspace/**/CONTRACTS.jsonl` | JSONL per bundle | `contract_events` |
| Step tracking | `workspace/**/STEPS.json` | JSON per bundle | `goal_steps` |
| Evolution log | `learning/evolution-log.jsonl` | JSONL | `evolution_log` |
| Retrospectives | `learning/retrospectives/*.md` | Markdown | `retrospectives` |
| Self-improvement state | `workspace/self-improvement-state.json` | JSON | `agent_state` |
| Project registry | `workspace/project-registry.yml` | YAML | `project_registry` |

### Stays Local (Config / Immutable / Human-Authored)

| Data | Location | Reason |
|------|----------|--------|
| `constitution.md` | `workspace/` | Immutable, version-controlled |
| `PROMPT.md` files | `workspace/**/` | Human-authored, git-tracked |
| `.env.*` files | Root | Credentials, never in DB |
| `CLAUDE.md` | Root | Config, version-controlled |
| `capabilities/*.yml` | Root | Skill definitions, version-controlled |
| `preferences.md` | `workspace/` | Human-edited |

## Approach

### 1. Database Provider & Schema
- **Supabase recommended** — already used in app-tier projects, credentials exist in `.env.app`
- Design tables matching the data above with proper indexes
- Create SQL migration scripts in `src/deterministic/cloud-db/migrations/`

### 2. Storage Abstraction Layer
Create a `StorageProvider` interface so the codebase doesn't hardcode a backend:

```typescript
interface StorageProvider {
  appendLedgerEntry(entry: LedgerEntry): Promise<void>;
  queryLedger(filter: LedgerFilter): Promise<LedgerEntry[]>;
  appendContractEvent(goalSlug: string, event: ContractEvent): Promise<void>;
  getContractEvents(goalSlug: string): Promise<ContractEvent[]>;
  readSteps(goalSlug: string): Promise<StepsJson | null>;
  writeSteps(goalSlug: string, steps: StepsJson): Promise<void>;
  getState(key: string): Promise<unknown>;
  setState(key: string, value: unknown): Promise<void>;
  appendEvolutionEntry(entry: EvolutionEntry): Promise<void>;
  saveRetrospective(date: string, content: string): Promise<void>;
}
```

Two implementations:
- `LocalFileProvider` — wraps current fs-based behavior (fallback)
- `CloudDbProvider` — Supabase or Cosmos DB implementation

Plus a composition strategy:
- `DualWriteProvider` — writes to Cloud first (canonical) and local mirror second (best effort, health-signaled)

The goal is to preserve compatibility with local monitor tooling while moving operational truth to cloud records.

### 3. Rewire Deterministic Layer
Replace direct `fs` calls in these files with `StorageProvider` calls:
- `src/deterministic/state-handler.ts` — ledger appends, goal state reads
- `src/deterministic/steps-json-handler.ts` — STEPS.json read/write
- `src/deterministic/contracts-log-writer.ts` — contract event appends
- `src/deterministic/progress-log-writer.ts` — progress log appends
- `src/core/logging.ts` — executive log writes

### 4. Data Migration Script
Create `scripts/migrate-to-cloud.ts`:
- Read all existing local JSONL/JSON/YAML files
- Parse and validate entries
- Batch-insert into cloud DB tables
- Verify row counts match source
- Generate migration report

### 5. Feature Flag & Rollout
- `V2_CLOUD_DB=true` — feature flag (default OFF)
- `CLOUD_DB_PROVIDER=supabase|cosmos` — backend selection
- `V2_LOCAL_MIRROR=true` — maintain local append-only mirror writes for monitor compatibility (default ON initially)
- Connection config in `.env.executive` (Tier 1)
- Setting `V2_CLOUD_DB=false` reverts to local files with zero breakage

### 6. Monitoring Compatibility Gates (Must Pass Before Flip)

Before declaring migration complete:

1. **Parity gate** — local monitor can detect goal lifecycle and worker progress from mirror files.
2. **Lag gate** — mirror write lag from canonical cloud write stays under an agreed threshold.
3. **Failure gate** — cloud outages degrade gracefully with explicit telemetry while local monitoring remains available.
4. **Reconciliation gate** — deterministic replay/checkpoint process can verify cloud vs local mirror drift.

## Key Files Affected

| File | Change |
|------|--------|
| `src/deterministic/state-handler.ts` | Use StorageProvider instead of fs |
| `src/deterministic/steps-json-handler.ts` | Use StorageProvider instead of fs |
| `src/deterministic/contracts-log-writer.ts` | Use StorageProvider instead of fs |
| `src/deterministic/progress-log-writer.ts` | Use StorageProvider instead of fs |
| `src/core/logging.ts` | Use StorageProvider for executive logs |
| `src/deterministic/cloud-db/client.ts` | **New** — DB client singleton |
| `src/deterministic/cloud-db/schema.ts` | **New** — table definitions |
| `src/deterministic/cloud-db/providers.ts` | **New** — StorageProvider implementations |
| `scripts/migrate-to-cloud.ts` | **New** — data migration script |

## Open Questions

- **Supabase vs Cosmos DB?** Supabase recommended since credentials already exist. Cosmos DB if Azure integration is preferred.
- **Real-time subscriptions?** Supabase supports real-time — could enable live dashboard updates. Out of scope for v2.4, worth noting for v2.5.
- **Retention policy?** Should old ledger entries be archived/purged after N days? Keep all for now, add retention later.

## Priority

High — but only if we preserve (or improve) AI observability during migration. “Cloud-first + local-monitor-compatible mirror” is the intended path.
