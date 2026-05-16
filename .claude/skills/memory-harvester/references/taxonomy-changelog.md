# Taxonomy Changelog

Append-only history of the mem0 metadata taxonomy. The current spec lives in `taxonomy.md`; this file records *what changed when* so readers/migrations can interpret old `schema_version` stamps.

**Bump rules** (see `taxonomy.md` §E):

- **patch** (`1.0.x`) — tightened validation on an existing field
- **minor** (`1.x.0`) — new optional field or new enum value (no migration needed)
- **major** (`x.0.0`) — breaking change: field rename, enum value removed, or required field added (migration skill required, see §D.4)

Every entry updates: `taxonomy.md` (spec), `defaults.ts` (`SCHEMA_VERSION`), `classify.ts` (validation), and this file.

---

## v1.0.0 — 2026-05-16

Initial taxonomy. Locks the V3.0 second-brain write contract.

### Added

**Scope IDs (all four always populated, past mem0's minimum):**
- `user_id` from `V3_MEM0_USER_ID` env
- `agent_id` hardcoded `"executive"` (V3.0 pillar)
- `app_id` — bundle slug or reserved (`_global`, `_executive`, `_skill-<slug>`)
- `run_id` — always required; per-trigger format, all start with `YYYY-MM-DD-`

**Metadata schema (closed, versioned):**
- `schema_version: "1.0.0"` — stamped by `defaults.ts`
- `env: "test" | "dev" | "prod"` — isolates test writes from real reader queries
- `cohort?: string` — optional sub-isolation for parallel test runs
- `type` — `principle | semantic | procedural | episodic | reflective`
- `category` — `technical | functional | project`
- `importance` — `critical | high | medium | low`
- `confidence` — number in `[0.0, 1.0]`
- `trigger` — `post-run | post-retro | failure-diagnosis | spec-merge | manual-harvest | practice-loop`
- `actor` — `executive | worker | human` (who produced the fact)
- `worker_vendor?` — required when `actor === "worker"`; matches `AgentWorkerVendor`
- `source` — path to the markdown the harvester read
- `harvest_run` — mirrors `run_id` (two fields, one truth; kept for back-compat reading)
- `outcome?`, `tags?` (≤ 8), `expires_at?` — optional retrieval aids

### Enforcement

- `classify.ts` — pure schema validator; rejects malformed payloads before mem0 hits.
- `defaults.ts` — stamps env-derived fields (`schema_version`, `env`, `cohort`, `harvest_run`) and infers `actor` from `trigger`, `immutable` from `trigger === "spec-merge"`.
- Reader (`scope.md`) defaults `env: "prod"` so test writes don't leak into normal queries.

### Cross-field constraints

- `type === "principle"` ⇒ `immutable: true`
- `actor === "worker"` ⇒ `worker_vendor` set
- `worker_vendor` set ⇒ `actor === "worker"`
- `harvest_run === run_id` (mirror)
- `run_id` starts with ISO date prefix (`YYYY-MM-DD-…`)
