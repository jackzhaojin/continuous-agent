# V2.0 Prompt Pack (Phase-by-Phase Handoff)

**Date:** 2026-03-29  
**Purpose:** Copy/paste-ready prompts for running each V2.0 phase in separate threads while preserving consistent execution standards.

---

## Shared Base Prompt (Use for Every Phase)

```md
You are working in the `continuous-agent` repository.

V2.0 context:
- We are implementing V2.0 incrementally, one phase at a time.
- Phase 1 (foundation loaders + tests) is already complete.
- Current source-of-truth docs are:
  1) `ai-docs/v1/2026-03-29-v2.0/plan-2.0.md`
  2) `ai-docs/v1/2026-03-29-v2.0/v2.0-prd-updated.md`

Branching + delivery rules:
- Keep changes scoped strictly to the selected phase.
- Keep PR size reviewable; split into sub-PRs if needed.
- Base branch is `develop`.
- Add/update tests for any changed behavior.
- Run required validation commands and report exact results.

Execution requirements:
1) Read both docs and summarize selected phase scope in bullet points.
2) Propose a file-by-file implementation plan.
3) Implement only that phase.
4) Add/update test coverage.
5) Run:
   - `npm run typecheck`
   - `npm run build`
   - phase-specific test commands
6) Commit with clear message.
7) Draft PR title/body with:
   - motivation
   - detailed changes
   - testing evidence
   - known risks and next-phase handoff

Contract correctness:
- If implementation details conflict with the PRD, follow the PRD and call out the discrepancy.
- Invalid schema content must produce deterministic warnings and strict-mode behavior should be explicit.
```

---

## Phase 2 Prompt — Prompt Composition + Execution Pattern Routing

```md
[Use Shared Base Prompt above]

Selected phase: Phase 2 — Prompt Composition + Execution Pattern Routing.

Implement from:
- `plan-2.0.md`: Phase 2 section + dependency order.
- `v2.0-prd-updated.md`: execution_pattern precedence and routing semantics.

Expected outcomes:
- Prompt builder supports V2 composition path behind feature flag.
- Effective execution_pattern precedence is implemented and logged.
- Worker spawner + executive loop route by pattern (`plan-then-execute`, `loop-until-progress`, `plan-mode`, `deterministic-pipeline`).
- Include tests for precedence resolution + pattern routing behavior.

Likely target files:
- `src/agentic/intelligence/prompt-builder.ts`
- `src/agentic/execution/worker-spawner.ts`
- `src/core/executive-loop.ts`
- `src/core/types.ts` (if needed)
- `tests/adhoc/*` and/or `tests/e2e/*`
```

---

## Phase 3 Prompt — Track Record + Capability Surface Migration

```md
[Use Shared Base Prompt above]

Selected phase: Phase 3 — Track Record + Capability Surface Migration.

Implement from:
- `plan-2.0.md`: Phase 3 section.
- `v2.0-prd-updated.md`: skill/playbook lifecycle + confidence/maturity contract.

Expected outcomes:
- Dual updater behavior for skills and playbooks.
- Confidence and maturity updates follow PRD contract.
- Repeated failure signals are captured for review.
- Flattened summary output is generated for queryability.
- Backward compatibility plan is explicit (if temporary legacy path retained).

Likely target files:
- `src/deterministic/skill-updater.ts` (new)
- existing capability updater call sites
- `capabilities/summary.yml` generation path
- test files under `tests/adhoc/*` and/or `tests/e2e/*`
```

---

## Phase 4 Prompt — Agent Identity (Gmail + Slack)

```md
[Use Shared Base Prompt above]

Selected phase: Phase 4 — Agent Identity (Gmail + Slack).

Implement from:
- `plan-2.0.md`: Phase 4 section.
- `v2.0-prd-updated.md`: Phase 0.5 inbox behavior + safe intent handling.

Expected outcomes:
- Phase 0.5 inbox check in executive loop.
- Gmail + Slack clients integrated with kill switches.
- Ambiguous intent handling is clarify-first and safe.
- Identity actions are logged deterministically.

Likely target files:
- `src/identity/gmail-client.ts` (new)
- `src/identity/slack-client.ts` (new)
- `src/core/executive-loop.ts`
- identity-related config and tests
```

---

## Phase 5 Prompt — Dashboard Projection Layer

```md
[Use Shared Base Prompt above]

Selected phase: Phase 5 — Dashboard Projection Layer.

Implement from:
- `plan-2.0.md`: Phase 5 section.
- `v2.0-prd-updated.md`: dashboard schema + read-only constraints.

Expected outcomes:
- Deterministic dashboard writer emits `workspace/dashboard-data.json` atomically.
- Dashboard UI renders required views from projection data.
- Refresh and activity limits follow agreed contract.
- No mutating controls in V2.

Likely target files:
- `src/deterministic/dashboard-writer.ts` (new)
- `dashboard/` app files
- dashboard schema definitions/tests
```

---

## Phase 6 Prompt — Deterministic Pipeline Executor (Harness Absorption)

```md
[Use Shared Base Prompt above]

Selected phase: Phase 6 — Deterministic Pipeline Executor (Harness Absorption).

Implement from:
- `plan-2.0.md`: Phase 6 section.
- `v2.0-prd-updated.md`: deterministic-pipeline semantics and migration notes.

Expected outcomes:
- Pipeline executor parses and runs ordered pipeline steps.
- Step outputs are handed to subsequent steps.
- Retry behavior and failure handling are explicit.
- Legacy harness recipes are ported to `playbooks/pipelines/` with parity checks.

Likely target files:
- `src/harness/pipeline-executor.ts` (new)
- `playbooks/pipelines/*`
- old harness routing/invocation call sites
- parity tests in `tests/e2e/*`
```

---

## Optional “Merge-Gate” Footer (Append to Any Phase Prompt)

```md
Before finalizing:
- Confirm branch is up to date with `develop`.
- Keep this PR phase-scoped (no opportunistic refactors).
- Include a short "Next phase handoff" section in PR body.
```

