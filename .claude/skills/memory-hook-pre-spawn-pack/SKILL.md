---
name: memory-hook-pre-spawn-pack
description: |
  Hook B — Pre-Spawn Memory Pack build. Runs before each worker spawn (executive Phase 4 prep). Reads the second brain for project-specific memories and produces a Memory Pack markdown block that worker-spawner injects into the worker's generated CLAUDE.md. Workers consume this as static markdown — they never call mem0 themselves. Read-only. Invokes the memory-reader skill.
---

# Hook B — Pre-Spawn Memory Pack Build

You are the executive agent. A worker is about to be spawned for a specific work item. Your job: build a **Memory Pack** that gets injected into the worker's generated `CLAUDE.md` so the worker starts with relevant prior context baked in.

The worker will NEVER call mem0 itself. Workers consume static markdown. This is the only way prior memory reaches a worker.

## Read first

1. `Read .claude/skills/memory-reader/references/mem0-limitations.md`.
2. Then invoke the `memory-reader` skill — your full guide for retrieval lives there.

## Context for this consultation

{{CONTEXT_JSON}}

The context block contains:

- `workItem` — full details: `id`, `title`, `description`, `priority`, `bundle_slug`, `app_id`, `output_path` if resuming
- `currentStep` — if this is step execution, the step number, title, and description
- `executionPattern` — `plan-then-execute` / `harness` / etc.
- `vendor` — which worker vendor (claude / codex / kimi) is about to run
- `retryAttempt` — if this is a retry, the attempt number and prior strategy

## What to retrieve

For the worker to do its best work, surface:

1. **Project-specific memories** — search filtered to `app_id: <bundle_slug>`. What's been tried, what's currently the state of this codebase, prior step outcomes.
2. **Capability memories** — what does the executive know about the capabilities this work item exercises (vendor: claude vs codex, harness X, skill Y)?
3. **Principles that apply** — any `metadata.type: "principle"` memories that constrain what the worker can do.
4. **Recent failures on this bundle** — if `retryAttempt > 0`, prior failure signals are critical.

Iterative search (3–8 queries from different angles). Stop when results stop changing.

## Output shape

Use **Shape B** from `memory-reader/SKILL.md` — the Memory Pack format. The TypeScript wrapping this hook will splice your output verbatim into the worker's CLAUDE.md.

```
## Memory Pack

The executive agent has consulted prior runs and retros for this work. The most relevant prior knowledge:

### [<type>] <60-char title>
**ID:** `<mem_id[:8]>` · **Score:** `<0.42>` · **Source:** `<metadata.source>`
<full text from mem0, verbatim>

### [<type>] <next>
...
```

## Budget — strict

- ≤2K tokens total for the entire Memory Pack section
- Drop any memory with `score < V3_MEM0_CONFIDENCE_FLOOR` (default 0.7)
- Sort surviving memories by score descending; truncate from the bottom if the budget overflows
- Max 10 entries

## If the pack is empty

If no memories meet the confidence floor (genuinely new project, or memory layer is sparse), output:

```
## Memory Pack

_No prior memories surfaced for this work item. (Searched: <list of queries>.)_
```

Empty packs are legitimate and the worker handles them fine. Do not fabricate memories to fill space.

## Hard rules

- Read-only. No writes.
- Verbatim text from mem0 (do not re-paraphrase — mem0 already paraphrased on extraction; double-paraphrasing destroys discriminators).
- Cite the source path from `metadata.source` so a worker can read the original markdown if needed.
- Cap total output at 2K tokens. The TS wrapping enforces this as a hard limit and truncates with `...[truncated]` if you overflow.
