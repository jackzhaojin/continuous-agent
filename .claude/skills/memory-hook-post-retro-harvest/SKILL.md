---
name: memory-hook-post-retro-harvest
description: |
  Hook E — Post-Retrospective Harvest. Runs after a retrospective markdown doc completes (per-run or weekly). Reads the retro fully and decides which durable lessons (reflective, semantic, procedural memories) to write to the second brain. Typically 3–8 writes per weekly retro, 0–3 per per-run retro. Invokes the memory-harvester skill for the actual writes.
---

# Hook E — Post-Retrospective Harvest

You are the executive agent. A retrospective markdown doc just completed (either per-run or weekly). Harvest the durable lessons into the second brain so future planning consults them.

## Read first

1. `Read .claude/skills/memory-reader/references/mem0-limitations.md` — especially §1 (async writes), §6 (paraphrasing), §10 (anti-patterns — don't write operational artifacts).
2. Then invoke the `memory-harvester` skill via Skill tool.
3. **Read the retro doc fully** from the path supplied in context. Do not summarize from snippets.

## Context

{{CONTEXT_JSON}}

Contains:

- `retroPath` — absolute path to the retro markdown
- `retroType` — `"per-run"` or `"weekly"`
- `relatedBundleSlugs` — bundles covered by the retro (one for per-run, multiple for weekly)
- `harvestRun` — pre-generated `YYYY-MM-DD-retro-{slug}` identifier

## What to harvest from a retro

Retros are gold for `reflective` and `semantic` memories. Typical extraction:

1. **`reflective` memories** — patterns across runs. The "what didn't work" section, root causes, must-fix items.
   - One memory per **distinct pattern**, not per bullet point. A "must-fix: H1 Update verifier to check output_path" might be one reflective memory.
   - `text`: state the pattern with retro source path embedded
   - `metadata.confidence`: 0.7–0.95 graded by how much evidence the retro provides

2. **`semantic` memories** — verified facts the retro confirmed.
   - e.g. "Vendor codex requires CODEX_API_KEY in worker env"
   - `metadata.confidence`: 0.85+ (retro-verified)

3. **`procedural` memories** — refined how-tos.
   - e.g. "When deploying Azure Functions, run azure-function-deploy skill v0.2.0 first"
   - `metadata.confidence`: 0.7–0.9

4. **NOT principle** — principles come from constitution/PRD merges, not retros. If the retro suggests a new principle, that goes through human review and a spec merge, not directly here.

## Quality gates (reject candidates that)

- Are too generic ("the system should be more reliable")
- Are duplicates of memories already in the brain — if Hook A consultations earlier in the day already surfaced this exact lesson, skip
- Are operational artifacts (`progress.md`, `needs-you.md`) — those stay in markdown

Target: 3–8 memory writes per weekly retro, 0–3 per per-run retro.

## How to author the text

mem0 paraphrases prose. Embed:

- Retro source path verbatim (`metadata.source` = `retroPath`)
- Bundle slug(s) the lesson came from
- Specific error codes / vendor names / skill names if any
- The `harvest_run` identifier

Example (good):
> "Pattern observed across runs in 2026-04 (retro: `ai-docs/v2/2026-04-15-v2.1.7/retro-postal-checkout.md`): worker validators that only check `process.cwd()` instead of `result.output_path` mark UI-broken builds as PASS. Affected bundles: postal-checkout, pageforge. Fix path: H2 must-fix in retro — update verifiers to check output_path. See workspace/constitution.md Article III for output_path requirement."

Example (bad — would lose discriminators during paraphrasing):
> "Validators sometimes pass when they should fail."

## Output

Invoke `memory-harvester` skill with the array of payloads you decided to write. The skill:

1. Validates each via `references/classify.ts`
2. Writes via `references/harvest.ts` (camelCase opts → mem0 add)
3. Polls each `eventId` until `SUCCEEDED`
4. Appends to `ledgers/harvest-runs/{date}.jsonl`
5. Returns a JSON summary

Then emit a brief summary:

```
## Harvest summary

Trigger: post-retro (Hook E)
Retro: <retroPath>
RetroType: <per-run | weekly>
Memories written: <N>
  - <memory_id[:8]> · <type> · <importance> · <first 80 chars>
  - ...
Latency total: <ms>
Failures: <count>
```

## Hard rules

- Read the retro fully before harvesting. Partial reads → partial memories → noise.
- `agent_id: "executive"`.
- For `reflective` memories, set `run_id` to `harvestRun` (the retro's harvest run, not any individual run's id).
- Do NOT issue any read tools in this turn (limitations §2).
- Cap your summary at 250 words.
