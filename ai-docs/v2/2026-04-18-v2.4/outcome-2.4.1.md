# v2.4.1 Outcome

**Status:** Shipped on develop, typecheck-clean, both v2.4.1 adhoc tests pass.
Live executive-loop run on Kimi K 2.5 deferred pending `main` merge + PM2 start.
Success criteria 1–4 and 6 depend on that live run.

## Shipped (code + tests)

### Workstream 1 — Progressive skill disclosure

| Item | Change | Test |
|---|---|---|
| Manual Worker Skill Index | New `### Worker Skill Index` subsection inside `worker-base/SKILL.md` — one row per skill on disk, authored by hand. Replaces the short-lived runtime INDEX generator. | `tests/adhoc/i5-skill-index-generation.adhoc.ts` |
| Vendor-branched prompt-builder | `src/agentic/intelligence/prompt-builder.ts:385-471` — Claude keeps full-body injection (SDK `Skill` tool lazy-loads); Kimi/Codex get worker-base only (it has the manual index + decision table + MANDATORY directive) | Covered by `tests/adhoc/v2-prompt-builder.adhoc.ts` (two stale assertions updated) |
| Required-skills computation | Deterministic mapping from step metadata to skill directory names: web → `web-testing`, backend-in-scope → `backend-testing`, every step → `jack-git-commit`, `[GATE]` → `integration-validator`, `[SKILL-BUILD]` → `claude-skill-creator`, EDS markers on disk → `eds-content-driven-development` + `eds-building-blocks`. Threaded into `WorkerContract.required_skills` and persisted to a per-contract manifest | Indirectly via i6 fixtures |
| Skill-consultation verifier | New `src/deterministic/verifiers/skill-consultation-verifier.ts` — reads per-contract manifest (`ledgers/{YYYY-MM-DD}/worker-{id}.manifest.json`) and worker log, FAILs on any required SKILL.md path that lacks a vendor-appropriate Read-tool call (`ReadFile` for Kimi, `read_file` for Codex). Claude short-circuits to PASS | `tests/adhoc/i6-skill-consultation-verifier.adhoc.ts` — 7 cases incl. Kimi PASS, Kimi missing-skill FAIL, Codex `read_file` token, Claude short-circuit, no-manifest skip, missing-log FAIL, path-mention-without-read-token FAIL |
| Verifier wiring | `runAllVerifiers` gained optional `extras.contract_id` param; `validation-handler.ts` threads it through. `WorkerResult.contract_id` populated by `worker-spawner.ts` on both success and failure exits | — |
| Ledger telemetry | `emitWorkLedgerEvent(event, payload)` and `writeContractSkillManifest(id, data)` + `readContractSkillManifest(id)` helpers in `state-handler.ts`. Emits `WORKER_SKILL_LOADED` from prompt-builder per required skill, `WORKER_SKILL_CONSULTED` from verifier per skill whose Read was detected | — |
| Worker-base restructure | UI Libraries section (v2.4 I4) moved out of `worker-base` → `web-testing/SKILL.md`. New "MANDATORY: Skill Consultation Before Code" H2 added with a decision table mapping step kind to required reads (UI / backend / gate / EDS / demo / skill-build / research). worker-base now 191 lines | i5 criterion 5 enforces ≤ 250 line ceiling |

Run `npx tsx tests/adhoc/i5-skill-index-generation.adhoc.ts` and `npx tsx tests/adhoc/i6-skill-consultation-verifier.adhoc.ts` — both green.

### Workstream 2 — Adobe EDS skill import

