# V2.2 Goal: Migrate Ledgers & AI State to Cloud Database

## Vision

Move all mutable agent operational data out of local flat files and into a cloud database (Supabase or Cosmos DB). Local files become optional cache/fallback — the cloud DB becomes the source of truth. This unlocks queryability, durability, concurrent access, and real-time observability.

## Why

- **No queryability** — Cannot aggregate, filter, or analyze historical data without parsing JSONL files line by line
- **No durability** — Local files are lost if the machine is wiped or disk fails
- **No concurrent access** — Multiple processes reading/writing JSONL files risk corruption
- **No scalability** — As ledgers grow, file I/O becomes a bottleneck
- **Limited observability** — No dashboards or real-time queries against operational data

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
- Connection config in `.env.executive` (Tier 1)
- Setting `V2_CLOUD_DB=false` reverts to local files with zero breakage

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
- **Real-time subscriptions?** Supabase supports real-time — could enable live dashboard updates. Out of scope for v2.3, worth noting for v2.4.
- **Retention policy?** Should old ledger entries be archived/purged after N days? Keep all for now, add retention later.

## Priority

High — this is foundational infrastructure that unblocks better observability, reliability, and multi-machine operation. Prioritized before integration wiring (now v2.3) to tighten the codebase first.
