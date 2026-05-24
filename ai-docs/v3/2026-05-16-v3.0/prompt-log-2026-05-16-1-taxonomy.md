# V3.0 Second-Brain — Taxonomy & Agentic Structure Prompt Log

**Agent**: claude-code
**Project**: continuous-agent — V3.0 second-brain (mem0)
**Sessions covered**: May 16, 2026 (post-POC) — taxonomy design, executive-vs-worker prompt convention, agentic test research, memory loading/saving guidance

This log picks up immediately after `prompt-log-0-poc.md` (POC complete, READMEs updated, executive summaries added). Focus shifts from "does mem0 work?" to "how do we structure the agent's use of it?"

---

## Session 1: Checkpoint & Convention Discovery (May 16, 2026 — late morning)

### Prompt 1: Commit all POC files (11:15 AM)

> /jack-git-commit all files

→ Response: Staged POC docs, READMEs, executive summaries, prompt-log-0-poc.md.
→ Action: Ran jack-git-commit skill, drafted commit message covering POC completion.

### Prompt 2: Confirm commit (11:17 AM)

> yes

→ Response: Committed POC bundle to main.
→ Action: `git commit` (no push). ✅

### Prompt 3: Compact context (11:17 AM)

> /compact

→ Response: Compacted conversation history to free working context.
→ Action: Ran /compact.

### Prompt 4: MCP status check (11:20 AM)

> /mcp

→ Response: Listed connected MCP servers; confirmed mem0 MCP wiring is local-only (not registered in continuous-agent global config yet).
→ Action: Ran /mcp.

### Prompt 5: Where do executive agentic prompts live? (11:23 AM)

> OK with mem0 poc complete in '/Users/jackjin/dev/continuous-agent/references/poc/mem0/mcp-poc/README.md' and sdk '/Users/jackjin/dev/continuous-agent/references/poc/mem0/graph-poc/README.md'. I'd much rather have a written down list of agentic skills for memory that the executive agent has access to vs putting it in code...

→ Response: Agreed — the agentic intelligence belongs in markdown, not TypeScript. Sketched a `prompts/v3-memory/` directory with one markdown per agentic operation (write, read, retire, etc.).
→ Action: Drafted folder layout under `.claude/prompts/v3-memory/`.

### Prompt 6: Is `.claude/prompts/` the official structure? (11:41 AM)

> for my learning '/Users/jackjin/dev/continuous-agent/.claude/prompts/v3-memory' is this the proper structure for prompts? i like it if it's official, just curious

→ Response: Honest — it's not. The codebase convention is `.claude/skills/<name>/SKILL.md` loaded via `loadSkillPrompt()`, which gets ledger logging for free. A new top-level `prompts/` would skip that.
→ Action: Flagged convention drift before any new dirs got committed.

### Prompt 7: Do we have any executive agentic markdown today? (11:45 AM)

> I guess thinking about this more - do we have executive agentic markdown files ANYWHERE? (not worker markdown but agentic stuff)

→ Response: Yes — `.claude/skills/<name>/SKILL.md` is the executive's agentic prompt store (work-selection, goal-breakdown, validator, retrospective, failure-diagnosis, etc.). All loaded via `loadSkillPrompt()` from `src/agentic/intelligence/skill-prompt-loader.ts`.
→ Action: Pointed at existing executive skills as the precedent; memory ops should follow the same pattern.

### Prompt 8: Document executive vs worker prompt locations clearly (11:49 AM)

> Let's match existing convention, and it's kind of important that to the whole project exactly where "worker" and "executive" saves their prompt and skills. can you make sure that's documented clearly in CLAUDE.md and rules

→ Response: Added the two-store table to `CLAUDE.md` (executive: `.claude/skills/`, worker: `claude-files-to-output/skills/`) plus full details in `.claude/rules/skills-and-prompts.md`. Mem0 ops will live under `.claude/skills/memory-*/SKILL.md`.
→ Action: Updated `CLAUDE.md` with the audience/location/sync table and Do/Don't bullets; cross-linked to the rules file.

### Prompt 9: Checkpoint commit (11:55 AM)

> /jack-git-commit one commit before we move on as a checkpoint

→ Response: Drafted checkpoint commit covering the prompt-location documentation.
→ Action: Ran jack-git-commit skill.

### Prompt 10: Confirm commit (11:56 AM)

> yes

→ Response: Committed CLAUDE.md + rules update.
→ Action: `git commit` (no push). ✅

---

## Session 2: Agentic Testing Research (May 16, 2026 — midday)

### Prompt 11: Tests for agent SDK + memory MCP firing (12:36 PM)

> Any tests we can try and run for now with agentsdk from the right cwd and make sure memory mcp skills are firing and working? '/Users/jackjin/dev/continuous-agent/tests'? One thing we should do research on is how to test agentic capabilities — historically this codebase has been deterministic.

→ Response: Surveyed `tests/` — all current tests are deterministic (unit + mock e2e). No precedent for "is the agent actually picking the right skill?" assertions.
→ Action: Read tests/ index, flagged the gap.

