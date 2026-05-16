---
name: memory-hook-failure-diagnosis
description: |
  Hook D — Failure-Diagnosis memory consultation. Runs at executive Phase 7 (after 3+ consecutive failures on a work item) BEFORE the failure-diagnosis skill itself runs. Consults the second brain for similar prior failures and successful retry strategies, then hands enriched context to the failure-diagnosis skill. Read-only. Invokes the memory-reader skill.
---

# Hook D — Failure Diagnosis Memory Consult

You are the executive agent. A work item has failed 3+ times in a row. Before the existing `failure-diagnosis` skill runs, consult the second brain for similar prior failures so the diagnosis can build on what we already know.

## Read first

1. `Read .claude/skills/memory-reader/references/mem0-limitations.md`.
2. Then invoke the `memory-reader` skill.

## Context

{{CONTEXT_JSON}}

Contains:

- `workItem` — id, title, bundle_slug
- `failureSignals` — last N failure events: error messages, stack traces (truncated), validator verdicts, tool that failed
- `priorAttempts` — strategies already tried with this work item (`minimal_scaffold`, `break_into_steps`, etc.)
- `vendor` — which vendor failed

## What to retrieve

You're looking for **patterns**, not exact matches. Iterative search:

1. **Same bundle, prior failures** — `filters: { user_id, app_id: <bundle_slug> }`, type filter `episodic` or `reflective`
2. **Cross-project: same error code or signal** — search the literal error code (mem0 preserves discriminators)
3. **Cross-project: same vendor + similar work type** — patterns like "claude vendor with harness X fails when ..."
4. **Reflective memories about retry strategy** — what strategy has worked for similar failures in the past

Stop when 5+ memories surface or when 6 queries produce no new results.

## Output shape

Use **Shape A** but with a diagnosis-specific framing:

```
## Memory consultation: failure-diagnosis

Queries issued: <N>
Memories surfaced: <M>

Pattern analysis:
<2–3 paragraphs. Group surfaced memories by failure mode. Cite IDs.>

Strategy recommendations (advisory; failure-diagnosis skill decides):
- <strategy name>: <why this looks promising> — <memory IDs that support it>
- <strategy name>: <why this might fail again> — <memory IDs that warn>

Escalation flag:
<set to "yes" if surfaced memories suggest this pattern has hit human-escalation 2+ times before; otherwise "no">

Caveats:
<gaps>
```

This block goes into the failure-diagnosis skill's input. That skill makes the actual retry-vs-escalate decision; you're enriching its inputs.

## Hard rules

- Read-only. If memories suggest a write is overdue (e.g., "this failure mode has happened 3+ times and there's no reflective memory yet"), flag it for Hook E (post-retro) — do not write here.
- Cite IDs for every claim.
- Cap output at 400 words.
