# Technical Highlight 2: Work Selection & Goal Breakdown

**Files:** [`src/agentic/work-selection/work-selector.ts`](../../../src/agentic/work-selection/work-selector.ts), [`src/agentic/work-selection/goal-scanner.ts`](../../../src/agentic/work-selection/goal-scanner.ts), [`src/agentic/work-selection/goal-breakdown.ts`](../../../src/agentic/work-selection/goal-breakdown.ts)

## What It Does

Work selection is how the coding agent decides *what to build next*. Goals are directories in `workspace/` containing a `PROMPT.md` with YAML frontmatter (title, priority, status, tags). The scanner reads all bundles, sorts by priority (P0-P4), and returns the highest-priority unblocked item.

```
workspace/
  ondeck/              Queued goals (auto-promoted by priority)
  in-progress/P0/      Critical
  in-progress/P1/      High priority
  in-progress/P2/      Normal
  in-progress/P3/      Low priority (queue.md ingestion default)
  completed/           Done
```

## Goal Breakdown (Phase 3b)

When a goal exceeds ~100 estimated turns, the agent uses an LLM call to auto-decompose it into steps. Each step becomes its own worker session, tracked in `STEPS.json`:

```json
{
  "steps": [
    { "id": "step-0", "title": "Set up project scaffold", "status": "complete" },
    { "id": "step-1", "title": "Implement core API", "status": "pending" },
    { "id": "step-regression-1", "title": "[REGRESSION] Visual verification", "status": "pending" }
  ]
}
```

Steps share the same project directory, so each worker picks up where the last left off.

## Automatic Regression Test Steps

For web projects (detected by keywords like Next.js, React, dashboard, etc.), the breakdown system automatically inserts `[REGRESSION]` verification steps every 6 build steps. These steps have no build work -- the worker only opens the site with `playwright-cli`, takes snapshots, and reports regressions.

This is rule-based post-processing, not LLM-directed -- deterministic and predictable. Regression steps use custom IDs (e.g., `step-regression-1`) that are distinct from the sequential `step-N` IDs.

## Key Design Decisions

- **Folder-based bundles** over a database: Goals are just directories with markdown files. Human-readable, git-trackable, easy to create manually.
- **LLM-driven breakdown**: The agent decides *how* to split work, not a hardcoded algorithm. This is agentic, not deterministic.
- **Re-breakdown on failure**: If a step fails repeatedly, remaining work can be re-split (max 2 times) with a different decomposition.
- **Stable step IDs**: Each step in STEPS.json has a stable `id` field used for status updates. This prevents mismatches when regression steps are inserted (their IDs don't follow the `step-N` pattern).

## Talk Points

- Zero-config task queue: drop a folder with a PROMPT.md and the agent picks it up
- The breakdown decision itself is an LLM call -- the agent reasons about complexity
- Regression steps catch visual regressions early in long multi-step builds
- STEPS.json survives PM2 restarts, so progress is never lost
