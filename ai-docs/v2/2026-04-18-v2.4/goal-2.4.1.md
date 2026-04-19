# v2.4.1 — Progressive Skill Disclosure for Workers

**Status:** Implemented 2026-04-18 (awaiting live-run telemetry to confirm token drop + consultation rate)
**Focus:** Stop pasting full skill bodies into every worker prompt. Replace with a tiny manifest + on-demand `ReadFile` of skills the worker decides it needs. Verify the worker actually consulted the right ones.

## Implementation Note

- **Manual Worker Skill Index** inside `claude-files-to-output/skills/worker-base/SKILL.md` — one row per skill on disk (path + one-line purpose), authored by hand. This is the authoritative list workers consult. The i5 adhoc test enforces parity with on-disk directories and rejects orphan references.
- **No runtime INDEX generator.** An earlier draft had a `skill-index-generator.ts` render the manifest on every prompt; we simplified — the manual table in worker-base is the single source of truth.
- **Vendor branch** in `src/agentic/intelligence/prompt-builder.ts`: Claude keeps full-body injection (SDK lazy-loads via the `Skill` tool); Kimi and Codex get worker-base only (which now contains the manual index + the decision table) and `ReadFile` skills on demand.
- **Skill-consultation verifier** at `src/deterministic/verifiers/skill-consultation-verifier.ts` reads a per-contract manifest (`ledgers/{YYYY-MM-DD}/worker-{id}.manifest.json`) and the worker log, and FAILs if a required SKILL.md path was not accompanied by a vendor-appropriate Read-tool call (`ReadFile` for Kimi, `read_file` for Codex). Claude short-circuits to PASS.
- **Ledger telemetry**: `WORKER_SKILL_LOADED` emitted from prompt-builder per required skill; `WORKER_SKILL_CONSULTED` emitted from verifier per skill whose Read was detected.
- **Worker-base cleanup**: UI Libraries section (v2.4 I4) moved to `web-testing/SKILL.md`. Worker-base now carries the Worker Skill Index + decision table + Skill Consultation directive — 215 lines, under the 260-line ceiling enforced by the i5 test.
- **Adobe EDS skills imported**: `eds-content-driven-development/` and `eds-building-blocks/` adapted from `@adobe/skills` (Apache-2.0). Adaptations: aligned commits to `jack-git-commit`, routed test step through our `web-testing` skill, removed Cursor-specific attribution, trimmed references to Adobe-internal sister skills not in our library. Resources (`cdd-philosophy.md`, `html-structure.md`, `js-guidelines.md`, `css-guidelines.md`) imported verbatim. Deterministic detection via `fstab.yaml` / `scripts/aem.js` / `blocks/` markers adds them to the required-skills list on EDS projects.
- **Adhoc tests**: `tests/adhoc/i5-skill-index-generation.adhoc.ts` and `tests/adhoc/i6-skill-consultation-verifier.adhoc.ts` both pass. i5 verifies the manual index in worker-base exactly matches the on-disk skill directories (15 total), has no orphan references, and contains no `when_required` custom frontmatter leakage.

### Design note: reverted `when_required` frontmatter AND the runtime INDEX generator

An earlier draft of v2.4.1 (a) added a custom `when_required` prose field to every SKILL.md, and (b) generated a two-column INDEX manifest at prompt-build time via `src/deterministic/skill-index-generator.ts`. Both reverted. Skills stay in standard Claude-compatible format (`name`, `description`, `user-invocable`, `metadata.category`). The "what skills exist" and "when to consult" logic both live in a single authored table inside `worker-base`. Rationale: (1) maintaining 15 copies of decision prose is worse than one table in one skill; (2) skills stay portable across Claude / Kimi / Codex / Anthropic's Agent Skills spec with no vendor-specific fields; (3) manual curation is simpler to read, debug, and PR-review than runtime templating; (4) removing the generator cut one file and ~70 lines of code from the pipeline.

- **Deferred to live run**: token-reduction measurement, consultation-rate telemetry, no-regression on journey gates / commit format (success criteria 1–4).

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

