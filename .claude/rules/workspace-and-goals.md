---
paths:
  - "workspace/**"
  - "src/deterministic/state-handler.ts"
  - "src/deterministic/steps-json-handler.ts"
  - "src/deterministic/progress-log-writer.ts"
  - "src/deterministic/contracts-log-writer.ts"
  - "src/deterministic/prompt-md-parser.ts"
  - "src/agentic/work-selection/**/*.ts"
---

# Workspace & Goal Management

## Goal Bundles

Work items are directories containing `PROMPT.md` with YAML frontmatter:

```yaml
---
title: "Goal Title"
slug: "goal-slug"
priority: P3
status: pending
complexity: medium
created: "2026-01-01"
tags: [tag1, tag2]
output_path:             # Set by worker on first execution
branch:                  # Set for self-enhancement tasks
source_project:          # Slug of source project to copy from
execution_pattern:       # v2.0: plan-then-execute, plan-mode, harness, etc.
build_target:            # v2.3: worktree (default) | existing | monorepo
target_dir:              # Required for build_target: existing
target_branch:           # Optional branch override for worktree/existing
---
```

**Lifecycle:** `drafts/` -> `ondeck/` -> `in-progress/P{n}/` -> `completed/`

**Blocked goals** stay in `in-progress/P{n}/` with `status: blocked`. Unblocked in-place when human responds in `needs-you.md`.

**Auto-promotion:** `goal-scanner.ts` moves goals from `ondeck/` to `in-progress/P{n}/` by priority field. Logs `GOAL_PROMOTED` to `work-ledger.jsonl`.

**Queue ingestion:** `queue-processor.ts` parses `queue.md` items into draft bundles with P3 priority.

## Step Tracking

**STEPS.json** is the machine-readable source of truth per goal bundle:

```json
{
  "version": 1,
  "created_at": "2026-01-29T05:44:52Z",
  "trigger": "auto",
  "revision": 3,
  "steps": [{
    "id": "step-0", "order": 0, "title": "...",
    "status": "complete", "estimated_turns": 80,
    "retry_count": 0, "re_breakdown_count": 0
  }]
}
```

- **Reads:** STEPS.json first, falls back to TASKS.json for backward compat
- **Writes:** Atomic via temp file + rename (`steps-json-handler.ts`)
- **Re-breakdown:** If a step fails, remaining work can be re-broken (max 2 times)
- **Retry persistence:** `retry_count` in STEPS.json survives PM2 restarts

## Per-Bundle Files

```
workspace/in-progress/P2/my-goal/
  PROMPT.md          # Goal definition (YAML frontmatter + markdown)
  STEPS.json         # Machine-readable steps (source of truth)
  CONTRACTS.jsonl    # Contract events: started, completed, failed, blocked
  PROGRESS_LOG.md    # Append-only human-readable timeline
  step-N-handoff.md  # Per-step handoff context
```

## Workspace Files

- `constitution.md` -- **IMMUTABLE** hard limits (NEVER auto-modify)
- `goals.md` -- Auto-generated index from goal bundles (also legacy fallback)
- `needs-you.md` -- Human-agent async interaction interface
- `queue.md` -- Items ingested as P3 draft bundles
- `preferences.md` -- Learned conventions (code style, anti-patterns)
- `project-registry.yml` -- Completed projects for reuse
- `self-improvement-state.json` -- Practice/retrospective timestamps

## Human Interaction via needs-you.md

Response tags: `[APPROVED]`, `[DECISION]`, `[INFO]`, `[SKIP]`

The agent detects responses in Phase 2, unblocks goals, resets retry counters, and logs to `work-ledger.jsonl`.
