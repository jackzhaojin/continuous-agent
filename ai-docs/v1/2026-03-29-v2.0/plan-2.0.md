# V2.0 Plan 2.0 (Execution Blueprint)

**Date:** 2026-03-29  
**Scope:** Continuous Executive Agent V2.0 implementation sequencing and delivery checkpoints.  
**Primary PRD:** `ai-docs/v1/2026-03-29-v2.0/v2.0-prd-updated.md`

---

## Objectives

1. Deliver V2.0 in a low-regret sequence that minimizes prompt/execution churn.
2. Preserve V1.2 runtime stability while introducing additive V2.0 components behind controlled rollouts.
3. Create explicit contracts (schemas + precedence rules) before wiring behavior.

---

## Guiding Principles

- **Contracts first, integrations second:** freeze schemas and precedence before implementing loaders/executors.
- **Feature-flag risky paths:** keep legacy prompt composition and capability updates available during migration.
- **Deterministic validation by default:** invalid content should generate deterministic warnings and be skipped (strict mode can hard-fail).
- **Read-only observability surfaces:** dashboard is projection-only in V2.0 (no mutating controls).
- **Identity safety over convenience:** ambiguous inbox intent must never trigger autonomous side effects.

---

## Delivery Sequence

### Phase 1 — Foundation (Schemas + Libraries)

**Goal:** establish stable contracts and validated discovery for skills/playbooks.

- Define schema contracts for:
  - `skills/*/SKILL.md` frontmatter
  - `playbooks/*/SKILL.md` frontmatter
  - `execution_pattern` enum + precedence
  - dashboard JSON envelope
  - track-record update semantics
- Implement deterministic loaders:
  - `src/deterministic/skill-loader.ts`
  - `src/deterministic/playbook-loader.ts`
- Enforce boundary validation:
  - reject/skip playbook-only fields in skills (e.g., `context_requires`, `composes_playbooks`)
- Add deterministic validation output path for auditing and CI/lint adoption.

**Exit criteria:** skills/playbooks are discoverable, typed, and validated with deterministic warnings.

---

### Phase 2 — Prompt Composition + Execution Pattern Routing

**Goal:** move runtime behavior to execution patterns and library-based prompt composition.

- Add feature flag in prompt builder for V1 legacy vs V2 composed path.
- Compose worker prompts deterministically:
  1. objective
  2. constraints
  3. execution-pattern behavior
  4. playbook procedure
  5. skill references
  6. validation criteria
- Add execution pattern precedence:
  - `PROMPT.md` override > playbook default > system default
- Extend `worker-spawner.ts` and `executive-loop.ts` to route:
  - `plan-then-execute`
  - `loop-until-progress`
  - `plan-mode`
  - `deterministic-pipeline`

**Exit criteria:** effective pattern resolution is logged and behaviorally respected end-to-end.

---

### Phase 3 — Track Record + Capability Surface Migration

**Goal:** replace single capability updater with dual library tracking.

- Implement `src/deterministic/skill-updater.ts` for skills + playbooks.
- Apply confidence and maturity transitions per V2.0 contract.
- Add review-needed flags for repeated failures.
- Generate flattened summary output for queryability.

**Exit criteria:** execution updates both skill and playbook records consistently.

---

### Phase 4 — Agent Identity (Gmail + Slack)

**Goal:** add practical async channels safely.

- Add Phase 0.5 inbox check in executive loop.
- Implement conservative Gmail inbox parser and clarify-first behavior.
- Implement Slack notifications for completion/blocking events.
- Add independent kill switches and auth health checks.

**Exit criteria:** identity channels are operational, auditable, and safely bounded.

---

### Phase 5 — Dashboard Projection Layer

**Goal:** provide a live, read-only operations view.

- Implement `src/deterministic/dashboard-writer.ts`.
- Write `workspace/dashboard-data.json` atomically.
- Build `dashboard/` Next.js UI with PRD views.
- Use polling refresh (e.g., 30s) and append-friendly trace rendering.

**Exit criteria:** dashboard reflects runtime state without mutating agent state.

---

### Phase 6 — Deterministic Pipeline Executor (Harness Absorption)

**Goal:** absorb harness mode into unified worker patterns.

- Implement `src/harness/pipeline-executor.ts`.
- Port legacy recipes into `playbooks/pipelines/`.
- Support retries + subtask insertion + step-output chaining.
- Validate parity vs legacy harness outcomes prior to deprecation.

**Exit criteria:** deterministic pipeline pattern covers legacy harness functionality.

---

## Dependency Order (Critical Path)

1. **Schemas/contracts**
2. **Loaders/validation**
3. **Prompt composition + execution routing**
4. **Track-record migration**
5. **Identity + dashboard**
6. **Pipeline executor/harness retirement**

This order minimizes rework and avoids prompt/state incompatibilities.

---

## Rollback & Safety Strategy

- Keep legacy prompt builder path behind flag until V2 parity confidence is established.
- Keep legacy capability updater path available during transition window.
- Use strict-mode validation only in controlled environments initially.
- Treat identity channels as opt-in with default-safe operation.

---

## Validation Checklist (Per Phase)

- `npm run typecheck`
- `npm run build`
- deterministic validation script outputs stable diagnostics
- work ledger entries include new routing context where applicable
- no Constitution boundary regressions

---

## Phase 1 Immediate Work Package (Now)

1. Add plan artifact (`plan-2.0.md`) to preserve implementation context.
2. Implement shared SKILL.md frontmatter parser.
3. Implement `skill-loader.ts` with boundary enforcement and deterministic warnings.
4. Implement `playbook-loader.ts` with typed normalization and deterministic warnings.
5. Run typecheck/build and capture outcomes.

