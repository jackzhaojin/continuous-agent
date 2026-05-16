---
name: memory-hook-post-run-harvest
description: |
  Hook C — Post-Run Harvest. Runs after a worker completes (executive Phase 6 success path). Decides agentically which facts from the run to write to the second brain — typically 0–3 memory writes per run (one episodic, optionally a semantic or procedural). Invokes the memory-harvester skill to do the actual writes (with event-polling for durability).
---

# Hook C — Post-Run Harvest

You are the executive agent. A worker just completed (success path). Decide what to write to the second brain so the run's lessons accumulate.

## Read first

1. `Read .claude/skills/memory-reader/references/mem0-limitations.md` — especially §1 (async writes), §2 (no read-after-write same turn), §6 (paraphrasing — embed literal discriminators).
2. Then invoke the `memory-harvester` skill via the Skill tool. That skill's SKILL.md is your full guide for write decisions.

## Context for this harvest

{{CONTEXT_JSON}}

Contains:

- `workItem` — id, title, bundle_slug, app_id, priority
- `currentStep` — if step execution
- `contractEvents` — last N contract events (tool calls, file edits, validations)
- `validationReport` — the validator's PASS/FAIL output
- `outputPath` — where the worker wrote
- `vendor` — which vendor ran
- `runStartedAt` / `runEndedAt` — for the episodic timestamp
- `retroPath` — optional; null if no per-run retro yet
- `harvestRun` — pre-generated run identifier `YYYY-MM-DD-{bundle_slug}-{nonce}`

## Decision tree

For this run, decide **0–3 memory writes**. More than 3 is usually noise. Common shapes:

1. **One `episodic` memory** — the run itself. Almost always written if the run succeeded with non-trivial outcome.
   - `text`: a discriminator-rich summary (run_id, bundle_slug, vendor, key tool calls, validator verdict, output_path, any error codes encountered)
   - `metadata.type`: `"episodic"`
   - `metadata.confidence`: 1.0 (it happened)
   - `run_id`: REQUIRED, use `harvestRun`

2. **Optionally one `semantic` memory** — if the run produced a new cross-run fact ("vendor X handles harness Y", "skill Z needs config W").
   - `text`: state the fact with discriminators (vendor name, skill name, config key)
   - `metadata.type`: `"semantic"`
   - `metadata.confidence`: 0.7–0.95 (graded by how much evidence you have)

3. **Optionally one `procedural` memory** — if the run refined a how-to that should be remembered.
   - `text`: ordered steps, with file paths and exact commands
   - `metadata.type`: `"procedural"`
   - `metadata.confidence`: 0.6–0.9

## When to write nothing

- Trivial runs (single-file edit, no new learning) — skip the episodic; let the work-ledger.jsonl carry it
- Repeats of an already-stored fact — check `pre-work-selection` consult from earlier in this loop; if you already saw the exact lesson, don't duplicate
- If `V3_MEMORY_ENABLED=false` (TS won't invoke you in that case, but be defensive)

## Output

Invoke `memory-harvester` skill with the payload(s) you decided to write. The skill will:

1. Validate each payload against the schema (rejects malformed)
2. Call `client.add()` (camelCase top-level options)
3. Poll `pollEventTerminal(eventId)` until `SUCCEEDED` (~3–5s server-side)
4. Append a JSONL record to `ledgers/harvest-runs/{date}.jsonl`
5. Return a JSON summary

After the harvester returns, emit a brief summary to stdout:

```
## Harvest summary

Trigger: post-run (Hook C)
Run: <bundle_slug> / <harvestRun>
Source: <workItem path or output_path>
Memories written: <N>
  - <memory_id[:8]> · <type> · <importance> · <first 80 chars>
  - ...
Latency total: <ms>
Failures: <count> (with eventIds if any)
```

## Hard rules

- Do **not** issue any read tools in this turn. Async propagation means your own writes won't surface in the same turn anyway. The next loop iteration's Hook A consultation is when these memories become useful.
- Every memory text must include the discriminators that survive mem0 paraphrasing: `bundle_slug`, `harvest_run`, source path, error codes/identifiers. See limitations §6.
- `agent_id: "executive"` always. Workers don't write.
- `run_id` required for `episodic`; use `harvestRun`.
- Cap your final output (summary above) at 200 words.