### Prompt 12: Look up best practices for agentic testing (12:37 PM)

> well let's look on the internet for best practices, i'm not sure what we have is best practice. we need a way to validate agentic capabilities as we're building them

→ Response: Researched the agentic-eval landscape (LangSmith trajectory eval, Anthropic's tool-use evals, Inspect AI from UK AISI, Braintrust trajectory scoring). Common pattern: golden trajectories + LLM-as-judge + tool-call assertions.
→ Action: WebSearch + WebFetch on agentic eval best practices.

### Prompt 13: Historical context (12:37 PM)

> the code base has been historically deterministic

→ Response: Acknowledged — that's why no precedent exists. Proposed adding a new `tests/agentic/` lane: golden-prompt fixtures + LLM-judge harness for skill selection accuracy.
→ Action: Drafted plan for separate agentic test track that doesn't disturb deterministic tests.

---

## Session 3: Taxonomy Design (May 16, 2026 — early afternoon)

### Prompt 14: Define human-readable mem0 taxonomy (12:49 PM)

> Continuing on our mem0 implementation - One thing I didn't define is a solid human readable taxonomy, that properly uses the mem0 metadata. i never used mem0 but i know we need a proper taxonomy. we are using v3 with native graph...

→ Response: Drafted a 5-tier memory taxonomy mapped to mem0 metadata fields:
  1. **Principle** (constitutional invariants — never delete)
  2. **Semantic** (facts about the world — Jack's preferences, project conventions)
  3. **Procedural** (how-to playbooks — "when X happens, do Y")
  4. **Episodic** (run-specific events — what happened in goal `2026-05-16-foo`)
  5. **Reflective** (retro-derived lessons — must-fix patterns)

  Each tier uses `metadata.memory_type`, plus `metadata.run_id`, `metadata.goal_slug`, `metadata.skill`, `metadata.confidence`, `metadata.expires_at`.
→ Action: Wrote `taxonomy.md` draft with field definitions, write-time rules, retention policy per tier.

### Prompt 15: Commit checkpoint (1:02 PM)

> yes please with /jack-git-commit

→ Response: Committed taxonomy draft + agentic-eval research notes.
→ Action: Ran jack-git-commit.

### Prompt 16: Confirm (1:03 PM)

> yes

→ Response: Committed.
→ Action: `git commit` (no push). ✅

### Prompt 17: Be opinionated on mem0's 4 ID fields (1:04 PM)

> ok on https://docs.mem0.ai/api-reference/memory/add-memories you're correct - maybe we should be opinionated on agent id, user id, run id and app id and how those 4 are always populated [Image #1]

→ Response: Locked the 4-field convention:
  - `user_id` = agent slug (e.g., `irin-julg`, configurable via `V3_MEM0_USER_ID`)
  - `agent_id` = always `"executive"` (workers never write)
  - `run_id` = current goal slug `YYYY-MM-DD-{name}` (matches workspace bundle)
  - `app_id` = always `"continuous-agent"` (lets the same mem0 account serve other agents later)

  Every write populates all 4; reads filter by combinations.
→ Action: Documented the opinionated ID schema in `taxonomy.md`.

### Prompt 18: Compact (1:04 PM)

> /compact

→ Response: Compacted to free context for taxonomy + skill design.
→ Action: Ran /compact.

---

## Session 4: Safety Check & Pre-Review (May 16, 2026 — early afternoon)

### Prompt 19: Are we affecting 2.x flows yet? (1:12 PM)

> so far nothing is committed that would impact our 2.x flows right? we're just building markdown files for now, and maybe when ai chooses a skill would it impact current execution?

→ Response: Confirmed — all v3 work so far is additive markdown (taxonomy doc, prompt-location docs in CLAUDE.md, POC code under `references/poc/`). Zero TypeScript changes to the executive loop. The v3 memory skills will only fire when the executive explicitly invokes them; until that wiring lands in `executive-loop.ts`, 2.x runs untouched.
→ Action: Audited git log + grep for any `src/` changes; clean.

### Prompt 20: Pre-review uncommitted taxonomy work (1:14 PM)

> can you prereview uncommitted changes? i had a taxonomy.md thing going for the AI driven taxonomy

→ Response: Reviewed staged + unstaged diff. Found 5 issues:
  1. `taxonomy.md` was missing the `expires_at` semantics for episodic memories
  2. Confidence field had no scale defined (0-1? 1-5?)
  3. No guidance on what NOT to write (e.g., transient state, secrets)
  4. Mem0's `categories` field wasn't used — taxonomy duplicated it via metadata
  5. No example writes per tier
→ Action: Listed issues 1-5 with proposed fixes.

### Prompt 21: Fix issues 1-5 (1:17 PM)

> ya let's fix 1-4 or even 1-5

→ Response: Applied all 5 fixes:
  1. `expires_at` = ISO-8601 timestamp; episodic defaults to 90d, semantic never expires
  2. Confidence = 0.0-1.0 float; <0.5 triggers re-validation on next read
  3. Added "do not memorize" list (API keys, transient retry counts, current PM2 state)
  4. Use mem0 native `categories` for top-level tier; metadata for sub-classification
  5. Added one worked example per tier (principle/semantic/procedural/episodic/reflective)
→ Action: Updated `taxonomy.md` with revised schema + examples.

---

## Session 5: Agentic Loading & Saving Guidance (May 16, 2026 — afternoon)

### Prompt 22: Is it clear what to memorize and load? (1:20 PM)

> Is it clear agentically what we should be putting in memory and what we should be loading into memory agentically? i know this is the first time we're doing this. i'm not super clear what the final plan is

→ Response: Honest — the WRITE side is clearer than the READ side. Writes have natural trigger points (post-retro, post-run, post-spec-merge). Reads are vaguer — when does the executive even *think* to query memory? Sketched explicit "memory consultation moments":
  - Pre-work-selection: "have I tried this kind of goal before?"
  - Pre-spawn: "what context should I pass to the worker?"
  - Pre-failure-diagnosis: "have I failed at this before?"
→ Action: Drafted memory-consultation trigger list.

### Prompt 23: Need agentic guidance for write + read (1:23 PM)

> I think we need to give some guidance agentically on what should happen and how memory looks like, and when we run it we'll have a better idea of what's going on

→ Response: Proposed two paired skills:
  - `memory-harvester` (write side) — invoked agentically post-run, decides what's worth saving, picks tier, writes with proper IDs
  - `memory-reader` (read side) — invoked at each consultation moment, decides query shape, applies filters, returns curated context
  Both as `.claude/skills/<name>/SKILL.md` so they get the standard executive-skill treatment.
→ Action: Drafted skill stubs.

### Prompt 24: Both load and save sides (1:23 PM)

> Both on loading and saving side

→ Response: Confirmed — design the pair together so the harvester writes in the shape the reader expects. Added round-trip examples to taxonomy (write tier X → reader filters on metadata Y).
→ Action: Aligned reader filter contract with harvester write contract in `taxonomy.md`.

### Prompt 25: Feed memory into worker prompts too (1:23 PM)

> And I'm guessing we should feed executive agents with the right memory, as well as with workers, if workers can benefit from knowing memory from previous runs, executive agent should feed it into the worker

→ Response: Yes, but workers never call mem0 directly (V3.0 executive-tier-only pillar). Pattern: executive runs `memory-reader` pre-spawn, distills relevant memories into a "memory pack" markdown block, `worker-spawner.ts` injects it into the generated `CLAUDE.md` for that spawn. Worker reads it as static context.
→ Action: Documented the pre-spawn memory-pack pattern; flagged `worker-spawner.ts` as the injection point.

### Prompt 26: Update goal.md and hosting decision with these conclusions (1:24 PM)

> When done - Update '/Users/jackjin/dev/continuous-agent/ai-docs/v3/2026-05-16-v3.0/goal.md' and '/Users/jackjin/dev/continuous-agent/ai-docs/v3/2026-05-16-v3.0/second-brain-hosting-decision.md'

→ Response: Folded all session decisions into the v3 design docs:
  - `goal.md` — added 4-field ID convention, 5-tier taxonomy summary, paired skills (`memory-harvester` + `memory-reader`), pre-spawn memory-pack pattern, executive-tier-only pillar restated.
  - `second-brain-hosting-decision.md` — added open-source-friendly env naming, opt-in flag, "no irin.julg in commits" rule, 4-field ID schema.
→ Action: Updated both docs.

---

## Session 6: Checkpoint & Logging (May 16, 2026 — afternoon)

### Prompt 27: Checkpoint commit (1:35 PM)

> /jack-git-commit one commit please

→ Response: Drafted checkpoint commit for taxonomy + goal/hosting doc updates + memory-skill design.
→ Action: Ran jack-git-commit skill.

### Prompt 28: Confirm commit (1:37 PM)

> yes

→ Response: Committed v3 taxonomy + design-doc updates.
→ Action: `git commit` (no push). ✅

### Prompt 29: Log this session (1:37 PM)

> /conversation-logger everything after '/Users/jackjin/dev/continuous-agent/ai-docs/v3/2026-05-16-v3.0/prompt-log-0-poc.md' into taxonomy - call it prompt-log-1-taxonomy.md

→ Response: Compiled this prompt log from `~/.claude/history.jsonl` covering the post-POC taxonomy + agentic-structure session.
→ Action: Wrote `prompt-log-1-taxonomy.md`. ✅

---

**Session Summary**: Discovered the executive-vs-worker prompt-location convention (`.claude/skills/` vs `claude-files-to-output/skills/`) and documented it in `CLAUDE.md`. Researched agentic testing best practices (golden trajectories + LLM-judge). Designed the V3.0 mem0 taxonomy: 5 memory tiers (principle/semantic/procedural/episodic/reflective), opinionated 4-field ID schema (`user_id`/`agent_id`/`run_id`/`app_id`), paired `memory-harvester` + `memory-reader` skills, pre-spawn memory-pack injection pattern. Confirmed v3 work is purely additive markdown — zero impact on 2.x execution flows until skills get wired into the executive loop.
