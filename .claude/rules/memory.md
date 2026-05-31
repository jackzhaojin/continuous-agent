# Memory — The V3.0 Second Brain

The executive agent has a **memory**: a mem0-cloud knowledge store it writes to as it works
and reads from before it acts. Shipped in V3.0 (the second-brain release). Provenance and the
full story live in [`ai-docs/v3/2026-05-16-v3.0/`](../../ai-docs/v3/2026-05-16-v3.0/README.md)
(rules document *how it works*; ai-docs document *why* and *what happened*).

## Locked pillars (do not violate)

1. **Executive-tier only.** Only the executive touches mem0. **Workers never call mem0**, never
   hold the API key, never get the MCP server. They are *fed* context via a memory pack baked
   into their generated `CLAUDE.md` (see `worker-spawner.ts`). Putting mem0 access in a worker
   skill is forbidden.
2. **Git is the source of truth; mem0 is a rebuildable projection.** Ledgers, retros, and specs
   on disk are canonical. mem0 can be wiped and re-backfilled. Never treat mem0 as authoritative.
3. **Skills-first, not a TS module.** There is no `src/agentic/memory/` data layer. The harvester,
   reader, snapshot, and backfill logic live as **skills** under `.claude/skills/memory-*`, each
   with deterministic helpers in its own `references/`. The one piece of glue in `src/` is the
   hook runner: `src/agentic/memory/run-hook.ts` (invokes a memory skill via the Agent SDK).
4. **CLI, not MCP, for the agent.** The executive drives mem0 through the unified `./bin/mem0`
   CLI (`.claude/skills/memory-harvester/references/mem0-cli.ts`), which bakes in every gotcha
   (filter shape, casing, auth, async-write polling). The mem0 MCP server is a human/ad-hoc tool only.

## The two skills

| Skill | Role | Writes? |
|-------|------|---------|
| `memory-harvester` | Decides what to **write** — classifies facts into the taxonomy, validates, calls `mem0 add`. **Sole writer.** | Yes |
| `memory-reader` | Decides what to **read** — composes natural-language queries agentically, synthesizes for the executive or packs context for a worker. | No (read-only) |

Supporting skills: `memory-snapshot` (daily DR backup → `ai-docs/v3/mem0-snapshots/{date}.json`, 04:00 cron) and the harvester's `backfill` reference (one-time corpus migration from local ledgers/retros).

## Five memory types (taxonomy v1.0.0)

`principle` (immutable rules) · `semantic` (cross-run facts) · `procedural` (how-tos that worked) ·
`episodic` (single-run outcomes) · `reflective` (failure patterns from retros). SSOT:
`.claude/skills/memory-harvester/references/taxonomy.md`. Every write carries `schema_version`
and is validated by `classify.ts` before mem0 sees it.

## Five lifecycle hooks (A–E)

Wired into the executive loop, each gated by `V3_MEMORY_ENABLED` (master) **plus** a per-hook flag:

| Hook | Flag | When | Direction |
|------|------|------|-----------|
| A `pre-work-selection` | `V3_MEM_HOOK_PRE_WORK` | before picking a goal | read |
| B `pre-spawn-pack` | `V3_MEM_HOOK_PRE_SPAWN` | before spawning a worker | read → worker pack |
| C `post-run-harvest` | `V3_MEM_HOOK_POST_RUN` | after a run completes | write |
| D `failure-diagnosis` | `V3_MEM_HOOK_FAIL_DIAG` | after a failure | read + conditional write |
| E `post-retro-harvest` | `V3_MEM_HOOK_POST_RETRO` | after a retro | write |

Read hooks are the expensive side (~8–14 mem0 retrievals each); the mem0 Hobby plan's **1K/month
retrieval** budget is the binding constraint. **Resumes re-pay the full read cost.**

## Retrieval is agentic and natural-language

The reader is not a fixed query checklist — it's a judgment task. The executive decides which
prior knowledge would serve *this* goal and asks for it in **full natural-language questions**
(mem0 ranks by embedding similarity), not keyword bags. Iterate 3–8 queries, refining on results.
See `memory-reader/SKILL.md` STEP 2 + `references/playbook.md` §B.

## Gotchas

- **Empty-string env vars are not nullish.** `V3_MEM0_COHORT=` loads as `""`, which the validator
  rejects — coerce with `|| undefined` (see `memory-harvester/references/defaults.ts`). A silent
  write failure here once cost a whole run's harvest.
- **Async writes don't surface immediately** in search — use `mem0 get --id` for fresh reads.
- **`getAll` is broken in mem0 v3** — the snapshot/enumerate path uses paginated `search()`.

## Config

Flags live in `.env.executive` (gitignored; executive-tier, never reaches workers). See
`.env.executive.example` and [`credentials-and-env.md`](credentials-and-env.md).
