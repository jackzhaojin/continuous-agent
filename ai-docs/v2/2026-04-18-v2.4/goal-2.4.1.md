# v2.4.1 — Progressive Skill Disclosure for Workers

**Status:** Planned
**Focus:** Stop pasting full skill bodies into every worker prompt. Replace with a tiny manifest + on-demand `ReadFile` of skills the worker decides it needs. Verify the worker actually consulted the right ones.

> **Sub-release of v2.4.** Carries forward the cost/quality concerns surfaced during the Recipe Book run on 2026-04-18: Kimi K 2.5 was paying ~480 lines of skill content per spawn (worker-base 191 + web-testing 150 + jack-git-commit 139) on every one of 19 steps, with no native lazy-load mechanism like Claude SDK's `Skill` tool.

## Why v2.4.1 Exists

### The current state (broken)

`src/agentic/intelligence/prompt-builder.ts:377-393` embeds the **full body** of every "relevant" skill into the prompt:

```ts
if (workerBaseSkill) sections.push(renderSkillBody(workerBaseSkill.body, skillVars).trim());
if (webTestingSkill) sections.push(renderSkillBody(webTestingSkill.body, skillVars).trim());
if (backendTestingSkill) sections.push(renderSkillBody(backendTestingSkill.body, skillVars).trim());
```

For Claude this is mostly free — Claude SDK doesn't actually load the bodies until the worker calls the `Skill` tool. For Kimi/Codex it's a hard cost: **every line of every "relevant" skill is paid in tokens, every spawn, no exceptions, no on-demand**. Worker-base alone is now 191 lines and growing (v2.4 added Clean-Tree Rule + UI Libraries sections).

### Evidence Kimi can do better

The Recipe Book run on 2026-04-18 produced direct evidence that Kimi K 2.5 already proactively reads `SKILL.md` files when they're referenced in its prompt:

- **Step 9 worker** (`contract-1776562209827`) called `ReadFile` on `.claude/skills/jack-git-commit/SKILL.md` mid-run after the worker-base prompt mentioned the skill by name. It then committed using exactly the conventional commit format from the skill body.
- **Step 10 worker** (`contract-1776562720472`) called `ReadFile` on both `web-testing/SKILL.md` and `jack-git-commit/SKILL.md` before writing code, applied the playwright-cli protocol from `web-testing` verbatim.
- **Step 11 worker** (`contract-1776563608519`) followed the same pattern.

Three consecutive Kimi workers, three consecutive same-vendor proofs that file-reference + ReadFile already works. We are paying for prompt injection that Kimi doesn't need.

### What this enables

- **Token cost drop**: rough estimate ~55% per Kimi spawn (480 lines → ~220 lines + on-demand reads)
- **Skill library can grow without per-spawn tax**: today every worker pays for `playwright-demo-video` (743 lines) only if it's matched, but ANY skill we add to the always-loaded set is paid forever
- **Better signal on what skills matter**: ReadFile telemetry tells us which skills workers actually consult vs which sit unread
- **Path to Kimi parity with Claude on cost** without a vendor-specific abstraction

### What this is NOT

- Not a new vendor abstraction (no Kimi-native skill protocol — that POC is separate, see "Future" below)
- Not a removal of skills — same content, same files, same authoring workflow
- Not a change to the executive-skill loading path (`.claude/skills/`) — those are unchanged
- Not Claude-relevant — Claude SDK already does this via the `Skill` tool

---

## Scope

### In Scope

1. **Generate a worker-skill INDEX** (`claude-files-to-output/skills/INDEX.md`) auto-built from each skill's frontmatter `name` + `description` + new `when_required` field
2. **Slim the always-loaded prompt** down to: worker-base (universal) + INDEX (manifest only) + a strong directive
3. **Add a directive in worker-base** that mandates `ReadFile` of any SKILL.md whose `when_required` matches the current step before writing code
4. **Add a verifier** (`workspace/verifiers/skill-consultation.ts` or wired into integration-validator-runner) that scans the worker log for `ReadFile` calls against expected `SKILL.md` paths and fails the step if a required skill was skipped
5. **Update `prompt-builder.ts:377-393`** to inject INDEX.md instead of full skill bodies
6. **Telemetry**: emit `WORKER_SKILL_LOADED` (when prompt-builder includes skill in INDEX) and `WORKER_SKILL_CONSULTED` (when worker ReadFiles a SKILL.md) ledger events. Closes the gap noted today: today only `EXECUTIVE_SKILL_USED` exists.
7. **Move web-only content out of worker-base**: the v2.4 I4 "UI Libraries" section belongs in `web-testing` or a new `ui-components` skill, not in the universal worker-base. Same for any future web-specific additions.
8. **Vendor scope**: Kimi (CLI + Wire) and Codex. Claude path is a no-op — its SDK already lazy-loads via the `Skill` tool, so the prompt-builder injection for Claude can either keep the current behavior or also switch to INDEX.md (TBD by run data).

### Out of Scope

