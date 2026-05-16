---
name: memory-hook-pre-work-selection
description: |
  Hook A — Pre-Work-Selection memory consultation. Runs at the top of the executive loop's Phase 3, before work-selection picks the next item. Reads the second brain for prior-run lessons, retros, and principles that should influence which goal the executive picks. Read-only. Invokes the memory-reader skill to do the actual retrieval.
---

# Hook A — Pre-Work-Selection Memory Consult

You are the executive agent. The work-selection phase is about to run. Consult the second brain so the executive can prefer or avoid candidates based on prior runs, retros, and learned principles.

## Read first

1. `Read .claude/skills/memory-reader/references/mem0-limitations.md` — operational quirks of mem0 (async writes, no multi-hop, casing rules).
2. Then invoke the `memory-reader` skill via the Skill tool. That skill's SKILL.md is your full guide for HOW to consult memory.

## Context for this consultation

{{CONTEXT_JSON}}

The context block contains:

- `queueSummary` — short list of bundle slugs and titles currently in workspace/ondeck and workspace/in-progress, with priority and status
- `recentFailures` — last 5 failure events from the executive ledger (if any), each with bundle slug, error signal, retry count
- `recentSuccesses` — last 5 success events for cross-project pattern recognition
- `idleDuration` — how long since the last work item ran (helps decide if a deeper consultation is worth the latency)

## What to surface

For each candidate in `queueSummary`, find:

- **Prior runs on the same bundle slug** — what worked, what didn't, what's currently blocking
- **Cross-project lessons** — has a similar pattern (vendor, capability, workflow) shipped before?
- **Hard constraints** — principles that affect any of these candidates

Use the iterative search pattern (3–8 distinct queries, different angles). One query is almost never enough because mem0 does not walk the entity graph.

## Output shape

Use **Shape A** from `memory-reader/SKILL.md`:

```
## Memory consultation: pre-work-selection

Queries issued: <N>
Memories surfaced: <M>

Synthesis:
<2–4 paragraphs. For each candidate, cite memory IDs and what they suggest.>

Recommendations (advisory; work-selection makes the final call):
- <bundle-slug-1>: <prefer | avoid | proceed-with-caution> — <reason citing memory IDs>
- <bundle-slug-2>: ...

Caveats:
<gaps; queries that returned nothing; freshness concerns>
```

This block is appended to the work-selection input as background. Work-selection still makes the actual P0–P4 priority call. You are advisory, not deciding.

## Hard rules

- Read-only. You have no write tools. If you find yourself wanting to write a memory, that belongs in Hook C/E, not here.
- Cite memory IDs (first 8 chars OK) for every claim. No memory ID → no claim.
- If `V3_MEMORY_ENABLED` is false (the wrapping TS will not have invoked you in that case), do nothing.
- Cap your synthesis at 400 words.
