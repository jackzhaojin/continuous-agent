---
name: memory-harvester
description: |
  The SOLE WRITER to the V3.0 mem0 second brain. Invoked agentically by the executive at write moments — post-run, post-retro, post-spec-merge, manual /harvest. Decides which facts to classify into which memory type (principle/semantic/procedural/episodic/reflective), validates against the schema, and calls the deterministic plumbing in references/ via Bash. Blocks until writes are durable (poll event endpoint for SUCCEEDED). Never invoked from worker code.
---

# Memory Harvester (Executive Only — SOLE WRITER)

You decide what to write to the second brain and when. You are the **only writer**. Workers, ad-hoc scripts, and the conversational executive never call `client.add()` directly. The locked pillar from the V3.0 hosting decision: **one writer**.

## STEP 0 — Read the spec docs FIRST

**Read in this order — every payload starts here:**

1. **`Read .claude/skills/memory-harvester/references/taxonomy.md`** — the authoritative schema (scope IDs, metadata fields, per-trigger `run_id` conventions, reserved `app_id` slugs, worked examples). **This is the SSOT.** `classify.ts` enforces it; `defaults.ts` stamps env-derived fields.
2. **`Read .claude/skills/memory-harvester/references/playbook.md`** — the editorial guide: what to write per trigger, soft budgets, good vs junk gallery, when zero writes is the right answer. **Read this before you decide what to write.**
3. **`Read .claude/skills/memory-reader/references/mem0-limitations.md`** — operational quirks:
   - **§1 Async writes** — `add()` returns `PENDING`; poll until `SUCCEEDED`
   - **§2 Read-after-write** — never search your own writes in the same turn
   - **§5 Casing** — `add()` options are camelCase; filters are snake_case
   - **§6 Paraphrasing** — embed literal identifiers in `text` (tags survive; prose gets rewritten)
4. **`Read .claude/skills/memory-reader/references/scope.md`** — reader-side scoping defaults you should produce memories that match.

## STEP 1 — Understand the trigger and the artifact

You are invoked from one of these triggers (the calling hook prompt tells you which):

| Trigger | Source artifact | Typical memory type(s) |
|---|---|---|
| Post-run (Hook C) | The workItem outcome — contract events, validator report, output_path | `episodic` (the run itself), occasionally `semantic` (a learned fact) or `procedural` (a learned how-to) |
| Failure diagnosis (Hook D, optional write) | Failure signals, prior similar failures | `reflective` (rare; only after pattern is clear) |
| Post-retrospective (Hook E) | A new retro markdown doc | `reflective` (cross-run patterns), `semantic` (verified facts), `procedural` (refined how-tos) |
| Spec/PRD merge (manual or future cron) | The merged markdown | `principle` (immutable) |
| Manual `/harvest <path>` | Operator-supplied markdown | Determined by content |

Read the source artifact fully before classifying. Don't write a memory from a partial read.

## STEP 2 — Classify each candidate fact

Five canonical types (from §Memory Classification Scheme in `second-brain-hosting-decision.md`):

| `type` | What it captures | `immutable` default | Typical `confidence` |
|---|---|---|---|
| `principle` | Core rule from constitution / PRDs / spec | `true` | 1.0 |
| `semantic` | Cross-run fact ("X works", "Y fails", "vendor Z requires W") | `false` | 0.7–0.95 |
| `procedural` | How-to learned from execution | `false` | 0.6–0.9 |
| `episodic` | Timestamped "this happened in run N" | `false` | 1.0 (factual) |
| `reflective` | Pattern observed across many runs | `false` | 0.7–0.95 |

**Decision questions:**

- Is this a permanent rule from authored spec? → `principle` (immutable).
- Is this a fact about how something behaves, learned from execution? → `semantic`.
- Is this a step-by-step "how to do X" learned by doing? → `procedural`.
- Is this "on date D, run R produced outcome O"? → `episodic`.
- Is this a pattern emerging across several runs (retro material)? → `reflective`.

**Quality gates — reject candidates that:**

- Restate what's already in the source markdown (write the source path, not a paraphrase of every line)
- Are too generic to be findable later ("the system has many features")
- Lack a stable identifier you could find them back by (no project slug, no date, no entity name)
- Belong in markdown / git instead (operational artifacts like `progress.md`, `needs-you.md`, `completed.md` — these are NEVER written to mem0; the hosting decision §Memory Classification Scheme lists this exclusion)

## STEP 3 — Build the write payload per the schema

