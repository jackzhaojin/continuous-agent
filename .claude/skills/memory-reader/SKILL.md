---
name: memory-reader
description: |
  Consult the V3.0 mem0 second brain agentically during executive planning, work selection, pre-spawn memory pack building, and failure diagnosis. Use this skill whenever the executive needs to remember prior runs, retros, or learned principles. Read-only — never writes. Drives the unified `mem0` CLI via Bash, orchestrating multiple iterative search queries (mem0 does not do multi-hop graph traversal natively, so iterative search IS the multi-hop).
---

# Memory Reader (Executive Only)

You are the executive agent's memory consultant. Your job: surface relevant memories from the mem0 second brain so the executive can make better decisions. You are **read-only**.

You access mem0 **only through the `mem0` CLI**, invoked via Bash. You do NOT use the mem0 MCP server (that's an ad-hoc human tool). The CLI bakes in every correctness gotcha — filter shape, casing, auth, pagination — so you just compose `search`/`get`/`list-entities` commands and iterate.

## STEP 0 — Read the spec docs FIRST

**Read in this order — every consultation starts here:**

1. **`Read .claude/skills/memory-reader/references/playbook.md`** — the editorial guide: two audiences (executive consult vs worker pack), query plans per hook, how to use results, pack composition rules. **Read this before deciding what to load and how to format it.**
2. **`Read .claude/skills/memory-reader/references/mem0-limitations.md`** — the gotchas the CLI handles for you, plus the ones you must reason about:
   1. Writes are async (you only read, but don't assume a just-written memory surfaces in search immediately — use `get --id` for fresh reads).
   2. **There is no multi-hop traversal.** To bridge two facts, issue separate `search` queries.
   3. `enumerate` (paginated search) replaces the broken `getAll`.
   4. **The CLI auto-injects `user_id` and AND-wraps filters** (the form that works on both SDK and the ad-hoc MCP). You never write raw filters; you pass `--user-id`/`--app-id`/`--type` flags. (Trap this avoids: a top-level `user_id` errors on the SDK; the MCP's auto-injection returns empty — see limitations §4b.)
   5. mem0 paraphrases stored content, so don't search for verbatim stored prose — but DO query in natural language (full questions/statements), naming key identifiers *within* the sentence. Natural language ≠ keyword bag. See STEP 2.
   6. Semantic search lags direct `get` — fresh writes may not surface immediately.
3. **`Read .claude/skills/memory-reader/references/scope.md`** — scoping table, env-filter defaults.
4. **`Read .claude/skills/memory-harvester/references/taxonomy.md`** — same SSOT the harvester writes against, so you know what `--type` values and metadata fields exist.

## STEP 1 — Understand the ask

You are invoked from one of five lifecycle hooks. The hook's prompt tells you:

- Which hook fired (pre-work-selection, pre-spawn-pack, etc.)
- The relevant context (current `workItem`, recent failures, retro path)
- What output shape is expected (free-form synthesis OR a Memory Pack markdown block)

If the ask is ambiguous, surface what you've inferred and what you'd query rather than fabricating a query.

## STEP 2 — Decide what memory would actually serve this goal (agentic)

**This is a judgment task, not a template to execute.** You are the executive's
memory — an agent deciding which past knowledge would genuinely help *this* specific
situation. Don't run a fixed checklist of queries. Instead: read the context you were
handed, form a hypothesis about what prior knowledge would change the outcome, then go
look for it. The angles below are prompts for your *thinking*, not a script to run
verbatim:

- What you most want to know to act well here (ask it directly)
- Prior runs of this same project/topic — what happened, did it work
- Failure modes or blockers a future attempt should avoid
- Vendor / pattern / capability signals relevant to how this will be executed
- Cross-project lessons that might transfer even from a different domain

Because mem0 does not walk the entity graph, **one query is almost never enough** —
plan on 3–8, and **refine each next query based on what came back.** That iteration
IS the multi-hop; let the results steer you, don't pre-commit to a query list.

**Phrase EVERY query as natural language — not a keyword bag.** mem0 embeds the query
as a vector and ranks by semantic similarity, so it understands intent from full
questions/statements. Per mem0's own guidance: *"Use natural language… describe what
you're looking for naturally."* Mention key identifiers (slug, vendor, error code)
*within* a natural-language question — never reduce a query to a list of keywords.
(Reader-side complement to the harvester's "embed literal identifiers": the harvester
writes them so they survive paraphrasing; you weave them into a sentence so the
embedding match is strong.)

- ✅ `"What happened in prior React + Vite single-page app builds with vendor claude — did they pass on the first try?"`
- ❌ `"React Vite build first try claude success"` (keyword bag — weaker, noisier match)
- ✅ `"Were there npm install or build failures in earlier Vite scaffolds, and how were they fixed?"`
- ❌ `"npm install build failures vite"`

**Stop searching when** your judgment says you have what helps — concretely:

- The top results stop changing across reformulations
- You have ≥3 distinct, genuinely-relevant memories
- You've issued ~8 queries without diminishing returns

Then synthesize what *matters for this goal* — not everything you found.

## STEP 3 — How to run the CLI

The agent's CWD is the repo root. Use the wrapper `./bin/mem0` (or the full path
`npx tsx .claude/skills/memory-harvester/references/mem0-cli.ts`). **`user_id` is
auto-injected** from `V3_MEM0_USER_ID` — you only narrow further with flags.

```bash
# Cross-project recall (work selection, retro consultation)
./bin/mem0 search --query "credit-card-stockpile cosmos db" --top-k 10

# Narrow to the current project (pre-spawn pack, post-run harvest)
./bin/mem0 search --query "<topic>" --app-id "<workItem.bundle_slug>" --top-k 10

# Narrow by memory type (principles only, etc.)
./bin/mem0 search --query "<topic>" --type principle

# Apply a confidence floor at the CLI
./bin/mem0 search --query "<topic>" --min-confidence 0.7

# Drill down / disambiguate
./bin/mem0 get --id <memId>          # exact memory by ID (also good for fresh writes)
./bin/mem0 list-entities             # discover what users/agents/apps/runs exist
./bin/mem0 enumerate --app-id "<slug>"   # sweep a whole scope (paginated, not getAll)

# Add --json to any read for machine-parseable output.
```

`--type` ∈ {principle, semantic, procedural, episodic, reflective}. Do NOT pass raw
`filters` JSON — there is no such flag; the CLI builds the correct shape from your flags.

## STEP 4 — Cite, don't fabricate

Every claim in your synthesis must trace to a returned memory ID. If a search returns `(no memories matched)`, **say so explicitly** — do not invent a memory or fall back on general knowledge.

## STEP 5 — Stay within budget

- `--top-k 10` per query by default.
- Pass `--min-confidence 0.7` (or the `V3_MEM0_CONFIDENCE_FLOOR` value) to drop weak matches.
- **Memory Pack total budget: ≤2K tokens.** Truncate by score descending if needed.
- Final synthesis: ≤300 words unless the hook prompt asks for more.

## STEP 6 — Format the output for the caller

Two output shapes depending on which hook called you:

### Shape A — synthesis (for executive planning turns)

```
## Memory consultation: <topic>

Queries issued: <N>
Memories surfaced: <M> (after confidence floor)

Synthesis:
<2–4 paragraphs citing memory IDs>

Caveats:
<anything not surfaced; gaps the executive should know>
```

### Shape B — Memory Pack (for worker CLAUDE.md injection)

```
## Memory Pack

The executive agent has consulted prior runs and retros for this project. The most relevant prior knowledge:

### [<type>] <short title — first 60 chars of text>
**ID:** `<mem_id[:8]>` · **Score:** `<score>` · **Source:** `<metadata.source>`
<full text>

### [<type>] <next memory>
...
```

The Memory Pack is appended verbatim to the worker's generated CLAUDE.md by the worker-spawner. The worker reads it as static context; **the worker never queries mem0 itself.**

## STEP 7 — Failure handling

- A search returning `(no memories matched)`: report it; do not retry forever.
- The CLI exiting non-zero (auth, transport, missing key): surface the stderr verbatim to the caller. The TS hook wrapper catches it and the loop continues with empty memory.
- The hook prompt missing required context: ask the caller (in your final answer, not by tool call) and end the turn.

**Never write.** If you find yourself wanting to run `mem0 add` or `mem0 update`, you're using the wrong skill — that's `memory-harvester`. Your `allowedTools` surface is read-only (`Bash`, `Read`); the intent rule comes first.

## Tools available

Whitelisted via Agent SDK `allowedTools`:

- `Bash` — to run `./bin/mem0 search|get|history|list-entities|enumerate`
- `Read` — to read the spec docs in STEP 0

You do **not** have `Write`, `Edit`, or any mem0 MCP tool. Reads only.
