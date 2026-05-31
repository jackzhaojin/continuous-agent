# Memory Taxonomy v1.0.0

> **Single source of truth for every mem0 write in this codebase.**
>
> Read this before composing any `MemoryWrite` payload. The harvester SKILL reads this doc agentically; `classify.ts` enforces it deterministically; `defaults.ts` fills the boring fields. If they disagree, this doc wins and the others are out of date.

---

## Why this exists

mem0 lets you stamp every memory with four scope IDs (`user_id`, `agent_id`, `app_id`, `run_id`) and an arbitrary `metadata: object`. The platform requires **at least one** scope ID. The `metadata` field is intentionally schemaless.

That freedom is a footgun for agentic systems — without a shared convention, every harvester invocation invents its own keys, retrieval filters drift, test pollution piles up, and migrations become archaeology.

This doc closes both surfaces:

1. **All four scope IDs are always populated** — opinionated past the mem0 minimum.
2. **`metadata` follows a versioned schema** — every field has a fixed enum or pattern.

---

## Section A — Scope IDs (always all four)

| Field | Type | Source | Example |
|---|---|---|---|
| `user_id` | string | `V3_MEM0_USER_ID` env (operator identity slug, never committed) | `irin-julg` |
| `agent_id` | enum | hardcoded `"executive"` (V3.0 pillar — workers never write) | `executive` |
| `app_id` | string | caller; reserved slugs start with `_` | `credit-card-stockpile`, `_global` |
| `run_id` | string | caller; format depends on trigger (see below) | `2026-05-16-credit-card-stockpile` |

### A.1 — `app_id` conventions

Every memory belongs to an "app." Apps map to where the lesson is *useful*, not where the work happened.

| Slug pattern | When to use |
|---|---|
| `<bundle-slug>` | Project-scoped — the bundle folder under `workspace/{ondeck,in-progress}/`. Most memories. |
| `_global` | Cross-project lessons. Retros that span projects, principles from the constitution, harness-level rules. |
| `_executive` | Memories about the executive loop itself — phase ordering, scheduler quirks, hook behavior. |
| `_skill-<slug>` | Memories specific to one skill's track record or behavior (e.g. `_skill-goal-drafter`). |

Reserved slugs all start with `_`. Bundle slugs must NOT start with `_`. The validator enforces this.

### A.2 — `run_id` conventions (one rule per trigger)

`run_id` is always populated. The format is determined by the **trigger** that invoked the harvester:

| Trigger | `run_id` format | Example |
|---|---|---|
| `post-run` | `YYYY-MM-DD-<bundle-slug>` (matches the work-ledger run) | `2026-05-16-credit-card-stockpile` |
| `post-retro` | `YYYY-MM-DD-retro-<retro-slug>` | `2026-05-16-retro-vendor-comparison` |
| `failure-diagnosis` | `YYYY-MM-DD-fail-<bundle-slug>-<attempt>` | `2026-05-16-fail-pageforge-3` |
| `spec-merge` | `YYYY-MM-DD-spec-<spec-slug>` | `2026-05-16-spec-v3-second-brain` |
| `manual-harvest` | `YYYY-MM-DD-manual-<topic-slug>` | `2026-05-16-manual-vendor-notes` |
| `practice-loop` | `YYYY-MM-DD-practice-<topic-slug>` | `2026-05-16-practice-azure-functions` |

Rule: every `run_id` starts with an ISO date prefix. If you cannot form one from the table above, you are using the wrong trigger.

---

## Section B — Metadata schema

