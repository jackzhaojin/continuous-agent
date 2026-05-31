---
title: V3.0 Second-Brain Corpus Backfill — Migration Record
date: 2026-05-24
status: Complete (validated PASS)
type: migration-record
related:
  - ai-docs/v3/2026-05-16-v3.0/2026-05-15-second-brain-hosting-decision.md
  - ai-docs/v3/2026-05-16-v3.0/2026-05-16-implementation-plan-1-agentic-memory.md
  - .claude/skills/memory-harvester/references/backfill.md
  - .claude/skills/memory-harvester/references/taxonomy.md
  - ai-docs/v3/mem0-snapshots/2026-05-24.json
snapshot_source: mem0 MCP list_entities + search (live, 2026-05-24)
---

# V3.0 Second-Brain Corpus Backfill — Migration Record

> One-time agentic migration of the existing local knowledge corpus into the mem0 second brain. This doc is the **traceability record**: high-level why/what/how + low-level source→destination map so any memory can be traced back to its origin file and vice versa.

---

## High level

### Why
The V3.0 second brain existed only as scaffolding — the mem0 store held ~22 throwaway POC/test memories and nothing real. The executive's accumulated operational knowledge (constitution, locked pillars, retros, capability registries, completed-project history) lived only in local markdown/YAML, invisible to agentic recall. Goal: **distill that local knowledge into mem0** so the executive (and, via memory packs, workers) can actually use it — while keeping the repo canonical.

**Invariant preserved:** markdown/git is the source of truth; mem0 is a *derived, rebuildable projection*. If they disagree, the repo wins. Nothing below dumps raw files — everything is distilled into findable pointers.

### What
A 7-step pipeline, all on 2026-05-24:

1. **Archive** the pre-migration store → `ai-docs/v3/mem0-snapshots/2026-05-24.json` (22 memories + history).
2. **Purge** those 22 → 0 (clean slate; they were POC noise).
3. **Harvest** 4 lanes (A principles / B retros / C capabilities / D episodic).
4. **Validate** independently.

**Result: ~110 payloads written → ~131 mem0 rows** (mem0 extraction splits some payloads into facet-rows). Validator verdict: **PASS**.

### How
Maximally agentic, per operator request:
- **Coordinator** (interactive Claude Code) planned the lanes, ran archive+purge, and spawned subagents.
- **4 harvest subagents** (one per lane) each read `backfill.md` + `taxonomy.md` + `playbook.md`, classified their sources into the 5-type taxonomy, and wrote via the unified `mem0` CLI (`./bin/mem0 add --batch`) — composing payloads themselves (not hardcoded). Lanes A→(B‖C)→D, with D de-duping against B.
- **1 validator subagent** independently verified type coverage, quality (playbook §C gallery), principle-immutability, leakage, dupes, and source-path sanity.
- This live snapshot was pulled via the **mem0 MCP** (`list_entities` + `search`); the agentic writes used the **CLI** (MCP stays ad-hoc/human-only).

---

## Low-level source → destination trace

Every memory carries scope IDs (`user_id=irin.julg`, `agent_id=executive`, `app_id`, `run_id`) + `metadata.source` (the real repo path read). To trace **destination → source**: read a memory's `metadata.source`. To trace **source → destination**: find the `run_id` below and `./bin/mem0 search --query "<topic>" ` (or filter by app/run).

### Lane A — Principles (`trigger=spec-merge`, `actor=human`, `immutable=true`)

| Source file | → run_id | app_id | type×count | sample mem IDs |
|---|---|---|---|---|
| `workspace/constitution.md` | `2026-05-24-spec-constitution` | `_global` | principle ×10 | `91a8376c` (Art I §1 cost cap) |
| `ai-docs/v3/2026-05-16-v3.0/second-brain-hosting-decision.md` | `2026-05-24-spec-second-brain-hosting` | `_global` | principle ×7, reflective ×1 | `074d1ddf` (Pillar 1), `5e8c07fa` (Pillar 4) |
| `ai-docs/v3/2026-05-16-v3.0/implementation-plan-1-agentic-memory.md` | `2026-05-24-spec-v3-impl-plan` | `_global` + `_executive` | principle ×3, reflective ×1 | — |
| `ai-docs/v3/2026-05-16-v3.0/goal.md` | — | — | 0 (deduped — pillars verbatim-dup of hosting-decision) | — |
| `workspace/preferences.md` | — | — | 0 (empty template) | — |

### Lane B — Retros & learnings (`trigger=post-retro`/`manual-harvest`)

