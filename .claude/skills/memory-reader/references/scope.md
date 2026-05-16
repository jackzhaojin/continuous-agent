# Memory Scoping Reference

How memory writes and reads are scoped, and which casing applies where.

> **Authoritative taxonomy spec:** [`memory-harvester/references/taxonomy.md`](../../memory-harvester/references/taxonomy.md). This doc is the reader-side mirror — when they disagree, taxonomy.md wins.
> **Operational quirks:** see `mem0-limitations.md` §5 for the full casing table.

## Scope dimensions (all four always populated)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `user_id` | string | ✅ always | Canonical agent owner. From `V3_MEM0_USER_ID` env (never committed). |
| `agent_id` | string | ✅ always | Logical writer. V3.0: hardcoded `"executive"`. Reserved for future multi-agent split. |
| `app_id` | string | ✅ always | Project / bundle slug, OR a reserved slug starting with `_`. See §App_id conventions below. |
| `run_id` | string | ✅ always | Format depends on trigger (see taxonomy.md §A.2). All start with `YYYY-MM-DD-`. Stored server-side as `sessionId`. |

## App_id conventions

The taxonomy partitions memories into four kinds of "app":

| Pattern | Use for | Example |
|---|---|---|
| `<bundle-slug>` | Project work | `credit-card-stockpile` |
| `_global` | Cross-project lessons | `_global` |
| `_executive` | About the executive loop itself | `_executive` |
| `_skill-<slug>` | About a specific skill's behavior | `_skill-goal-drafter` |

When reading, broaden by querying multiple `app_id` values (mem0 doesn't OR-merge filters automatically — issue separate searches and merge).

## Casing — which surface uses which

**Writes (`client.add()` top-level options) — camelCase:**

```typescript
await client.add(messages, {
  userId: process.env.V3_MEM0_USER_ID,
  agentId: "executive",
  appId: "credit-card-stockpile",
  runId: "2026-05-16-credit-card-stockpile",
  metadata: { /* see classify.ts */ },
});
```

**Reads — `filters` keys use snake_case:**

```typescript
await client.search(query, {
  filters: {
    user_id: process.env.V3_MEM0_USER_ID,
    app_id: "credit-card-stockpile",
    // run_id, agent_id all snake_case here
  },
  topK: 10,            // top-level option — camelCase
});
```

**Mixing them is the most common mistake.** Filters always snake_case. Top-level options always camelCase. See `mem0-limitations.md` §5.

## Scope defaults

| Hook | Default `app_id` | Default `agent_id` | Default `metadata.env` filter | Notes |
|---|---|---|---|---|
| Pre-work-selection | unset (search across all apps) | `"executive"` | `"prod"` | Look broad — we want lessons from any project |
| Pre-spawn memory pack | the workItem's bundle slug + `_global` (two queries, merge) | `"executive"` | `"prod"` | Narrow to the project being worked + cross-cutting principles |
| Post-run harvest | the workItem's bundle slug | `"executive"` | — (writes carry env; reader picks env) | Episodic, scoped to project + run |
| Failure diagnosis | the workItem's bundle slug + `_global` retro pool | `"executive"` | `"prod"` | Two queries — project-specific + cross-project retros |
| Post-retro harvest | the retro doc's project slug (or `_global` for cross-project retros) | `"executive"` | — | Reflective memories live in the project that produced them |

**Env filter default = `"prod"`.** Test and dev writes are excluded from normal reader queries. To inspect test cohorts pass `env: "test"` (and optionally `cohort: "<token>"`) explicitly.

## Env vars consumed

```
V3_MEM0_API_KEY            # mem0 API key (executive only)
V3_MEM0_USER_ID            # canonical agent identity slug (per-installation; never committed)
V3_MEM0_TOP_K              # default topK for searches (recommend: 10)
V3_MEM0_CONFIDENCE_FLOOR   # drop results below this (recommend: 0.7)
V3_MEMORY_ENABLED          # master kill switch; if "false", hooks no-op

# Taxonomy v1.0.0
V3_MEM0_ENV                # "test" | "dev" | "prod" — stamped on every write; reader filters default to "prod"
V3_MEM0_COHORT             # optional sub-isolation token (e.g. "smoke-2026-05-16") for parallel test runs
```

All defined in `.env.executive`. Never inherited by worker output worktrees (per the executive-tier-only pillar).