```typescript
// .claude/skills/memory-harvester/references/classify.ts enforces this shape
interface MemoryWriteMetadata {
  // ─── Versioning ─────────────────────────────────────────────
  schema_version: "1.0.0";                  // stamped by defaults.ts; bump on migration

  // ─── Environment isolation ──────────────────────────────────
  env: "test" | "dev" | "prod";             // from V3_MEM0_ENV; defaults to "prod"
  cohort?: string;                          // optional sub-isolation token, e.g. "smoke-2026-05-16"

  // ─── Classification ─────────────────────────────────────────
  type: "principle" | "semantic" | "procedural" | "episodic" | "reflective";
  category: "technical" | "functional" | "project";
  importance: "critical" | "high" | "medium" | "low";
  confidence: number;                       // 0.0–1.0

  // ─── Provenance (who/what/where) ────────────────────────────
  trigger: "post-run" | "post-retro" | "failure-diagnosis"
         | "spec-merge" | "manual-harvest" | "practice-loop";
  actor: "executive" | "worker" | "human";  // who PRODUCED the fact
  worker_vendor?: "claude" | "codex" | "kimi" | "kimi-cli" | "kimi-wire";
  source: string;                           // path/to/markdown-the-harvester-read.md
  harvest_run: string;                      // mirrors run_id; kept for back-compat readability

  // ─── Optional retrieval aids ────────────────────────────────
  outcome?: "success" | "failure" | "partial";  // applies mostly to episodic
  tags?: string[];                          // ≤ 8 short kebab-case tokens
  expires_at?: string;                      // ISO datetime; cleanup eligible after this
}
```

### B.1 — Field rules

- **`schema_version`** — Stamped by `defaults.ts` from a single constant. Bump only on a real migration. Old records keep their old version stamp; readers can filter on it.
- **`env`** — Defaults to `prod`. Use `test` for POC writes, validation runs, scratch experiments. Use `dev` for one-off operator exploration. The reader's `scope.md` defaults to `env: "prod"` so test writes never leak into real searches.
- **`cohort`** — Optional. Use only when parallel test runs share `env: "test"` and you need surgical cleanup (e.g. POC A vs POC B both running with `env: "test"` simultaneously).
- **`type`** — The fact's *shape* (durable principle? observed pattern? happened-once event?).
- **`category`** — Existing skill taxonomy. Picked to match `category` on SKILL.md frontmatter.
- **`importance`** — Reader can drop low-importance memories first when token-budgeting the worker memory pack.
- **`confidence`** — 0.0–1.0. Episodic facts default 1.0 (it happened). Principles 1.0 (authored spec). Semantic/procedural/reflective graded by evidence strength.
- **`trigger`** — Which executive hook called the harvester. Not free-form; one of the six in §A.2.
- **`actor`** — Who *produced* the fact, not who wrote the memory. The writer is always `agent_id: "executive"`. A retro about a kimi worker's flaky behavior has `actor: "worker"`, `worker_vendor: "kimi-cli"`.
- **`worker_vendor`** — Required when `actor: "worker"`. Must match `AgentWorkerVendor` in `src/core/vendor/types.ts`.
- **`source`** — Real path the harvester read. Never invent. Use the path it would resolve to from the repo root.
- **`harvest_run`** — Equals `run_id`. Two fields, one truth. Kept because pre-taxonomy memories had only `harvest_run` in their metadata and we want grep-search to find both shapes.
- **`outcome`** — Optional. Mostly meaningful for `episodic` type. Lets the reader query for "show me past failure runs of this bundle."
- **`tags`** — Short literal tokens. Kebab-case for normal tokens, SCREAMING_SNAKE for error codes / verbatim identifiers. `["EAI_AGAIN", "retry-strategy", "kimi"]` — not paraphrased sentences. mem0 leaves metadata strings unmodified, so tags survive extraction unlike the prose `text`. ≤ 8 tags; regex `/^[a-z0-9][a-z0-9_-]*$/i`.
- **`expires_at`** — ISO datetime. Optional. When set, a future cleanup job can prune. Use for memories tied to a temporary state (e.g. "vendor X is rate-limiting today").

### B.2 — Required vs optional summary

**Required** (validator rejects if missing): `schema_version`, `env`, `type`, `category`, `importance`, `confidence`, `trigger`, `actor`, `source`, `harvest_run`.

