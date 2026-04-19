# v2.4.2 — Prerequisite Insertion False-Positive Fix

**Status:** Planned
**Focus:** Stop the deterministic `insertPrerequisiteStep` post-processor from contaminating backend-only goals with hardcoded "Supabase + UI" prereq steps. Goal-breakdown must respect explicit "no database" / "in-memory only" PROMPTs.

> **Sub-release of v2.4.** Triggered by the `task-scheduler-api` run on 2026-04-18 where `insertPrerequisiteStep` fired on a goal whose PROMPT body explicitly says *"No UI, no database, no auth. State is held in-process with periodic snapshot to a JSON file under `data/state.json`"* — and the worker, following the contradictory step description, started provisioning cloud Supabase tables for an in-memory app.

## Why v2.4.2 Exists

### What happened (live evidence)

`workspace/in-progress/P2/task-scheduler-api/PROMPT.md` declares unambiguously:

```
tags: [kimi-test, backend, nodejs, api, no-ui, v2.3-worktree-test]
```

with the body:

```
No UI, no database, no auth. State is held in-process with periodic snapshot to
a JSON file under `data/state.json` so a restart resumes cleanly.

- **Persistence**: in-memory + periodic JSON snapshot (every 5s, debounced) to `data/state.json`
```

Yet `goal-breakdown.ts` produced a 21-step plan starting with:

```
0  [prerequisite]  [PREREQUISITE-0] Database schema + seed data
1  [prerequisite]  [PREREQUISITE-1] API endpoints + curl smoke tests
```

The Step 0 description (verbatim from the hardcoded TS template) instructs the worker to:

> "1. Create/verify the database schema for this goal.
>  2. Seed realistic test data (not hardcoded mocks in components) that downstream UI can read.
>  3. Fill out the structured handoff with: exact table names + columns, sample row IDs you seeded, connection method (env vars, client file)."

The Kimi worker (contract `1776568738973`) read the PROMPT, read the step description, observed Supabase credentials available in `.env.app`, and connected to `aws-1-us-east-2.pooler.supabase.com` to create tables for a goal that explicitly forbids them.

### Where the failure is rooted

| Layer | Failure | Type | % |
|---|---|---|---|
| 1 | `WEB_PROJECT_KEYWORDS` regex matches "API" / "endpoint" → `isWeb=true` on a backend-only goal | Deterministic (TS) | 30% |
| 2 | `insertPrerequisiteStep` trigger condition `(isWeb && (hasBackend || data_requirements))` doesn't check for explicit "no database" | Deterministic (TS) | 25% |
| 3 | Hardcoded prereq description hardcoded for Supabase+UI ("create the database schema", "downstream UI can read", "exact table names + columns") | Deterministic (TS) | 20% |
| 4 | Step 0 description is the template alone — does not echo the PROMPT body's persistence statement | Deterministic (TS) | 5% |
| 5 | LLM goal-breakdown can't override the deterministic post-processor (architectural — runs LLM first, then post-processes) | Agentic (architecture) | — |
| 6 | Worker LLM saw the contradiction (PROMPT says no DB, step says create DB) and chose to follow the step instead of escalating to needs-you.md | Agentic (worker) | 15% |
| 7 | PROMPT omits the `data_requirements` frontmatter field even with explanatory comment, so the deterministic check sees nothing to read | Prompt design | 5% |

**Net: ~75% deterministic TypeScript code, ~15% agentic worker behavior, ~10% PROMPT-design / convention.**

### Why this matters more than the one-off bug

`insertPrerequisiteStep` was added in v2.4 I2 specifically to prevent the v2.1.6 retro failure mode where Kimi workers built UI on top of mocked APIs because no DB existed. That fix is correct *for goals that need a DB*. But it has no off-switch for goals that explicitly declare they don't, and a backend-only goal is exactly the kind of case where the rigid template causes harm.