| Source file | → run_id | app_id | type×count | sample mem IDs |
|---|---|---|---|---|
| `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.5.md` | `2026-05-24-retro-b2b-postal-checkout-v2.1.5` | `_global` | reflective/semantic ×5 | `7ea193d0` ("beautiful pieces, broken whole") |
| `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.6.md` | `2026-05-24-retro-b2b-postal-checkout-v2.1.6` | `_global` | reflective/semantic/procedural ×6 | `e6d96fdf` (backend-first procedure) |
| `ai-docs/v2/2026-05-09-v2.4-azure-modification/retro-azure-star-generator-cicd-pass-1.md` | `2026-05-24-retro-azure-star-generator-cicd-pass-1` | `_global` + `_skill-azure-function-deploy` + `azure-star-generator-cicd-pass-1` | semantic/reflective ×6 | — (OIDC `AADSTS700213` fact) |
| `learning/finance-dashboard-comparison-2026-03-31.md` | `2026-05-24-manual-finance-dashboard-comparison` | `_global` | semantic ×2 | `71f5fcd9` (vendor attempt counts) |
| `learning/retrospectives/*.md` (13 weekly auto-retros) | `2026-05-24-retro-weekly-auto-retros` | `_global` | reflective ×1 (distilled — rest are confidence churn, skipped) | — |
| `learning/evolution-log.jsonl` (1530 entries) | `2026-05-24-manual-evolution-log` | `_executive` | reflective ×1 (8 bootstrap self-mods; 1458 validation_result churn skipped) | — |

### Lane C — Capabilities (`trigger=manual-harvest`, `actor=executive`, point-in-time snapshot)

| Source file | → run_id | app_id | type×count | notes |
|---|---|---|---|---|
| `capabilities/technical-capabilities.yml` | `2026-05-24-manual-capabilities` | `_global` | semantic ×13 | Demonstrated/Reliable only; 5 Declared skipped |
| `capabilities/functional-capabilities.yml` | `2026-05-24-manual-capabilities` | `_global` | semantic ×14 | all Demonstrated/Reliable |
| `capabilities/delivery-capabilities.yml` | `2026-05-24-manual-capabilities` | `_global` | semantic ×4 | 6 Declared skipped |
| `capabilities/services-registry.yml` | — | — | 0 | no maturity facts (declarative registry) |
| `capabilities/sdk-registry.yml` | — | — | 0 | different maturity vocab (stable/beta) |
| `capabilities/project-memory.yml` | (handed to Lane D) | — | 0 here | completed-project records → episodic |

Every Lane C memory carries `tags:[…,"capability-snapshot"]` + `expires_at: 2026-08-22T00:00:00Z` (≈90d). The YAML stays canonical; these are a dated, expiring projection (confidence/maturity drift over time).

### Lane D — Episodic (`trigger=post-run`, `actor=worker`+`worker_vendor` / `human`, `confidence=1.0`)

35 completed bundles under `workspace/completed/<bundle>/` → **35 episodic memories**, one per bundle. `app_id = <bundle-slug>`, `run_id = <completion-date>-<bundle-slug>`, `source = workspace/completed/<bundle>/PROMPT.md`. Outcomes cross-referenced from `ledgers/work-ledger.jsonl` + retro ledger.

- **Outcome split:** 31 success · 3 partial (`pageforge-cms`, `expense-tracker-supabase`, `playwright-demo-skill`) · 1 deliberate failure (`harness-generic-fail`).
- **Vendor split:** claude / codex / kimi / kimi-cli / kimi-wire from each PROMPT.md; `actor=human` (no vendor) for 4 self-enhance/skill-build bundles.
- **Sample:** `d3b382e7` (`2026-05-09-azure-star-generator-cicd-pass-1`, claude, GOAL_COMPLETED).
- **Full run_id list** (from MCP `list_entities`, app+run names match): `2026-01-29-chatbot-ui-react`, `2026-01-29-retro-dashboard`, `2026-02-01-integrate-self-improvement-loop-triggers`, `2026-02-01-playwright-demo-skill`, `2026-02-02-{weekly-retrospective,music-player-ui,practice-loop,recipe-card-explorer,reference-refresh}`, `2026-02-03-recipe-demo-video{,-v2}`, `2026-02-04-{migrate-recipe-app-supabase,pageforge-cms}`, `2026-03-28-fix-chatapp-oauth-and-demo`, `2026-03-29-{fix-pageforge-routing,hello-react,v2-validation-todo-app,simple-react-notes-app}`, `2026-03-30-{v2-smoke-test}`, `2026-04-01-finance-dashboard-{claude,codex}`, `2026-04-05-finance-dashboard-kimi-{cli,wire}`, `2026-04-06-b2b-postal-checkout`, `2026-04-12-b2b-postal-checkout`, `2026-04-18-{expense-tracker-supabase,existing-executive-hello}`, `2026-04-19-{harness-eds-hello,harness-generic-fail,harness-generic-hello,worktree-executive-hello,recipe-book-ui,task-scheduler-api}`, `2026-04-27-azure-star-generator-refresh-1`, `2026-05-09-azure-star-generator-cicd-pass-1`.