**Conditionally required**: `worker_vendor` when `actor: "worker"`.

**Optional**: `cohort`, `outcome`, `tags`, `expires_at`.

---

## Section C — Authoring rules for the harvester

When the agentic harvester composes a payload, it must:

1. **Read the source markdown fully** before classifying — never write from a partial read.
2. **Embed literal discriminators in `text`** — bundle slug, run_id, harvest_run, file paths, vendor name, error codes, timestamps. mem0 paraphrases prose during extraction; literals survive.
3. **Pick one `type`** per fact; do not encode multiple facts in one memory.
4. **Use `tags` for retrievability**, not as a synonym for `category`. Examples: `["retry-strategy", "kimi-cli", "EAI_AGAIN"]`.
5. **Default `env` from `V3_MEM0_ENV`** via `defaults.ts` — do not hardcode.
6. **Set `expires_at`** when a fact is known to be temporary (rate-limit observations, vendor maintenance windows).

### C.1 — Anti-patterns the validator and reviewers will reject

- Restating what the source markdown already says (write a pointer, not a paraphrase)
- A fact with no stable identifier (no project slug, no date, no entity name in either `text` or `metadata`)
- **Transient live-state** files (`progress.md`, `needs-you.md`, `queue.md`, `completed.md`, `goals.md`, `*-state.json`, generated `reports/`) — these are snapshots of "right now," constantly overwritten, not a record of what happened. They stay in markdown, never in mem0. (Contrast: *completed project bundles* and *retros* ARE history → harvest them. See `backfill.md` for the full bucket→disposition map and the distill-vs-dump rule for raw logs.)
- A `type: principle` with `immutable: false` (principles are always immutable)
- A `type: episodic` without a `run_id` matching `post-run` format
- A `worker_vendor` set with `actor: "executive"` (logical contradiction)

---

## Section D — Cleanup & migration patterns

### D.1 — Drop all test memories
```typescript
await client.delete({ filters: { user_id: USER_ID, env: "test" } });
```

### D.2 — Drop one test cohort (parallel POC isolation)
```typescript
await client.delete({ filters: { user_id: USER_ID, env: "test", cohort: "smoke-2026-05-16" } });
```

### D.3 — Drop expired temporary memories (run nightly)
```typescript
const now = new Date().toISOString();
const expired = await searchPaginated({ filters: { user_id: USER_ID, expires_at: { $lt: now } } });
await Promise.all(expired.map(m => client.delete(m.id)));
```

### D.4 — Migrate v1.0.0 → v2.0.0 (breaking)
1. Snapshot first (`memory-snapshot` skill).
2. Enumerate v1 records: `filters: { schema_version: "1.0.0" }`.
3. Transform each record's metadata to v2 shape.
4. Re-add with `schema_version: "2.0.0"`.
5. Delete v1 records.
6. Verify count matches snapshot.

The migration itself should be a one-off skill (e.g. `taxonomy-migrate-v1-to-v2`) that lives in `.claude/skills/` and gets retired after the migration runs.

---

## Section E — Migration policy

When this taxonomy needs to change:

1. **Adds** (new optional field, new enum value) → bump minor: `1.0.0` → `1.1.0`. No migration needed; old records lack the field, validator stays permissive on optional fields.
2. **Refinements** (tighter validation on an existing field, e.g. requiring a new enum value) → bump patch: `1.0.0` → `1.0.1`. Document the gotcha; old records remain valid but readers may want to filter `schema_version: ">=1.0.1"`.
3. **Breaks** (field rename, required field added, enum value removed) → bump major: `1.0.0` → `2.0.0`. Migration skill required (§D.4).

Every change updates:
- This file (`taxonomy.md`) — text spec
- `defaults.ts` — `SCHEMA_VERSION` constant
- `classify.ts` — validation rules
- `taxonomy-changelog.md` — append a dated entry

---

## Appendix — Worked examples

