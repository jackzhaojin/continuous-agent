# Reader Playbook (Loading Side)

> **What to load, when, for whom, and how to use it.** This is the editorial complement to `scope.md` (filters/casing) and `mem0-limitations.md` (platform quirks). Read all three before issuing queries.
>
> Versioned with the harvester playbook. Current version: **v1.0.0**.

---

## Section A — Two audiences, two budgets

Memory is consumed in two very different shapes. Get the audience right first; everything else flows from it.

### Audience 1 — Executive consumption

Used by hooks that inform the executive's own decisions:

- **`pre-work-selection`** — should we pick goal X, Y, or Z next?
- **`failure-diagnosis`** — have we seen this failure before; what worked?
- **`post-retro` consult** (read side before write) — what's already on record?

**Properties:**
- Token budget is *generous* (the executive is doing one decision at a time).
- Tolerate broader/fuzzier results; the executive can ignore irrelevant memories.
- Optimize for **recall over precision** — surface candidates; the executive filters.
- Synthesis output: 2–4 paragraphs citing memory IDs (Shape A in SKILL.md).

### Audience 2 — Worker memory pack

Used by `pre-spawn-pack`. The output is injected into the worker's generated `CLAUDE.md` and the worker reads it as **static context** before doing the work.

**Properties:**
- **Token budget is tight** — ≤ 2K tokens hard cap.
- The worker is the one doing the coding, with a finite context window of its own.
- Optimize for **precision over recall** — every memory in the pack must earn its place.
- Output format: structured markdown block (Shape B in SKILL.md).
- The worker NEVER queries mem0 itself (executive-only pillar). What you pack is what they get.

The selection rules below differ by audience. Read carefully — the same query result can deserve inclusion for the executive but get cut for the worker pack.

---

## Section B — Query angles per hook (consider, don't execute verbatim)

These are **prompts for your judgment**, not scripts. You are an agent deciding what
memory serves *this* goal — read the context, decide which angles actually apply, and
**phrase each query as a natural-language question** (see SKILL STEP 2; never keyword
bags). The example phrasings below are illustrative starting points; adapt them to the
real situation and let results steer your follow-ups.

### `pre-work-selection`

Goal: surface anything that should change which goal we pick. Angles worth considering:
- Prior runs of the top-priority goal's topic — e.g. *"Have we built something like `<topic>` before, and how did those runs turn out?"* (`app_id: <slug>` if known)
- Failure modes a future attempt should avoid — *"What blockers or failures came up in earlier `<topic>` work?"*
- Vendor/pattern fit — *"Which vendors or execution patterns struggled with `<topic>`?"* (cross-project, `app_id` unset)
- Cross-cutting lessons from retros — *"What recent retrospectives mention `<key entity>`?"* (`app_id: _global`, `metadata.type: reflective`)

Stop when successive queries yield no new IDs, or your judgment says you have enough to inform selection.

### `pre-spawn-pack`

Goal: pack what the worker will actually use.

Two parallel queries, merge:
1. **Project-scoped:** `filters: { app_id: <workItem.bundle_slug>, env: "prod" }`
2. **Global principles:** `filters: { app_id: "_global", metadata: { type: "principle" }, env: "prod" }`

Optional 3rd:
3. **Same-vendor lessons** if the worker vendor is pre-decided: `filters: { metadata: { worker_vendor: <vendor> } }`

Apply the pack selection rules (Section D) ruthlessly. Most memories that match these filters will NOT make the final pack.

### `failure-diagnosis`

Goal: has this failed before, and what worked?

Queries:
1. `"<failing step or error code>"` — `app_id: <workItem.bundle_slug>`
2. `"<same error code>"` — `app_id` unset (cross-project)
3. `"retros mentioning <error code or component>"` — `metadata.type: reflective`, `app_id: _global`
4. `"procedural memories for <step name>"` — `metadata.type: procedural`

If queries 1+2 return zero, the failure is novel. Note this in the synthesis — the executive should not pretend prior context exists.

### `post-retro` consult (before harvest)

Goal: avoid writing duplicates.

Queries:
1. `"<retro topic / project slug>"` — `app_id: <retro project>`
2. `"<key entities the retro names>"` — broad

If a prior memory already captures a fact the retro restates, **flag it** so the harvester writes a delta-only memory or skips.

---

## Section C — How to use a returned memory

Three actions per result. The agentic decision depends on audience + memory shape.

### Action 1: **Quote verbatim**