This is the deterministic side of the same broader concern as v2.4.1: agent intelligence is being short-circuited by hardcoded TypeScript. v2.4.1 addresses the prompt-injection side (workers paying for skills they don't need); v2.4.2 addresses the breakdown side (workers being given prerequisite steps that contradict their goal).

---

## Scope

### In Scope

1. **Tighten `WEB_PROJECT_KEYWORDS`** so backend-API tokens like `api`, `endpoint`, `route`, `service` don't trigger `isWeb=true` on their own — require an actual rendering keyword (`react`, `next`, `vue`, `html`, `tsx`, `ui`, `page`)
2. **Add explicit "no-database" detection** — a regex over the PROMPT body for phrases like `no database`, `in-memory only`, `JSON file`, `no DB`, `no persistence layer`, etc., that suppresses prereq insertion regardless of other signals
3. **Honor `tags: [no-ui]` and `tags: [no-database]`** as hard suppression flags — if either appears, no UI prereqs / no DB prereqs are inserted
4. **Make `insertPrerequisiteStep` data-layer-aware** — the prereq description must reference what the goal actually says about persistence (file-based, in-memory, Postgres, etc.) and quote the relevant PROMPT excerpt verbatim. No more hardcoded "create the database schema" template for goals that don't have one
5. **Add a "PROMPT excerpt" section** to every prereq step description so workers see "according to your PROMPT, persistence is `<excerpt>`" before they see the generic instructions
6. **Update worker-base SKILL** with explicit guidance: when a step description contradicts the PROMPT body (e.g., step says "create DB", PROMPT says "no DB"), STOP and write to `needs-you.md` — do not pick one and proceed
7. **Update workspace-instructions** to recommend `data_requirements: "none — in-memory + <persistence layer>"` for explicit no-DB goals, instead of omitting the field
8. **Adhoc test coverage** — at least three tests covering: (a) backend-only no-DB goal does NOT receive prereq, (b) web+DB goal still receives correct prereq with proper data-layer description, (c) web+no-DB goal (e.g. localStorage-only Recipe Book) does NOT receive DB prereq

### Out of Scope

- Giving the LLM goal-breakdown veto power over the deterministic post-processor (architectural change tracked separately, see "Future")
- Rewriting the prereq insertion to be fully LLM-driven (over-engineered for this fix; deterministic with better signals is the right level)
- Migrating existing in-progress goals — fix forward, defects on this run get hand-cleaned

---

## Approach

### Phase 1 — Tighten WEB_PROJECT_KEYWORDS (1 hr)

`src/agentic/work-selection/goal-breakdown.ts`:

```ts
// OLD — too broad, matches "API" alone
const WEB_PROJECT_KEYWORDS = /\b(react|next|vue|svelte|angular|html|css|page|route|api|endpoint|...)\b/i;

// NEW — split into rendering-required vs ambiguous
const WEB_RENDERING_KEYWORDS = /\b(react|next|vue|svelte|angular|html|tsx|jsx|page|component|ui|frontend)\b/i;
const isWeb = WEB_RENDERING_KEYWORDS.test(itemText) && !hasNoUiTag(item);
```

Rationale: a goal whose only "web-like" word is `api` is a backend goal. Insisting on a rendering keyword removes the false positive cleanly.

### Phase 2 — Explicit no-database / no-UI detection (1-2 hr)

Add helpers in `goal-breakdown.ts`:

```ts
// New constants
const NO_DATABASE_KEYWORDS = /\b(no database|no\s+db\b|in-memory|in\s+memory|json\s+file|file[-\s]based|no\s+persistence|stateless|no\s+backend\s+db)\b/i;
const NO_UI_KEYWORDS = /\b(no\s+ui|backend[-\s]only|api[-\s]only|server[-\s]only|cli[-\s]only)\b/i;

function declaresNoDatabase(item: WorkItem): boolean {
  if (item.tags?.includes('no-database')) return true;
  const body = `${item.title} ${item.description || ''}`;
  return NO_DATABASE_KEYWORDS.test(body);
}

function declaresNoUi(item: WorkItem): boolean {
  if (item.tags?.includes('no-ui')) return true;
  const body = `${item.title} ${item.description || ''}`;
  return NO_UI_KEYWORDS.test(body);
}
```

Update the trigger condition in `insertPrerequisiteStep`:

```ts
// OLD
if (!(isWeb && (hasBackend || item.data_requirements))) return steps;

// NEW
if (declaresNoDatabase(item)) return steps;          // hard suppress
if (declaresNoUi(item) && !item.data_requirements) return steps;  // backend-only without explicit DB needs no UI prereq
if (!(isWeb && (hasBackend || item.data_requirements))) return steps;
```

### Phase 3 — Data-layer-aware prereq descriptions (2 hr)

Refactor the hardcoded template strings. Currently the description is a single literal that assumes Supabase+UI. New shape:

```ts
function buildPrereq0Description(item: WorkItem): string {
  const persistenceExcerpt = extractPersistenceExcerpt(item);
  const isFileBased = /json\s+file|file[-\s]based/i.test(item.description || '');

  return [
    'Hard-locked prerequisite — no API or other work may start until this passes.',
    '',
    `### Persistence layer for this goal (excerpt from PROMPT)`,
    persistenceExcerpt || '_(none specified — read PROMPT.md for context)_',
    '',
    isFileBased
      ? '1. Create the file path and any required directory structure.\n2. Initialize the file with seed state matching the schema your PROMPT describes.\n3. Fill out the structured handoff with: file path, schema shape, sample IDs.'
      : '1. Create/verify the database schema for this goal.\n2. Seed realistic test data (not hardcoded mocks).\n3. Fill out the structured handoff with: table names + columns, sample row IDs, connection method.',
    // ...
  ].join('\n');
}