1. **Generate a worker-skill INDEX** auto-built from each skill's standard `name` + `description` frontmatter. **No custom frontmatter fields** — skills stay compatible with Anthropic's Agent Skills spec.
2. **Slim the always-loaded prompt** down to: worker-base (universal, includes a Skill Consultation decision table) + INDEX manifest. For Kimi and Codex only; Claude keeps full-body injection since its SDK lazy-loads via the `Skill` tool.
3. **Put the "when to consult" decision table in `worker-base`** — one table that maps step kind (UI / backend / gate / EDS / demo / skill-build / research) to the skills a worker should `ReadFile`. Centralized, not per-skill.
4. **Add a verifier** that scans the worker log for vendor-appropriate Read-tool calls (`ReadFile` for Kimi, `read_file` for Codex) against expected `SKILL.md` paths, and FAILs the step if a required skill was skipped. Claude short-circuits to PASS.
5. **Thread required-skills through the contract** — prompt-builder computes the list deterministically (web → web-testing, EDS markers on disk → both EDS skills, `[GATE]` → integration-validator, etc.), writes it to a per-contract manifest, and the verifier reads back.
6. **Telemetry**: emit `WORKER_SKILL_LOADED` (prompt-builder, per required skill) and `WORKER_SKILL_CONSULTED` (verifier, per skill whose Read was detected).
7. **Move web-only content out of worker-base**: the v2.4 I4 "UI Libraries" section moves to `web-testing`.
8. **Import Adobe's EDS skills**: `eds-content-driven-development` + `eds-building-blocks` adapted from `@adobe/skills` (Apache-2.0), with commits routed through `jack-git-commit` and testing through `web-testing`.
9. **Vendor scope**: Kimi (CLI + Wire) and Codex. Claude keeps current behavior.

### Out of Scope