| Item | Change | Test |
|---|---|---|
| `eds-content-driven-development` | Adapted from `@adobe/skills` plugin `aem/edge-delivery-services/content-driven-development` (Apache-2.0). 8-step CDD workflow (dev server → analyze → content model → test content → implement → lint → validate → ship). Adaptations: commits routed through `jack-git-commit`, Cursor-specific attribution removed, references to Adobe-internal sister skills (analyze-and-plan, content-modeling, find-test-content, testing-blocks, block-collection-and-party) softened since they aren't in our library | Loaded + listed by i5 |
| `eds-building-blocks` | Adapted from `@adobe/skills` plugin `aem/edge-delivery-services/building-blocks` (Apache-2.0). JS decoration patterns, CSS scoping, core-file modification discipline. Step 5 "test implementation" routed through our `web-testing` skill | Loaded + listed by i5 |
| Resources imported verbatim | `resources/cdd-philosophy.md`, `resources/html-structure.md` (CDD); `resources/js-guidelines.md`, `resources/css-guidelines.md` (building-blocks) | — |
| EDS project detection | New `detectEdsProjectMarkers(projectPath)` in prompt-builder checks for `fstab.yaml` / `scripts/aem.js` / `blocks/` / `head.html` / `paths.json`. Any marker adds both EDS skills to the required-skills list | Indirectly — no dedicated adhoc test this round |
| Skill library size | 13 → 15 worker skills | i5 asserts ≥ 15 |

### Design note — reverted `when_required` frontmatter AND the runtime INDEX generator

An earlier draft of v2.4.1 (a) added a custom `when_required` prose field to every SKILL.md and (b) generated a two-column INDEX manifest at prompt-build time via `src/deterministic/skill-index-generator.ts`. **Both reverted.** Skills stay in standard Claude-compatible frontmatter (`name`, `description`, `user-invocable`, `metadata.category` only). The "what skills exist" AND "when to consult" logic both live in a single manually-authored table inside `worker-base/SKILL.md`. Rationale:

1. Maintaining 15 copies of decision prose is worse than one table in one skill.
2. Skills stay portable across Claude / Kimi / Codex / Anthropic's Agent Skills spec — no vendor-specific fields.
3. Manual curation is simpler to read, debug, and PR-review than runtime templating.
4. Removing the generator cut one file (~70 LoC) + one import + one prompt-composition branch.

Net diff after revert: the 12 non-EDS skills I briefly edited went back to their pre-v2.4.1 state (zero SKILL.md changes for them). Meaningful SKILL.md diffs are `worker-base` (MANDATORY directive + Worker Skill Index + decision table added, UI Libraries removed) and `web-testing` (UI Libraries received). `src/deterministic/skill-index-generator.ts` no longer exists.

## Verified (within develop worktree)