---

## MCP snapshot (live, 2026-05-24)

Pulled via `mcp__mem0__list_entities` + per-type `search`:

- **Entities:** 1 user (`irin.julg`), 1 agent (`executive`), **49 apps**, **58 runs**.
- **Memory rows (enumerate, undercounts):** ~131. Distribution by `type`:

| type | ~count | source lanes |
|---|---|---|
| principle | ~18–20 | A |
| semantic | ~57 | C (31 capability snapshots) + B (vendor facts) |
| episodic | ~36 | D (+ azure facet-split) |
| reflective | ~20 | B |
| procedural | 1 | B (`e6d96fdf`) — rarest type, expected |

- All rows `env=prod`, zero `cohort`. Trigger split: spec-merge ~20 / manual-harvest ~41 / post-run ~36 / post-retro ~34.

---

## What was deliberately NOT migrated

Per `backfill.md` dispositions (the repo stays canonical):

| Not migrated | Disposition | Why |
|---|---|---|
| `ledgers/*.log` (264M, 42 files) | **DISTILL LATER** (M8, deferred) | Raw operational stream — dumping blows retrieval + the free tier. Phase 2 will summarize per-week/incident. |
| `reports/` (dashboard.html, *.json) | NEVER | Generated render artifacts, not knowledge. |
| `workspace/{progress,needs-you,queue,completed}.md`, `*-state.json` | NEVER | Transient live-state — snapshots of "now," constantly overwritten, not history. |
| `ledgers/*.jsonl` | index only | Used to cross-reference episodic outcomes; not converted wholesale. |
| capability registries `services`/`sdk` | NEVER (as semantic) | Declarative inventory, no demonstrated-maturity facts. |

---

## Provenance & recovery

- **Pre-migration archive:** `ai-docs/v3/mem0-snapshots/2026-05-24.json` (the 22 purged POC memories — recoverable but not worth recovering).
- **Per-write ledger:** `ledgers/harvest-runs/2026-05-24.jsonl` (every `mem0 add` with memoryId + status + scope).
- **Rebuild path:** mem0 is reconstructible from this corpus by re-running the 4 lanes against the same sources, or from a snapshot via `snapshot.forEach(m => client.add(m))`.
- **No fresh post-migration snapshot yet** — the 4am `memory-snapshot` cron will capture the new 131-row baseline, or run `npx tsx .claude/skills/memory-snapshot/references/snapshot.ts` on demand.

## Validation summary (independent agent)

**PASS.** All 5 types present; 6/6 quality spot-checks GOOD (findable pointers w/ literal discriminators); **leakage CLEAN** (no transient-state, no raw-log dumps, no surviving test data); 45/45 `source` paths resolve to real files; zero exact duplicates (azure 4-facet split is legit mem0 extraction).

## Known quirks & open items

- **Test entity shells persist:** `list_entities` still shows `mcp-smoke-test`, `v3-cli-test-*`, `v3-hooks-test-*`, `latency-*`, `v3-test-04-*` as empty run/app records. The *memories* were purged (validator confirmed canary searches empty); mem0 keeps the entity shell after memory deletion. Cosmetic only.
- **`enumerate` undercounts** at this store size (mem0 v3 quirk, see `mem0-limitations.md` §4) — type counts above are approximate; `search`/`get` are authoritative.
- **Procedural sparsity** (1 memory) — expected for a principles/retros/episodics-heavy corpus; watch whether forward Stage-1 harvesting under-emits the "step-by-step that worked" branch.
- **M8 (raw-log distillation)** deferred to Phase 2.

## How to query it back

```bash
# executive / human, via the unified CLI (AND-wraps + auto user_id):
./bin/mem0 search --query "kimi npm install failure" --type reflective --top-k 5
./bin/mem0 search --query "b2b-postal-checkout outcome" --app-id b2b-postal-checkout
./bin/mem0 get --id 074d1ddf-…                 # any mem ID from the trace tables
./bin/mem0 list-entities                        # the scope inventory
```
Ad-hoc MCP (Claude Code): `mcp__mem0__search_memories` — remember `filters: { AND: [{ user_id: "irin.julg" }] }` explicitly (auto-injection returns empty).