- Building a Kimi-native skill protocol (that's a separate POC — see "Future")
- Changing the SKILL.md frontmatter format (skills stay standard)
- Changing executive skill loading (`.claude/skills/` for the executive process is unchanged)

---

## Approach (as shipped)

### Phase 1 — Standard frontmatter, centralized decision table

Every worker SKILL.md keeps the standard Anthropic Agent Skills frontmatter only (`name`, `description`, `user-invocable`, `metadata.category`, `license` where applicable). An earlier draft added a custom `when_required` field per skill; we reverted it — see "Design note" at the top of this file.

The "when to consult" logic lives in a single decision table inside `worker-base/SKILL.md`:

| Your step does… | Read these |
|---|---|
| UI / page / form / route / component on a web project | `web-testing` + `jack-git-commit` |
| API route / handler / serverless function / DB migration / schema / seed data | `backend-testing` + `jack-git-commit` |
| Fullstack step touching both UI and API | `web-testing` + `backend-testing` + `jack-git-commit` |
| Integration gate step (kind=`integration_gate`, or title prefixed `[GATE]`) | `integration-validator` + `web-testing` + `jack-git-commit` |
| AEM Edge Delivery block / `scripts.js` / `styles.css` edit (project has `fstab.yaml`, `blocks/`, `scripts/aem.js`) | `eds-content-driven-development` + `eds-building-blocks` + `web-testing` + `jack-git-commit` |
| Demo video / screen capture deliverable | `playwright-demo-video` + `jack-git-commit` |
| New SKILL.md authoring (`[SKILL-BUILD]` goal) | `skill-creator` + `jack-git-commit` |
| Pure research / analysis step (no code deltas) | Read only what the handoff references; commit is optional |

### Phase 2 — Manual Worker Skill Index in worker-base

No runtime generator. The authoritative list of skills lives inside `worker-base/SKILL.md` as a manually-maintained Markdown table under `### Worker Skill Index`. One row per skill on disk (path + one-line purpose). When a skill is added, edit the table; when a skill is removed, delete the row. The i5 adhoc test enforces parity with `claude-files-to-output/skills/` so drift is caught at typecheck time.

Example rows (actual content lives in worker-base):

```markdown
| Path | What it covers |
|---|---|
| `.claude/skills/worker-base/SKILL.md` | Universal constitution, workspace rules … (you are already reading it). |
| `.claude/skills/backend-testing/SKILL.md` | Curl-based API smoke testing. Pre-flight health checks, round-trip verification … |
| `.claude/skills/eds-content-driven-development/SKILL.md` | 8-step CDD workflow for any AEM Edge Delivery code change. Start here on EDS projects. |
| … | … |
```

### Phase 3 — Vendor-branched prompt-builder

In `src/agentic/intelligence/prompt-builder.ts`, the single-site skill body injection became:

```ts
if (resolvedVendor === 'claude') {
  // Claude path: full-body injection (unchanged)
  if (webTestingSkill) sections.push(renderSkillBody(webTestingSkill.body, skillVars).trim());
  if (backendTestingSkill) sections.push(renderSkillBody(backendTestingSkill.body, skillVars).trim());
}
// Kimi / Codex path: nothing extra injected. Worker-base already contains the manual index + decision table.
```

The MANDATORY directive paragraph + decision table + manual skill index all live in `worker-base/SKILL.md`, so they ship with every prompt regardless of vendor (Claude sees the index as informational + uses the SDK Skill tool; Kimi/Codex follow the ReadFile path).

### Phase 4 — Move v2.4 I4 UI Libraries out of worker-base

The "UI Libraries (MANDATORY for web projects)" section moved from `worker-base/SKILL.md:91-110` to `web-testing/SKILL.md` (bottom). Sanity check on the manifest model — worker-base should only contain universal guidance.

### Phase 5 — Skill-consultation verifier

New `src/deterministic/verifiers/skill-consultation-verifier.ts`. Inputs: `contract_id`. Loads the per-contract manifest (`ledgers/{YYYY-MM-DD}/worker-{id}.manifest.json`) and the worker log (`worker-{id}.log`). For each name in `required_skills`, checks that the log contains a vendor-appropriate Read token (`ReadFile` / `read_file`) alongside the skill's `.claude/skills/<dir>/SKILL.md` path. Any miss → FAIL with the missing list in `evidence.missing`.

Registered in `src/deterministic/verifiers/index.ts` and called from `runAllVerifiers` via the new optional `extras.contract_id` param. Contract id threads from `worker-spawner.ts` (now sets `WorkerResult.contract_id`) through `validation-handler.ts`. The verifier is advisory by default, consistent with existing validator policy.

### Phase 6 — Telemetry

`src/deterministic/state-handler.ts` gained three helpers:

- `emitWorkLedgerEvent(event, payload)` — appends `{event, ts, ...payload}` to `ledgers/work-ledger.jsonl`
- `writeContractSkillManifest(id, {required_skills, vendor})` — writes the per-contract manifest
- `readContractSkillManifest(id)` — reads it back, locates the worker log path alongside

Prompt-builder emits `WORKER_SKILL_LOADED` per required skill at build time. Verifier emits `WORKER_SKILL_CONSULTED` per skill whose Read was detected. Adoption rate per skill = `grep WORKER_SKILL_CONSULTED | wc -l` over `grep WORKER_SKILL_LOADED | wc -l`.

### Phase 7 — Adobe EDS skill import

`eds-content-driven-development/` and `eds-building-blocks/` imported from `@adobe/skills` plugin `aem/edge-delivery-services/` (Apache-2.0). Resource `.md` files imported verbatim. SKILL.md bodies adapted: commits routed through `jack-git-commit`, testing routed through `web-testing`, Cursor-specific attribution removed, references to Adobe-internal sister skills not in our library softened. New `detectEdsProjectMarkers(projectPath)` in prompt-builder adds both EDS skills to `required_skills` when `fstab.yaml` / `scripts/aem.js` / `blocks/` / `head.html` / `paths.json` is present.

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

## Files Affected (as shipped)

| File | Change |
|---|---|
| `src/agentic/intelligence/prompt-builder.ts` | Vendor branch at skill-injection site: Claude keeps full-body, Kimi/Codex get worker-base only (which has the manual index). Added required-skills computation + `detectEdsProjectMarkers` + inlined `skillDirectoryName` helper. Threads `required_skills` onto the contract and emits `WORKER_SKILL_LOADED` |
| `src/deterministic/skill-index-generator.ts` | (Briefly existed, then DELETED.) The runtime INDEX generator was dropped in favour of the manually-authored Worker Skill Index inside `worker-base`. |
| `src/deterministic/verifiers/skill-consultation-verifier.ts` | NEW — verifier reads per-contract manifest + worker log, FAILs on missing Read-tool call against required SKILL.md paths. Short-circuits to PASS for Claude |
| `src/deterministic/verifiers/index.ts` | Registers the new verifier |
| `src/deterministic/verifiers/core-verifiers.ts` | `runAllVerifiers` gained optional `extras.contract_id` to wire the new verifier |
| `src/deterministic/state-handler.ts` | New helpers: `emitWorkLedgerEvent`, `writeContractSkillManifest`, `readContractSkillManifest` |
| `src/deterministic/validation-handler.ts` | Threads `result.contract_id` into `runAllVerifiers` |
| `src/deterministic/skill-loader.ts` | Unchanged loader logic — skills are plain `SkillDefinition` (no extra fields) |
| `src/deterministic/library-loader-types.ts` | Unchanged `SkillDefinition` shape — stayed standard after the revert |
| `src/agentic/execution/worker-spawner.ts` | `WorkerResult.contract_id` populated on both success and failure exits |
| `src/core/types.ts` | `WorkerResult.contract_id?: string` added |
| `claude-files-to-output/skills/worker-base/SKILL.md` | UI Libraries section removed; "MANDATORY: Skill Consultation Before Code" directive, manual Worker Skill Index (one row per on-disk skill), and "Which skill applies to which step" decision table added. 215 lines |
| `claude-files-to-output/skills/web-testing/SKILL.md` | Receives the moved UI Libraries section |
| `claude-files-to-output/skills/eds-content-driven-development/` | NEW — adapted from Adobe's CDD skill (Apache-2.0) + verbatim resources |
| `claude-files-to-output/skills/eds-building-blocks/` | NEW — adapted from Adobe's building-blocks skill (Apache-2.0) + verbatim resources |
| `tests/adhoc/i5-skill-index-generation.adhoc.ts` | NEW — verifies the **manual** Worker Skill Index in worker-base lists every on-disk skill directory, has no orphan references, carries no `when_required` frontmatter leakage, and keeps worker-base ≤ 260 lines |
| `tests/adhoc/i6-skill-consultation-verifier.adhoc.ts` | NEW — 7 cases: Kimi PASS, Kimi missing-skill FAIL, Codex `read_file`, Claude short-circuit, no-manifest skip, missing-log FAIL, path-without-read-token FAIL |
| `tests/adhoc/v2-prompt-builder.adhoc.ts` | Two assertions tightened to reflect v2.4.1 reality (Kimi preamble marker instead of "no ReadFile token", web-testing body instead of "no playwright-cli text") |

---

## Open Questions (resolved)

1. **Should Claude path also switch to INDEX?** **No (v2.4.1).** Claude SDK lazy-loads via the `Skill` tool; the wastefulness is real but the current path is well-tested. Revisit in v2.5 once Kimi telemetry confirms the manifest model is stable.
2. **Should skills declare their own "when required" in frontmatter?** **No.** An earlier draft did; we reverted. Skills stay portable across Claude / Kimi / Codex / Anthropic's Agent Skills spec. The single decision table in `worker-base` is the source of truth, easier to update once than 15 times.
3. **Should INDEX include the playbook-matched skills, or only the always-eligible ones?** Include all. The worker-base decision table tells the worker which to actually read. Playbook matching is a separate signal.
4. **How strict should the verifier be?** Fails advisory (per `validateWorkDetailed`'s existing "worker success is primary" policy). Verifier emits FAIL evidence into the validation summary; does not block a worker that succeeded. v2.5 may escalate to blocking once the consultation rate is proven stable.
5. **Token budget for the directive paragraph** — the "MANDATORY: Skill Consultation" directive in worker-base is ~14 lines (directive + 8-row table). Measured impact on first-MSG length will land in `retro-2.4.1.md` after the live run.

---

## Future (v2.4.2 or v2.5)

- **Kimi-native skill protocol POC** — investigate whether Kimi K 2.5 CLI has any AGENTS.md-style auto-loaded context mechanism. If yes, the INDEX could be moved to that file and removed from the prompt entirely. Tracked separately because it requires Kimi CLI source-spelunking and may not exist.
- **Custom `load_skill` shell helper** — instead of `ReadFile <path>`, a `load_skill <name>` helper script in PATH that workers call. Prettier syntax, same outcome. Defer until v2.4.1 telemetry shows skill consultation working.
- **Per-vendor INDEX variants** — Codex may benefit from a slightly different directive than Kimi. Defer until comparative data exists.

---

## References

- [`outcome-2.4.1.md`](outcome-2.4.1.md) — what actually shipped + live-run runbook
- `src/agentic/intelligence/prompt-builder.ts:44` — `WORKER_SKILLS_ROOT` definition
- `src/agentic/intelligence/prompt-builder.ts:220` — `loadSkillLibrary` call
- `src/agentic/intelligence/prompt-builder.ts:385-471` — vendor-branched skill injection + required-skills collection (replaces the v2.4 always-full-body injection at lines 377-393). `skillDirectoryName` is inlined here.
- `src/deterministic/verifiers/skill-consultation-verifier.ts` — verifier
- `src/agentic/intelligence/vendor-adapter.ts:12-25` — vendor tool name mappings (authoritative source for which Read token to scan per vendor)
- `.claude/rules/skills-and-prompts.md` — Two-CWD skill model documentation
- Recipe Book run evidence: `ledgers/2026-04-19/worker-contract-1776562209827.log`, `worker-contract-1776562720472.log`, `worker-contract-1776563608519.log` — direct proof Kimi reads SKILL.md on demand when referenced in prompt
- Upstream Adobe skills: [`adobe/skills` plugins/aem/edge-delivery-services](https://github.com/adobe/skills/tree/main/plugins/aem/edge-delivery-services) (Apache-2.0)
