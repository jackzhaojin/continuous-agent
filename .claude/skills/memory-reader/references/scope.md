# Memory Scoping Reference

How memory writes and reads are scoped, and which casing applies where. See also `mem0-limitations.md` §5 for the full casing table.

## Scope dimensions

| Field | Type | Required | Meaning |
|---|---|---|---|
| `user_id` | string | ✅ always | Canonical agent owner. Value comes from `V3_MEM0_USER_ID` env var (executive agent's identity slug, never committed). |
| `agent_id` | string | ✅ always | Logical writer. V3.0: hardcoded `"executive"`. Reserved for future multi-agent split. |
| `app_id` | string | ✅ always | Project / bundle slug. Matches `workspace/{ondeck,in-progress}/{slug}/` folder name. |
| `run_id` | string | conditional | Required when `metadata.type === "episodic"`. Format: `YYYY-MM-DD-{slug}` matching the ledger date format. Stored server-side as `sessionId`. |

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

| Hook | Default `app_id` | Default `agent_id` | Notes |
|---|---|---|---|
| Pre-work-selection | unset (search across all apps) | `"executive"` | Look broad — we want lessons from any project |
| Pre-spawn memory pack | the workItem's bundle slug | `"executive"` | Narrow to the project being worked |
| Post-run harvest | the workItem's bundle slug | `"executive"` | Episodic, scoped to project + run |
| Failure diagnosis | the workItem's bundle slug + global retro pool | `"executive"` | Two queries — project-specific + cross-project retros |
| Post-retro harvest | the retro doc's project slug (or `_global` for cross-project retros) | `"executive"` | Reflective memories live in the project that produced them |

## Env vars consumed

```
V3_MEM0_API_KEY            # mem0 API key (executive only)
V3_MEM0_USER_ID            # canonical agent identity slug (per-installation; never committed)
V3_MEM0_TOP_K              # default topK for searches (recommend: 10)
V3_MEM0_CONFIDENCE_FLOOR   # drop results below this (recommend: 0.7)
V3_MEMORY_ENABLED          # master kill switch; if "false", hooks no-op
```

All defined in `.env.executive`. Never inherited by worker output worktrees (per the executive-tier-only pillar).