### Example 1: Post-run episodic (success)
```json
{
  "text": "Run `2026-05-16-credit-card-stockpile` (source: workspace/in-progress/credit-card-stockpile/STEPS.json) completed all 12 steps. Vendor: claude. No retries. Validator PASS on all DoD items.",
  "user_id": "irin-julg",
  "agent_id": "executive",
  "app_id": "credit-card-stockpile",
  "run_id": "2026-05-16-credit-card-stockpile",
  "metadata": {
    "schema_version": "1.0.0",
    "env": "prod",
    "type": "episodic",
    "category": "project",
    "importance": "medium",
    "confidence": 1.0,
    "trigger": "post-run",
    "actor": "worker",
    "worker_vendor": "claude",
    "source": "workspace/in-progress/credit-card-stockpile/STEPS.json",
    "harvest_run": "2026-05-16-credit-card-stockpile",
    "outcome": "success",
    "tags": ["clean-run", "no-retries"]
  },
  "immutable": false
}
```

### Example 2: Post-retro reflective (cross-run pattern)
```json
{
  "text": "Across runs 2026-05-09-foo, 2026-05-12-bar, 2026-05-14-baz: kimi-cli vendor fails npm-install step ~40% of the time with `EAI_AGAIN`. Retry attempt 2 succeeds in every observed case. Source: ai-docs/v2/2026-05-15-v2.4/retro-kimi-flakes.md.",
  "user_id": "irin-julg",
  "agent_id": "executive",
  "app_id": "_global",
  "run_id": "2026-05-16-retro-kimi-flakes",
  "metadata": {
    "schema_version": "1.0.0",
    "env": "prod",
    "type": "reflective",
    "category": "technical",
    "importance": "high",
    "confidence": 0.85,
    "trigger": "post-retro",
    "actor": "worker",
    "worker_vendor": "kimi-cli",
    "source": "ai-docs/v2/2026-05-15-v2.4/retro-kimi-flakes.md",
    "harvest_run": "2026-05-16-retro-kimi-flakes",
    "tags": ["EAI_AGAIN", "retry-strategy", "kimi-cli", "npm-install"]
  },
  "immutable": false
}
```

### Example 3: Spec-merge principle (immutable)
```json
{
  "text": "Constitutional pillar: workers never call mem0 directly. The executive harvester is the SOLE WRITER. Source: workspace/constitution.md §V3.0 Pillars.",
  "user_id": "irin-julg",
  "agent_id": "executive",
  "app_id": "_global",
  "run_id": "2026-05-16-spec-v3-second-brain",
  "metadata": {
    "schema_version": "1.0.0",
    "env": "prod",
    "type": "principle",
    "category": "technical",
    "importance": "critical",
    "confidence": 1.0,
    "trigger": "spec-merge",
    "actor": "human",
    "source": "workspace/constitution.md",
    "harvest_run": "2026-05-16-spec-v3-second-brain",
    "tags": ["pillar", "executive-only", "harvester"]
  },
  "immutable": true
}
```

### Example 4: Test cohort (sandboxed)
```json
{
  "text": "POC smoke test 2026-05-16: harvester wrote a sample memory; ledger contains eventId abc123. Source: tests/e2e/v3-memory/smoke.ts.",
  "user_id": "irin-julg",
  "agent_id": "executive",
  "app_id": "_executive",
  "run_id": "2026-05-16-manual-smoke",
  "metadata": {
    "schema_version": "1.0.0",
    "env": "test",
    "cohort": "smoke-2026-05-16",
    "type": "episodic",
    "category": "technical",
    "importance": "low",
    "confidence": 1.0,
    "trigger": "manual-harvest",
    "actor": "human",
    "source": "tests/e2e/v3-memory/smoke.ts",
    "harvest_run": "2026-05-16-manual-smoke",
    "outcome": "success",
    "tags": ["smoke-test", "poc"]
  },
  "immutable": false
}
```