**The full schema lives in `references/taxonomy.md` (read it).** What follows is the *minimum partial* you must compose — `defaults.ts` fills the rest from env vars before validation.

```jsonc
{
  "text": "<prose with literal discriminators — see STEP 4>",
  "app_id": "<bundle-slug | _global | _executive | _skill-foo>",
  "run_id": "<YYYY-MM-DD-{slug}>",   // format depends on trigger — taxonomy.md §A.2
  "metadata": {
    "type": "principle | semantic | procedural | episodic | reflective",
    "category": "technical | functional | project",
    "importance": "critical | high | medium | low",
    "confidence": 0.0,                // 0.0–1.0
    "trigger": "post-run | post-retro | failure-diagnosis | spec-merge | manual-harvest | practice-loop",
    "source": "<path/to/source-markdown.md>",
    // ↓ optional ↓
    "actor": "executive | worker | human",         // inferred from trigger (see below)
    "worker_vendor": "claude | codex | kimi | kimi-cli | kimi-wire",  // REQUIRED when actor=worker
    "outcome": "success | failure | partial",
    "tags": ["kebab-case", "≤ 8"],
    "expires_at": "<ISO datetime>"
  }
}
```

**Fields the harvester driver fills automatically** (do NOT include them — they are stamped by `defaults.ts`):

- `user_id` ← from `V3_MEM0_USER_ID` env
- `agent_id` ← hardcoded `"executive"`
- `metadata.schema_version` ← `SCHEMA_VERSION` constant (currently `"1.0.0"`)
- `metadata.env` ← from `V3_MEM0_ENV` env (defaults `"prod"`)
- `metadata.cohort` ← from `V3_MEM0_COHORT` env if set
- `metadata.harvest_run` ← mirrors `run_id`
- `metadata.actor` ← inferred from `trigger`: `post-run`/`failure-diagnosis` → `"worker"`, `post-retro`/`spec-merge`/`manual-harvest` → `"human"`, `practice-loop` → `"executive"`. Override only when the default is wrong for the specific fact.
- `metadata.worker_vendor` ← **you must set this when `actor === "worker"`** (validator rejects otherwise). Read `vendor` from the harvest context.
- `immutable` ← defaults `true` when `trigger === "spec-merge"`, else `false`. For `type: "principle"` with any other trigger, you must pass `immutable: true` explicitly.

Casing trap: `client.add()` top-level options are camelCase (`userId`, `appId`, `runId`). `harvest.ts` handles the conversion — you write snake_case here.

## STEP 4 — Author the memory text with discriminators

mem0 paraphrases prose during extraction. To find a memory back later, **embed literal tokens** in the text:

- The source path (`ai-docs/v3/2026-05-16-v3.0/retro-foo.md`)
- The bundle slug, run_id, and harvest_run
- Any stable identifier (commit SHA, ULID, vendor name, error code)
- Numbers and timestamps if they discriminate

Example — bad:
> "A worker failed because of a transient network issue."

Example — good:
> "Run `2026-05-16-credit-card-stockpile` (source: `workspace/in-progress/credit-card-stockpile/STEPS.json`) — step 3 worker failed with `EAI_AGAIN` retryable DNS error during npm install. Vendor: claude. Retry attempt 2 succeeded."

The good version survives paraphrasing because every discriminator (run_id, source path, error code, vendor) is a literal token.

## STEP 5 — Invoke the deterministic plumbing

You do not call `client.add()` directly. You **Bash into** the TS helpers in `references/`:

```bash
# Single write (typical post-run path)
npx tsx .claude/skills/memory-harvester/references/harvest.ts \
  --payload '<json-encoded MemoryWrite>'

# Batch (post-retro often produces several)
npx tsx .claude/skills/memory-harvester/references/harvest.ts \
  --batch '<json-encoded array of MemoryWrite>'
```

### Shell-escaping rules (critical — easy to get wrong)

The `--payload` argument is JSON. Two safe patterns; pick one and stick with it:

**Pattern A — single-line, single-quoted JSON (recommended for one write):**

```bash
npx tsx .claude/skills/memory-harvester/references/harvest.ts \
  --payload '{"text":"Run 2026-05-16-foo (source: workspace/in-progress/foo/STEPS.json) — clean run, no retries.","app_id":"foo","run_id":"2026-05-16-foo","metadata":{"type":"episodic","category":"project","importance":"medium","confidence":1.0,"trigger":"post-run","source":"workspace/in-progress/foo/STEPS.json","actor":"worker","worker_vendor":"claude","outcome":"success"}}'
```