- `npm run typecheck` — clean
- `npx tsx tests/adhoc/i5-skill-index-generation.adhoc.ts` — all assertions pass (15 skill dirs, every dir referenced in worker-base, no orphan references, worker-base 215 lines, no `when_required` leakage in any of 5 spot-checked SKILL.md files)
- `npx tsx tests/adhoc/i6-skill-consultation-verifier.adhoc.ts` — all 7 cases pass (Kimi PASS/FAIL, Codex, Claude short-circuit, no-manifest skip, missing-log FAIL, path-without-read-token FAIL)
- `npx tsx tests/adhoc/v2-prompt-builder.adhoc.ts` — 34/36 pass (2 failures pre-existing and not introduced by v2.4.1: uppercase `"Monorepo"` was never in worker-base, and `backend-testing`'s `PRE-FLIGHT CHECK` header was already being injected on non-web Claude steps before v2.4.1)

## Deferred (not in develop-side scope)

Success criteria 1–4 and 6 from `goal-2.4.1.md` require a live Kimi K 2.5 run to measure:

- **Criterion 1 — Token reduction ≥ 30%** on the prompt body for a typical web build step (measured via worker log first-MSG length on Kimi CLI)
- **Criterion 2 — Skill consultation rate ≥ 80%** on required skills (ratio of `WORKER_SKILL_CONSULTED` / `WORKER_SKILL_LOADED` ledger events per skill)
- **Criterion 3 — No journey-quality regression** (same or more gates pass on a Recipe-Book-class goal, same or fewer validator-filed defects)
- **Criterion 4 — No commit-quality regression** (`git log` shows same conventional-commit format adherence, since `jack-git-commit` is now ReadFile'd on demand instead of always-loaded)
- **Criterion 6 — Validator-detectable failure mode** — intentionally run a step that needs `web-testing` without reading it; assert the skill-consultation verifier FAILs the step rather than silently passing

Criterion 5 (worker-base capped ≤ 250 lines) is already enforced by the i5 adhoc test (currently 191 lines).

## How to run the v2.4.1 live verification (next session)

1. Merge v2.4.1 to main:
   ```bash
   cd /Users/jackjin/dev/continuous-agent
   git merge develop --ff-only
   npm run build                       # builds + SIGUSR2 if PM2 is running
   ```

2. Copy or author a goal bundle that exercises Kimi on a web step. The simplest sanity probe reuses one of the v2.4 on-deck bundles but pins the vendor to Kimi:
   ```bash
   cp -r /Users/jackjin/dev/continuous-agent/workspace/ondeck/2026-04-18-worktree-executive-hello /tmp/kimi-v2.4.1-probe
   # Edit /tmp/kimi-v2.4.1-probe/PROMPT.md frontmatter:
   #   worker_vendor: kimi
   #   priority: P2
   mv /tmp/kimi-v2.4.1-probe /Users/jackjin/dev/continuous-agent/workspace/ondeck/kimi-v2.4.1-probe
   ```

3. Start PM2:
   ```bash
   cd /Users/jackjin/dev/continuous-agent
   pm2 start ecosystem.config.cjs
   ```

4. Monitor via the `long-agent-monitor` skill. While the run is in flight, tail the new ledger events:
   ```bash
   grep -E 'WORKER_SKILL_(LOADED|CONSULTED)' ledgers/work-ledger.jsonl | tail -40
   ```

5. After the goal completes (or surfaces a defect), measure each criterion:
   ```bash
   # Token drop — compare first-MSG lengths to a v2.4 baseline
   awk '/\[MSG\]/{print length; exit}' ledgers/$(date +%Y-%m-%d)/worker-contract-*.log
   # Consultation rate per skill
   jq -r 'select(.event=="WORKER_SKILL_LOADED") | .skill_name' ledgers/work-ledger.jsonl | sort | uniq -c
   jq -r 'select(.event=="WORKER_SKILL_CONSULTED") | .skill_name' ledgers/work-ledger.jsonl | sort | uniq -c
   # Verifier failures
   grep skill_consultation ledgers/validation-*.jsonl || echo 'no skill_consultation entries yet'
   ```

6. Populate a `retro-2.4.1.md` next to this file once the run completes. Evidence items to include: first-MSG length before/after, consultation-rate table, any defects filed against the new verifier, any worker who ReadFile'd a wrong skill or missed a required one.

## EDS-specific smoke run (optional, encouraged)

To exercise the two newly imported Adobe EDS skills end-to-end, author a P3 bundle pointed at an EDS project:

```yaml
# workspace/ondeck/2026-04-19-eds-block-hello/PROMPT.md
---
title: "[EDS] Add a hello-card block"
slug: eds-block-hello
priority: P3
status: pending
worker_vendor: kimi
build_target: existing
target_dir: /path/to/an/eds/project   # must contain fstab.yaml or scripts/aem.js
---
Add a `hello-card` block with a title cell and an image cell. Follow CDD.
```

Expected behavior: prompt-builder detects EDS markers, adds `eds-content-driven-development` and `eds-building-blocks` to `required_skills`, Kimi ReadFiles both, the skill-consultation verifier emits `WORKER_SKILL_CONSULTED` for both.

## References

- [`goal-2.4.1.md`](goal-2.4.1.md) — v2.4.1 charter, now annotated with implementation note
- [`outcome.md`](outcome.md) — v2.4 parent outcome (partial, still awaits its own live runs)
- Plan file: `/Users/jackjin/.claude/plans/humming-wandering-engelbart.md`
- Upstream skills: [`adobe/skills` plugins/aem/edge-delivery-services](https://github.com/adobe/skills/tree/main/plugins/aem/edge-delivery-services) (Apache-2.0)