function extractPersistenceExcerpt(item: WorkItem): string | null {
  // Find the lines in description matching /persistence|state|storage|database|in-memory/i
  // Return up to 3 such lines so the worker sees the actual PROMPT context
}
```

Same for `buildPrereq1Description` — it should reference the actual API surface declared in the PROMPT, not generic "API endpoints".

### Phase 4 — Worker contradiction-detection guidance (30 min)

Add to `claude-files-to-output/skills/worker-base/SKILL.md` a new short section under "Execution Guidelines":

```markdown
### When a step description contradicts the PROMPT body

If the step assigned to you says one thing about persistence, data flow, or scope and the PROMPT body says the opposite (example: step says "create the database schema" but PROMPT says "no database, JSON file only"), STOP. Do not pick one and proceed.

This is a goal-breakdown defect, not a worker decision. Append a short note to `workspace/needs-you.md` describing the contradiction (quote both lines) and stop the step. The defect will be triaged on the executive's next pass; resuming on a contradictory plan wastes turns and ships wrong implementations.

The Kimi worker on the v2.4 task-scheduler-api run wired up cloud Supabase for an in-memory goal because the step said "create database schema" while the PROMPT said "in-memory + JSON file only". Don't be the next one.
```

### Phase 5 — workspace-instructions update (15 min)

Update `workspace-instructions/PROMPT.template.md` (or wherever the field reference lives) to recommend:

```yaml
# For goals that explicitly do NOT need a database, set:
data_requirements: "none — in-memory + JSON file snapshot at data/state.json"
# Setting this (rather than omitting) gives the goal-breakdown's deterministic
# prereq inserter the signal it needs to skip database-prereq insertion.
```

### Phase 6 — Adhoc tests (2 hr)

Add three adhoc tests under `tests/adhoc/`:

- `j1-no-db-goal-skips-prereq.adhoc.ts` — feed a backend-only no-DB goal to `insertPrerequisiteStep`, assert the step list is unchanged
- `j2-web-with-db-still-gets-prereq.adhoc.ts` — feed a web + DB goal (e.g. an expense-tracker-style PROMPT), assert PREREQUISITE-0 + PREREQUISITE-1 are inserted
- `j3-prereq-description-quotes-prompt.adhoc.ts` — feed a goal with persistence specifics, assert the rendered prereq description contains the persistence excerpt
- `j4-no-ui-tag-suppresses-prereq.adhoc.ts` — feed a goal with `tags: [no-ui]`, assert no prereq

Add a script entry: `npm run test:retro-j` (mirroring v2.4 H/I conventions).

---

## Success Criteria

The release is successful when ALL of the following are true:

1. **Re-running task-scheduler-api breakdown produces 0 prereq steps** — verified by running goal-breakdown against the existing PROMPT.md and inspecting the step list
2. **Re-running expense-tracker-supabase breakdown still produces 2 prereq steps** with correct descriptions referring to Supabase, schema, etc. — no regression on the goals that genuinely need them
3. **Re-running recipe-book-ui breakdown produces 0 prereq steps** — localStorage-only web goal should not get DB prereqs (today it correctly doesn't, but this codifies that behavior)
4. **Worker contradiction-escalation works** — manual test where a worker is given a step description that contradicts its PROMPT, verify it appends to needs-you.md and stops instead of guessing
5. **All four adhoc tests (j1-j4) pass**
6. **No false negatives** — at least one synthetic goal that's web + DB without explicit `no-database` text correctly receives prereqs

---

## Files Affected

| File | Change |
|---|---|
| `src/agentic/work-selection/goal-breakdown.ts` | Tighten `WEB_PROJECT_KEYWORDS` to require rendering tokens; add `NO_DATABASE_KEYWORDS`, `NO_UI_KEYWORDS`, `declaresNoDatabase`, `declaresNoUi`; new trigger condition in `insertPrerequisiteStep`; refactor prereq description builders |
| `claude-files-to-output/skills/worker-base/SKILL.md` | New "When a step description contradicts the PROMPT body" section under Execution Guidelines |
| `workspace-instructions/PROMPT.template.md` | Recommend explicit `data_requirements: "none — ..."` for no-DB goals |
| `tests/adhoc/j1-no-db-goal-skips-prereq.adhoc.ts` | NEW |
| `tests/adhoc/j2-web-with-db-still-gets-prereq.adhoc.ts` | NEW |
| `tests/adhoc/j3-prereq-description-quotes-prompt.adhoc.ts` | NEW |
| `tests/adhoc/j4-no-ui-tag-suppresses-prereq.adhoc.ts` | NEW |
| `package.json` | Add `test:retro-j` and include in `test:v2.4` |

---

## Cleanup Required Before / After Fix

The current task-scheduler-api run created Supabase tables for a goal that should not have them. Before declaring v2.4.2 complete:

1. Identify the schema name the worker created (likely `task_scheduler_v1` or similar)
2. `DROP SCHEMA <name> CASCADE` against the cloud Supabase project
3. Either:
   - Restart the goal under v2.4.2's improved breakdown (preferred — gets a clean retrospective on the fix)
   - Or hand-edit STEPS.json to remove the prereq steps and resume on Step 2 (pragmatic but doesn't validate the fix)

---

## Open Questions

1. **Should the LLM breakdown have veto power over deterministic post-processing?** Today the order is: LLM breaks down → deterministic post-processor adds prereqs. The LLM has no visibility or override. Architectural change candidate for v2.5: deterministic post-processor proposes prereqs, LLM confirms/rejects with one extra call. Costs another LLM round-trip per breakdown but fixes the whole class of false positives. Defer until v2.4.2 telemetry shows whether the regex tightening is sufficient.
2. **What's the right granularity for `data_requirements`?** It's currently a free-text field. For v2.4.2 we recommend "none — in-memory + JSON file" as a convention, but should we make it structured (`{kind: "none" | "supabase" | "sqlite" | "file" | "redis"}`)? Defer — text is fine until we have multiple consumers of the field.
3. **Should the worker contradiction-escalation be a hard verifier?** Right now we're adding worker-base guidance and trusting Kimi/Codex/Claude to escalate. Should there also be a verifier that scans the worker log for "PROMPT vs step" contradictions? Probably yes for v2.5; for v2.4.2 the SKILL guidance is the cheap first step.

---

## References

- `src/agentic/work-selection/goal-breakdown.ts` — `WEB_PROJECT_KEYWORDS`, `DATA_BACKEND_KEYWORDS`, `insertPrerequisiteStep` (the file this goal modifies)
- v2.4 goal: I2 prereq splitting (`ai-docs/v2/2026-04-18-v2.4/goal.md`) — context for why prereqs were added in the first place
- v2.4.1 goal: Progressive skill disclosure (`ai-docs/v2/2026-04-18-v2.4/goal-2.4.1.md`) — sister fix on the same theme of "deterministic TS short-circuiting agent intelligence"
- Live evidence: `workspace/in-progress/P2/task-scheduler-api/PROMPT.md`, `STEPS.json`, worker log `ledgers/2026-04-19/worker-contract-1776568738973.log` — direct proof of the false-positive