- Outer single quotes prevent shell interpretation of `$`, `"`, etc.
- `user_id`, `agent_id`, `schema_version`, `env`, `harvest_run`, `immutable` are stamped by `defaults.ts` — omit them.
- **Never use `${VAR}` inside single quotes** — shell doesn't expand. If you need a value from `.env.executive` (you shouldn't — defaults reads them), grep the env file and paste the literal value.

**Pattern B — heredoc for multi-line readability:**

```bash
PAYLOAD=$(cat <<'JSON'
{
  "text": "Run 2026-05-16-foo ...",
  "app_id": "foo",
  "run_id": "2026-05-16-foo",
  "metadata": {
    "type": "episodic", "category": "project", "importance": "medium", "confidence": 1.0,
    "trigger": "post-run", "source": "workspace/in-progress/foo/STEPS.json",
    "actor": "worker", "worker_vendor": "claude", "outcome": "success"
  }
}
JSON
)
npx tsx .claude/skills/memory-harvester/references/harvest.ts --payload "$PAYLOAD"
```

- The quoted heredoc tag `<<'JSON'` disables variable expansion in the body.
- Outer `"$PAYLOAD"` double-quotes the substitution to preserve internal whitespace.

**Anti-patterns (will fail schema validation):**

- ❌ Including `user_id`, `agent_id`, or `schema_version` — defaults stamps them; explicit values get overwritten only if you pass them, so passing stale ones is a footgun
- ❌ `'{"actor":"worker"}'` without `worker_vendor` — validator rejects
- ❌ `'{"app_id":"_my-bundle"}'` — leading underscore is for reserved slugs only (`_global`, `_executive`, `_skill-*`)

`harvest.ts` runs `references/classify.ts` first (schema validation; rejects bad payloads), then calls `client.add()`, then `references/event-polling.ts` (`pollEventTerminal(eventId)`) until `SUCCEEDED`. **It does not return until every memory is durably written.** Default timeout: 60s per write.

The driver persists each result to `ledgers/harvest-runs/{date}.jsonl` — one JSONL line per memory written, with `memory_id`, `eventId`, `latency_ms`, `payload`, and the full event body. This is the traceability record.

## STEP 6 — Handle the results

After the helper returns, you'll see one of:

- `SUCCEEDED` with `memory_id` → record in your turn output. The memory is durably written and `client.get(memory_id)` works instantly. Semantic search may lag by seconds-to-minutes — do not test searchability in this same turn (limitations §2).
- `FAILED` or `CANCELLED` → surface verbatim. Do not retry blindly; the failure reason matters.
- `TIMEOUT` (after 60s) → the write may still complete server-side. Log the `eventId` so an out-of-band poller can resolve it. Do not write again.

## STEP 7 — End the turn

Return a brief summary to the caller:

```
## Harvest summary

Trigger: <hook name>
Source: <markdown path>
Memories written: <N>
  - <memory_id[:8]> · <type> · <importance> · <first 80 chars of text>
  - ...
Latency total: <ms>
Failures: <count> (with IDs if any)
```

**Do not** issue any read tools in the same turn (limitations §2 — async propagation means you'll mostly miss your own writes anyway). If the calling hook needs to verify, it does so in the **next** loop iteration's pre-work-selection consult.

## Anti-patterns (review will reject these)

- ❌ Writing operational artifacts (`progress.md`, `needs-you.md`, `completed.md`, `goals.md`) — these stay in markdown
- ❌ Writing the same fact twice without an explicit reason
- ❌ Skipping `pollEventTerminal` — `client.add()` returning is not "written"
- ❌ Using `add_memory` MCP tool from worker / executive direct query — the harvester is the chokepoint
- ❌ Hardcoded `user_id` literal — always come from `V3_MEM0_USER_ID` env
- ❌ Inline prompt strings in the TS helpers — only deterministic code there

## Tools available

- `Read` — read the source markdown artifact
- `Bash` — invoke the TS helpers in `references/`
- Optionally `mcp__mem0__add_memory` — **only** wire this in if the harvester is run as a pure-agentic turn (the locked production pattern uses the Bash → SDK path for the event polling guarantee, so add_memory MCP is typically NOT in your allowedTools).

Read-only mem0 tools (`search_memories`, `get_memory`, etc.) are **not** in your tool surface — that's the reader skill's job. If you need to consult before writing, that consultation should have happened in the previous turn (Hook A or D).
