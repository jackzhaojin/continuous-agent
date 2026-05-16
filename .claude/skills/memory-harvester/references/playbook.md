# Harvester Playbook (Writing Side)

> **What to write, when, and what good looks like.** This is the editorial complement to `taxonomy.md` (schema) and the SKILL.md (steps). Read all three before composing payloads.
>
> Versioned with the taxonomy. Current version: **v1.0.0**. Iterate based on real writes — bump and re-issue when patterns shift.

---

## Section A — Soft write budgets per trigger

These are **aim ranges**, not validator rules. If you're outside the range, ask yourself whether you're being too eager or too cautious. Writing zero is often the right answer.

| Trigger | Typical count | Budget rationale |
|---|---|---|
| `post-run` | **1–3** | One episodic (always — the run happened); zero or one semantic/procedural if a non-obvious lesson emerged. Most runs produce no new lessons. |
| `failure-diagnosis` | **0–2** | Write a reflective only when a pattern is *clear*. One failure ≠ a pattern. Cross-reference at least one prior run before claiming a pattern. |
| `post-retro` | **2–8** | Retros are the densest source of lessons. Most outputs are reflective + semantic. Skip principles unless the retro explicitly proposes a constitutional rule. |
| `spec-merge` | **3–10** | One per locked principle in the merged spec. These are immutable; be deliberate. |
| `manual-harvest` | **operator-defined** | Whatever the operator asks. No automatic budget. |
| `practice-loop` | **0–1** | The executive's own practice turn produces few facts worth keeping. Usually skip entirely. |

**Hard ceiling:** if you're about to write more than 10 memories in one invocation, stop and re-check. You're probably restating the source.

---

## Section B — Decision tree per trigger

### `post-run`

You receive: workItem outcome, contract events, validator report, output_path, vendor.

```
1. Did the run reach a validated PASS or hard FAIL?
   → yes: write 1 episodic memory describing what happened (always).
   → unclear/inconclusive: write 1 episodic with outcome="partial".

2. Did anything *surprising* happen that future runs of this bundle would benefit from knowing?
   Examples of "surprising":
     - A vendor exhibited a behavior we hadn't documented (e.g., kimi-cli retried 3× on EAI_AGAIN)
     - A step took >2× the expected duration with no error
     - A workaround the worker had to invent that wasn't in the playbook
   → yes: write 1 semantic memory capturing the fact (confidence 0.7–0.9).
   → no: stop after the episodic.

3. Did the worker invent a new step-by-step that future runs could reuse?
   → yes: write 1 procedural memory (confidence 0.6–0.8 — procedures need replication to firm up).
   → no: stop.
```

### `failure-diagnosis`

You receive: failure signals, the failed run's contract, prior similar failures (from a pre-search).

```
1. Is this the FIRST observed instance of this failure mode?
   → yes: write nothing (single data point ≠ pattern). The episodic from post-run is enough.
   → no: continue.

2. Are there ≥2 prior similar failures with the same root cause signal?
   → yes: write 1 reflective memory linking the runs by literal run_id list (confidence 0.75–0.9).
   → no: write nothing yet.
```

### `post-retro`

You receive: a retro markdown doc the human or executive authored.

```
1. For each "must-fix" item (H1, H2, I1, I2…) in the retro:
   → if it's a *cross-run* lesson: 1 reflective memory.
   → if it's a *verified fact about a tool/vendor/component*: 1 semantic memory.
   → if it's a *step-by-step that worked*: 1 procedural memory.
   → if the retro proposes a *constitutional rule*: skip — that's spec-merge territory.

2. Skip everything that just restates what the retro says.
   The memory's job is to be findable later — embed literal IDs, vendor names, error codes.
   The retro itself is the long-form source; the memory is the *retrievable pointer*.
```

### `spec-merge`

You receive: the merged spec markdown (PRD, constitution amendment, hosting decision, etc.).

```
1. For each numbered pillar / rule / constraint the spec locks:
   → 1 principle memory, immutable: true, confidence 1.0.
   → Embed the literal pillar number / section name in `text` for findability.

2. Skip prose. Pillars only.
```

