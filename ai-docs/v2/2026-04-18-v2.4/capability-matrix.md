# v2.4 Capability Matrix

**Status:** partial — code fixes landed, live integration runs pending PM2 start.

Maps every v2.2 capability claim to concrete evidence. The critical gap v2.4
was chartered to close is the middle row — executive → harness integration
has never been exercised with a real LLM in the live loop.

## v2.2 Claims × Evidence

| v2.2 Claim | v2.2 Evidence | v2.4 Status | v2.4 Evidence |
|---|---|---|---|
| Standalone harness runs (CLI) | All 3 harnesses ran via CLI across 3 vendors with Playwright-headful visual verification; documented in `ai-docs/v2/2026-04-11-v2.2/outcome.md` and `validation-report-kimi-k2.5.md` | **Verified (unchanged)** | Existing evidence carries forward — no regression expected from v2.4's code changes to harness path. |
| Meta-worker integration (executive → harness) | Mock-only: `tests/e2e/harnesses/mock-{generic,eds,study}-orchestrator.e2e.ts`. No real executive-loop run with a live LLM. | **Unverified — bundles authored, live run pending** | Five goal bundles queued in `workspace/ondeck/`: `2026-04-18-harness-generic-hello`, `2026-04-18-harness-generic-fail`, `2026-04-18-harness-eds-hello`, `2026-04-18-worktree-executive-hello`, `2026-04-18-existing-executive-hello`. Evidence will be written to this table after each bundle completes. |
| Multi-vendor (Claude + Codex + Kimi) | Standalone only. Codex tested only on generic; Kimi CLI intermittent; Kimi Wire works. | **Partially verified (unchanged)** | v2.4 A4/A6 added vendor-specific preambles (Kimi doc-adherence cue, Codex HOW-phase cue) but did NOT re-run the multi-vendor matrix. Tracked for v2.5. |
| OSS-prep (docs only) | LICENSE, CONTRIBUTING, README, docs | **Verified (unchanged)** | No publishing pipeline in scope for v2.4. |

## v2.4 Deliverables × Evidence