- Building a Kimi-native skill protocol (that's a separate POC, see "Future")
- Reorganizing existing skill content other than moving the v2.4 I4 web-only section
- Changing executive skill loading (`.claude/skills/` for the executive process)
- Changing the SKILL.md frontmatter format beyond adding `when_required`

---

## Approach

### Phase 1 — Add `when_required` to every worker SKILL.md (1 hr)

Update frontmatter in each skill:

```yaml
---
name: web-testing
description: Mandatory visual testing protocol for web projects. Required if your step touches UI, routes, forms, or rendered components.
when_required: |
  Required when:
  - The step adds or modifies a page, route, or rendered component
  - The step adds a form, button, or interactive element
  - The step is an integration_gate on a web project
  Skip when:
  - The step is purely backend/API/schema
  - The step is non-user-facing config or docs
user-invocable: false
---
```

Files to update (12 skills): `worker-base`, `web-testing`, `backend-testing`, `jack-git-commit`, `integration-validator`, `playwright-demo-video`, `prd-writer`, `project-analysis`, `project-architect`, `task-breakdown`, `claude-skill-creator`, `calibration-eds`, `calibration-nextjs`.

### Phase 2 — Build the INDEX generator (1-2 hr)

A small deterministic helper at `src/deterministic/skill-index-generator.ts` that:

1. Scans `claude-files-to-output/skills/*/SKILL.md`
2. Extracts `name`, `description`, `when_required` from each frontmatter
3. Renders a single Markdown index suitable for prompt injection
4. Optionally writes to disk (`claude-files-to-output/skills/INDEX.md`) so workers can also `ReadFile` the index itself if needed

Output shape (~30 lines for a typical 12-skill library):

```markdown
# Available Worker Skills

Read each skill's full body via `ReadFile .claude/skills/<name>/SKILL.md` ONLY when its when_required matches your current step.

| Skill | Description | When required |
|---|---|---|
| worker-base | Constitution + universal rules | always (already loaded above) |
| web-testing | Visual testing via playwright-cli | UI step on web project |
| backend-testing | Curl-verify APIs, persistence round-trips | API/schema step |
| jack-git-commit | Conventional commit format with metadata footers | every commit |
| integration-validator | Gate-step validation protocol | integration_gate step |
| ... | ... | ... |
```

### Phase 3 — Wire the new injection in prompt-builder (1 hr)

Replace `prompt-builder.ts:377-393`:

```ts
// OLD
if (workerBaseSkill) sections.push(renderSkillBody(workerBaseSkill.body, skillVars).trim());
if (webTestingSkill) sections.push(renderSkillBody(webTestingSkill.body, skillVars).trim());
if (backendTestingSkill) sections.push(renderSkillBody(backendTestingSkill.body, skillVars).trim());

// NEW
if (workerBaseSkill) sections.push(renderSkillBody(workerBaseSkill.body, skillVars).trim());
sections.push(generateSkillIndex(skillResult.skills));
sections.push(SKILL_DIRECTIVE);  // strong language: "MUST ReadFile any SKILL.md whose when_required matches"
```

Where `SKILL_DIRECTIVE` is a short, hard-edged paragraph in worker-base style:

```
## MANDATORY: Skill Consultation Before Code

Before you write or modify any code, you MUST review the "Available Worker Skills" table above. For every skill whose `when_required` matches this step, you MUST call ReadFile on its SKILL.md path and follow its protocol. Skipping a required skill is a defect — the validator scans your log for these reads and will fail the step if a required skill was unread.

If a step is ambiguous, prefer over-reading (one extra skill is cheap) to under-reading (one missed skill ships broken work).
```

### Phase 4 — Move v2.4 I4 web-only content out of worker-base (30 min)

The "UI Libraries (MANDATORY for web projects)" section currently in `worker-base/SKILL.md:91-110` (added in v2.4 I4) is web-specific. Move it to `web-testing/SKILL.md` (or a new `ui-components/SKILL.md` if it grows). This is a sanity check that the new manifest model actually disciplines what goes into worker-base.

### Phase 5 — Add the consultation verifier (2 hr)

New verifier at `workspace/verifiers/skill-consultation.ts` (or merged into `integration-validator-runner.ts`):

```ts
// Pseudocode
function verifySkillConsultation(workerLog, requiredSkills): VerifierResult {
  for (const skill of requiredSkills) {
    const skillPath = `.claude/skills/${skill.name}/SKILL.md`;
    const wasRead = workerLog.includes(`ReadFile`) && workerLog.includes(skillPath);
    if (!wasRead) {
      return { pass: false, reason: `Required skill "${skill.name}" was not consulted (no ReadFile of ${skillPath} in worker log)` };
    }
  }
  return { pass: true };
}
```

Wire it into the validator pipeline so a worker that ignores the manifest fails the step instead of silently passing.

### Phase 6 — Telemetry events (30 min)

In `prompt-builder.ts`, when each skill is added to INDEX, emit:

```jsonl
{"event":"WORKER_SKILL_LOADED","ts":"...","goal_id":"...","contract_id":"...","skill_name":"web-testing","mode":"index"}
```

In the verifier, when a skill's `ReadFile` is detected:

```jsonl
{"event":"WORKER_SKILL_CONSULTED","ts":"...","goal_id":"...","contract_id":"...","skill_name":"web-testing"}
```

Now `grep WORKER_SKILL_LOADED ledgers/work-ledger.jsonl | wc -l` vs `grep WORKER_SKILL_CONSULTED` gives a real adoption ratio per skill.

---

## Success Criteria

The release is successful when ALL of the following are true after one full Recipe Book-class run on Kimi K 2.5:

1. **Token reduction** ≥ 30% on the prompt body for a typical web build step (measured via worker log first-MSG length)
2. **Skill consultation rate** ≥ 80% on required skills — workers ReadFile what they're told to ReadFile (measured from `WORKER_SKILL_CONSULTED` events vs `WORKER_SKILL_LOADED` events)
3. **No regression in journey quality** — same number of journey gates pass on the same goal, same number of validator-filed defects or fewer
4. **No regression in commit quality** — `git log` shows the same conventional-commit format adherence (since `jack-git-commit` is ReadFiled on demand instead of always-loaded)
5. **Worker-base size capped** — after the v2.4 I4 move, worker-base is back under 200 lines, and a CI check (or new adhoc test) warns when it crosses 250
6. **Validator-detectable failure mode**: an intentional test where the worker is given a step that requires `web-testing` and asked to skip it produces a verifier failure, not a silent pass

---

## Files Affected

| File | Change |
|---|---|
| `src/agentic/intelligence/prompt-builder.ts` | Lines 377-393 replaced with INDEX injection + directive |
| `src/deterministic/skill-index-generator.ts` | NEW — frontmatter scanner + INDEX renderer |
| `claude-files-to-output/skills/*/SKILL.md` | Frontmatter updated with `when_required` (12 skills) |
| `claude-files-to-output/skills/INDEX.md` | NEW — generated; can be regenerated on every spawn or pre-built |
| `claude-files-to-output/skills/worker-base/SKILL.md` | UI Libraries section moved out; new SKILL_DIRECTIVE added |
| `claude-files-to-output/skills/web-testing/SKILL.md` | Receives the moved UI Libraries section |
| `src/agentic/execution/integration-validator-runner.ts` | New skill-consultation check (or new sibling verifier) |
| `src/deterministic/state-handler.ts` | Emit `WORKER_SKILL_LOADED` and `WORKER_SKILL_CONSULTED` events |
| `tests/adhoc/i5-skill-index-generation.adhoc.ts` | NEW — verify INDEX renders correctly from frontmatter |
| `tests/adhoc/i6-skill-consultation-verifier.adhoc.ts` | NEW — verify the verifier detects unread required skills |

---

## Open Questions

1. **Should Claude path also switch to INDEX?** Claude SDK lazy-loads via the `Skill` tool, so the current full-body injection is technically wasteful for Claude too. But Claude has more headroom and the SDK behavior is well-tested. Recommendation: **keep Claude on full-body for v2.4.1, evaluate switching in v2.5 once Kimi telemetry confirms the manifest model is stable.**
2. **Should INDEX include the playbook-matched skills**, or only the always-eligible ones? Recommendation: **include all worker skills**, since the `when_required` field tells the worker which to actually read. Keep playbook matching as a separate signal.
3. **How strict should the verifier be?** A worker that reads `web-testing` but not `jack-git-commit` on a commit step — fail outright, or warn? Recommendation: **fail outright on missing required skills, since silent-pass is the failure mode v2.4 H/I items repeatedly hit.**
4. **Token budget for the directive paragraph** — the SKILL_DIRECTIVE needs to be persuasive enough that Kimi obeys it. If three runs show low consultation rate, escalate the language and add an example.

---

## Future (v2.4.2 or v2.5)

- **Kimi-native skill protocol POC** — investigate whether Kimi K 2.5 CLI has any AGENTS.md-style auto-loaded context mechanism. If yes, the INDEX could be moved to that file and removed from the prompt entirely. Tracked separately because it requires Kimi CLI source-spelunking and may not exist.
- **Custom `load_skill` shell helper** — instead of `ReadFile <path>`, a `load_skill <name>` helper script in PATH that workers call. Prettier syntax, same outcome. Defer until v2.4.1 telemetry shows skill consultation working.
- **Per-vendor INDEX variants** — Codex may benefit from a slightly different directive than Kimi. Defer until comparative data exists.

---

## References

- `src/agentic/intelligence/prompt-builder.ts:44` — `WORKER_SKILLS_ROOT` definition
- `src/agentic/intelligence/prompt-builder.ts:220` — `loadSkillLibrary` call
- `src/agentic/intelligence/prompt-builder.ts:377-393` — Skill body injection (the lines this goal replaces)
- `src/agentic/intelligence/vendor-adapter.ts:117-130` — Secondary skill-body injection for non-Claude vendors
- `.claude/rules/skills-and-prompts.md` — Two-CWD skill model documentation
- Recipe Book run evidence: `ledgers/2026-04-19/worker-contract-1776562209827.log`, `worker-contract-1776562720472.log`, `worker-contract-1776563608519.log` — direct proof Kimi reads SKILL.md on demand when referenced in prompt