---

## Section C — Good vs junk gallery

### Episodic (post-run)

**Junk:**
> "The worker completed successfully."

**Good:**
> "Run `2026-05-16-credit-card-stockpile` (source: `workspace/in-progress/credit-card-stockpile/STEPS.json`) completed all 12 steps via vendor=claude harness=plan-then-execute. Validator PASS on all DoD items. Total duration 38min."

Why good wins: bundle slug, run_id, source path, vendor, harness, step count, duration — all literal, all findable.

---

### Semantic (post-run or post-retro)

**Junk:**
> "Kimi can be flaky."

**Good:**
> "Vendor `kimi-cli` fails the npm-install step with `EAI_AGAIN` (DNS) approximately 40% of the time on Node 22.x. Retry attempt 2 succeeds in 8 of 8 observed cases (runs 2026-05-09-foo, 2026-05-12-bar, 2026-05-14-baz). Source: `ai-docs/v2/2026-05-15-v2.4/retro-kimi-flakes.md`."

Why good wins: vendor verbatim, error code verbatim, quantified, replicated, source.

---

### Procedural (post-retro or post-run)

**Junk:**
> "Use playwright for web testing."

**Good:**
> "For Next.js app-router projects on port 3000: spawn `next dev`, wait for `started server on` line in stdout (use `Bash(timeout 30s ...)`), then run `playwright-cli` from the `.playwright-cli/` dir. Sequence verified in runs `2026-05-10-postal-checkout`, `2026-05-13-pageforge`. Source: `claude-files-to-output/skills/calibration-nextjs/SKILL.md`."

Why good wins: specifies framework, port, wait condition, tool path, verification runs.

---

### Reflective (post-retro or failure-diagnosis)

**Junk:**
> "Sometimes validators miss things."

**Good:**
> "Verifiers that check `process.cwd()` instead of `result.output_path` mark UI-broken builds as PASS. Observed in runs `2026-04-15-postal-checkout`, `2026-04-20-pageforge`. Root cause: monorepo CWD ≠ output worktree. Fix: H1 in `ai-docs/v2/2026-04-15-v2.1.7/retro-postal-checkout.md`. Source: same retro."

Why good wins: names the bug pattern, lists confirming runs, points at the must-fix item, cites the retro.

---

### Principle (spec-merge)

**Junk:**
> "Workers shouldn't write to memory."

**Good:**
> "V3.0 Pillar 1 (executive-only writer): Workers, ad-hoc scripts, and the conversational executive never call `client.add()` directly. The `memory-harvester` skill is the SOLE WRITER. Locked in `ai-docs/v3/2026-05-16-v3.0/second-brain-hosting-decision.md` §V3.0 Pillars."

Why good wins: pillar number, exact mechanism (`client.add()`), the locked skill name, the spec section.

---

## Section D — Zero-write scenarios

**Writing zero is correct in:**

- Routine runs that completed without surprise (write 1 episodic, skip semantic/procedural)
- Single failures with no comparable prior — wait for a second data point
- Practice loops that produced no facts worth keeping (most of them)
- Retros that only restate facts already in mem0 from prior post-run writes
- Specs that don't lock new pillars (changes to existing principles → update via migration, not new write)

The cost of *not* writing is low (re-derivable from source). The cost of writing junk is high (it pollutes future retrievals and never gets cleaned up unless you set `expires_at`).

---

## Section E — Iteration mindset

This playbook is **v1.0.0**. We expect to learn from real writes:

- After ~1 week of `post-run` harvesting, audit what got written. Junk patterns → tighten the rejection criteria in Section B.
- If memories surface in retrievals but never seem useful, those types/categories need pruning.
- If memories *don't* surface when needed, the discriminators are too sparse — strengthen Section C examples.

Bump this playbook (and `SCHEMA_VERSION` if a field shape changes) when the editorial policy meaningfully shifts. Track in `taxonomy-changelog.md`.