| Item | Code | Test | Status |
|---|---|---|---|
| H1 — Kimi handoff parser (MSG envelope + YAML) | `src/deterministic/state-handler.ts` → `parseStructuredHandoffFromLog` rewritten to decode `[MSG]` envelopes before searching for YAML fences | `tests/adhoc/h1-kimi-handoff-parser.adhoc.ts` — 18 assertions pass (Claude raw-fence, Kimi envelope-with-string, Claude content-block-array, latest-wins, placeholder rejection, malformed-envelope safe-fail) | Shipped |
| H3 — Gate blocks on regression | `src/agentic/execution/integration-validator-runner.ts` → deterministic `runCheapChecks` now files a defect when `journey_blocks_added` regresses or is missing on a gate step | `tests/adhoc/h3-gate-blocks-on-regression.adhoc.ts` — 11 assertions pass (regression → defect with blocks_parent, missing count → defect, first gate no-op, non-gate no-op) | Shipped |
| H4 — Defect recursion depth cap | `src/deterministic/steps-json-handler.ts` → `insertDefectSubtask` computes ancestor defect depth and escalates to `needs-you.md` at depth > `MAX_DEFECT_RECURSION_DEPTH` (default 2) | `tests/adhoc/h4-defect-recursion-depth.adhoc.ts` — 11 assertions pass (depth-1, depth-2, depth-3 escalation, env override) | Shipped |
| H5 — Re-breakdown preserves completed | `src/agentic/work-selection/goal-breakdown.ts` → `reBreakdownStep` accepts `existingSubSteps` and skips roles already covered by a complete sub-step | `tests/adhoc/h5-rebreakdown-preserves-completed.adhoc.ts` — 14 assertions pass (first breakdown returns 3, second breakdown with research complete returns 2, all-complete returns 0, max-cap enforced) | Shipped |
| H6 — Worker log full output | `src/agentic/execution/worker-spawner.ts` → 500-char slice gated behind opt-in `WORKER_LOG_TRUNCATE_LEN` env | `tests/adhoc/h6-worker-log-untruncated.adhoc.ts` — 5 assertions pass | Shipped |
| I0 — Prompt packet enrichment | `src/agentic/intelligence/prompt-builder.ts` → `buildCurrentSystemStateSection()` injects API surface, last gate count, project markers between prior-step handoff and worker-base | `tests/adhoc/i0-prompt-builder-enrichment.adhoc.ts` — 13 assertions pass | Shipped |
| I1 — backend-testing skill | `claude-files-to-output/skills/backend-testing/SKILL.md` (new) | `tests/adhoc/i1-backend-testing-skill-present.adhoc.ts` — 10 assertions pass | Shipped |
| I2 — Backend-first prerequisite split | `src/agentic/work-selection/goal-breakdown.ts` → `insertPrerequisiteStep` splits schema/seed and API smoke into two hard-locked steps | `tests/adhoc/i2-backend-first-breakdown.adhoc.ts` — 13 assertions pass | Shipped |
| I3 — Journey API verification | `src/agentic/execution/integration-validator-runner.ts` → `extractApiPathsFromJourney` + `journeyDescribesPersistence`; validator prompt updated | `tests/adhoc/i3-journey-api-verification.adhoc.ts` — 11 assertions pass | Shipped |
| I4 — UI library guidance | `claude-files-to-output/skills/worker-base/SKILL.md` → "UI Libraries" subsection with shadcn/Radix/headlessui priority | `tests/adhoc/i4-ui-library-guidance.adhoc.ts` — 9 assertions pass | Shipped |
| A4 — Kimi documentation-adherence cue | `src/agentic/intelligence/vendor-adapter.ts` → `KIMI_DOC_ADHERENCE_PREAMBLE` prepended for all 3 Kimi variants | Covered indirectly by A5 test (adapter integration) and by `tests/adhoc/smoke-test-all-harnesses-with-kimi.adhoc.ts` | Shipped |
| A5 — Ledger-driven Playwright policy | `src/agentic/intelligence/prompt-builder.ts` → `isBackendOnlyStepTitle` gates web-testing skill inclusion | `tests/adhoc/a5-playwright-policy.adhoc.ts` — 14 assertions pass | Shipped |
| A6 — Codex HOW-phase cue | `src/agentic/intelligence/vendor-adapter.ts` → `CODEX_HOW_PHASE_PREAMBLE` prepended for Codex | Covered by adapter integration; live re-run deferred to v2.5 | Shipped |

## A1 / A2 / A3 — Live Run Plan

Five bundles in `workspace/ondeck/` to be picked up by the live executive
loop once PM2 is started on the main worktree with v2.4 code deployed:

1. `2026-04-18-harness-generic-hello` — executive → generic harness happy path
2. `2026-04-18-harness-generic-fail` — failure path (Phase 7 diagnosis + Phase 8 block)
3. `2026-04-18-harness-eds-hello` — executive → eds harness happy path with `.hlxignore` side effects
4. `2026-04-18-worktree-executive-hello` — v2.3 carry-forward P1-6 (worktree build target e2e)
5. `2026-04-18-existing-executive-hello` — v2.3 carry-forward P1-7 (existing build target e2e)

When these complete, fill in the "Meta-worker integration" row above with
links to STEPS.json, `PROGRESS_LOG.md`, and `CONTRACTS.jsonl` under
`workspace/completed/`.

## References

- [`goal.md`](../xxxx-xx-xx-v2.4/goal.md) — v2.4 charter
- [`outcome.md`](outcome.md) — sibling summary of shipped/deferred
- [`../2026-04-11-v2.2/outcome.md`](../2026-04-11-v2.2/outcome.md) — v2.2 claims being validated
- [`../2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.6.md`](../2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.6.md) — H1-H6 / I0-I4 source retro