Use when:
- Memory contains literal identifiers (run_id, error code, file path) the consumer needs.
- The score is high (≥ 0.85) and the memory is concise.
- You're packing for the worker (Audience 2) — paraphrasing destroys discriminators.

Example: `"Run `2026-05-09-foo` failed at step 3 with `EAI_AGAIN`; retry succeeded."` → quote verbatim.

### Action 2: **Paraphrase into synthesis**

Use when:
- Audience is the executive (Audience 1) and you're synthesizing across multiple memories.
- Memory is verbose; only one phrase matters.
- Always include the memory ID for traceability: `(mem `abc12345…`)`.

### Action 3: **Skip**

Use when:
- Score is below `V3_MEM0_CONFIDENCE_FLOOR` (default 0.7).
- Memory restates something obvious (e.g., "the worker spawned successfully").
- Audience is worker pack and the memory doesn't change *what they would do*. If the worker would behave identically with or without this memory, drop it.
- The memory is stale (check `metadata.expires_at`; check the run date in `harvest_run`).

---

## Section D — Memory Pack composition (worker-facing)

The Memory Pack is the *one chance* memory has to influence the worker. Pack like you mean it.

### Inclusion criteria (all must hold)

A memory makes the pack if:

1. **Score ≥ 0.75** (stricter than executive synthesis floor)
2. **The worker can act on it** — it changes *what command, what path, what flag* the worker would choose
3. **It has a literal discriminator** the worker will encounter (file path, error code, vendor name, command flag)
4. **It's not already in CLAUDE.md or the playbook** for this skill

### Pack ordering (top to bottom)

1. Principles (immutable rules) — always first
2. Procedural (step-by-step that worked) — second; these have direct call-to-action
3. Reflective (failure patterns) — third; warns about pitfalls
4. Semantic (verified facts) — fourth; reference material
5. Episodic — last and only if directly relevant (e.g., "the prior run of this exact bundle ended at step X")

### Pack budget targets

- **0–2 memories:** common for projects with no prior runs. Don't pad.
- **3–5 memories:** sweet spot.
- **6–10 memories:** acceptable only if all are scored ≥ 0.85.
- **>10 memories:** trim. The worker can't usefully consume more than this in static context.

### Anti-pack examples (do NOT include)

- "The worker completed step 4 successfully." (no action implied)
- "Vendor claude generally works well." (too generic to act on)
- Six episodic memories from six prior runs of the same bundle — pick the one with the most relevant outcome, drop the rest.

---

## Section E — Result count decision tree

```
Query returns 0 results
  → Report "no prior memory" in synthesis. Do NOT fabricate.
  → For worker pack: omit the pack section or include only the global principles query result.

Query returns 1–3 results
  → Use all of them (after confidence floor).
  → For executive: paraphrase or quote.
  → For worker pack: quote verbatim if scores justify it.

Query returns 4–10 results
  → Read all; rank by (score × type-priority × recency).
  → For executive: synthesize across; cite IDs.
  → For worker pack: apply Section D ruthlessly. Typical output: 3–5 memories.

Query returns >10 results
  → You're querying too broadly. Add filters (type, env, app_id).
  → If you genuinely need them all (rare), summarize counts rather than packing.
```

Type-priority for ranking: `principle > procedural > reflective > semantic > episodic`.

---

## Section F — Cross-audience checklist

Before returning, ask:

- [ ] Did I cite every claim with a memory ID? (no fabricated context)
- [ ] If executive synthesis: are there 2–4 paragraphs, each grounded?
- [ ] If worker pack: is every memory actionable for *this specific worker on this specific task*?
- [ ] Did I respect the confidence floor and audience-specific score threshold?
- [ ] Did I report 0-result queries explicitly?
- [ ] Did I avoid searching for what was just written this turn? (limitations §2)

---

## Section G — Iteration mindset

After ~1 week of `pre-spawn-pack` runs live:

- **Audit which packed memories actually got referenced by worker output.** Memories cited in worker commits / logs = useful. Memories never referenced = junk; tighten Section D inclusion criteria.
- **Audit which queries returned 0 results when context suggested there *should* be a memory.** Recall gap — the discriminators on the write side need strengthening (harvester playbook §C).
- **Audit executive synthesis outputs for fabrication.** If the executive cited a memory ID that doesn't exist, the prompt failed an instruction — that's an executive-layer problem, not a memory-layer one.

Bump this playbook (and `SCHEMA_VERSION` if filter shapes change) when the editorial policy meaningfully shifts. Track in `taxonomy-changelog.md`.
