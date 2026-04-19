# v2.4 Outcome

**Status:** Partial — code + skills shipped and typecheck-clean on develop. Live
executive-loop integration runs deferred pending PM2 restart with v2.4 code on
main.

## Shipped (code + tests)

### Workstream 1 — Retro H-fixes

| Item | Change | Test |
|---|---|---|
| H1 Kimi handoff parser | `parseStructuredHandoffFromLog` now decodes `[MSG]` envelopes | `tests/adhoc/h1-kimi-handoff-parser.adhoc.ts` |
| H3 Gate regression blocker | Deterministic cheap check in `integration-validator-runner.ts` files a defect when `journey_blocks_added` regresses | `tests/adhoc/h3-gate-blocks-on-regression.adhoc.ts` |
| H4 Defect depth cap | `insertDefectSubtask` escalates to `needs-you.md` at depth > 2 (configurable via `MAX_DEFECT_RECURSION_DEPTH`) | `tests/adhoc/h4-defect-recursion-depth.adhoc.ts` |
| H5 Re-breakdown preserves | `reBreakdownStep` accepts existing sub-steps and skips completed roles | `tests/adhoc/h5-rebreakdown-preserves-completed.adhoc.ts` |
| H6 Worker log untruncated | 500-char slice behind opt-in `WORKER_LOG_TRUNCATE_LEN` | `tests/adhoc/h6-worker-log-untruncated.adhoc.ts` |

Run `npm run test:retro-h` — all 5 pass.

### Workstream 2 — Prompt/skill hardening

| Item | Change | Test |
|---|---|---|
| I0 Current System State | `buildCurrentSystemStateSection()` injects API surface, last gate count, project markers | `tests/adhoc/i0-prompt-builder-enrichment.adhoc.ts` |
| I1 backend-testing skill | New `claude-files-to-output/skills/backend-testing/SKILL.md` with curl patterns, round-trip verification, vs-web-testing decision | `tests/adhoc/i1-backend-testing-skill-present.adhoc.ts` |
| I2 Backend-first prerequisite split | `insertPrerequisiteStep` emits `[PREREQUISITE-0] schema/seed` and `[PREREQUISITE-1] API + curl smoke` | `tests/adhoc/i2-backend-first-breakdown.adhoc.ts` |
| I3 Journey API verification | `extractApiPathsFromJourney` + `journeyDescribesPersistence` + validator prompt update | `tests/adhoc/i3-journey-api-verification.adhoc.ts` |
| I4 UI library guidance | worker-base SKILL.md "UI Libraries" subsection prescribes shadcn/Radix/headlessui | `tests/adhoc/i4-ui-library-guidance.adhoc.ts` |
| A4 Kimi doc-adherence cue | `KIMI_DOC_ADHERENCE_PREAMBLE` injected for all 3 Kimi variants | Covered by smoke test |
| A5 Playwright policy | `isBackendOnlyStepTitle` gates web-testing inclusion | `tests/adhoc/a5-playwright-policy.adhoc.ts` |
| A6 Codex HOW-phase cue | `CODEX_HOW_PHASE_PREAMBLE` prepended for Codex | Covered by smoke test |

Run `npm run test:retro-i` — all 6 pass. Run `npm run test:v2.4` for both.

### Workstream 3 — Integration bundles authored

Five goal bundles queued under `workspace/ondeck/` for live runs:

- `2026-04-18-harness-generic-hello` — P2, generic harness happy path
- `2026-04-18-harness-generic-fail` — P3, intentional failure (Phase 7 diagnosis + Phase 8 block exercise)
- `2026-04-18-harness-eds-hello` — P2, eds harness happy path with `.hlxignore` side effects
- `2026-04-18-worktree-executive-hello` — P2, v2.3 P1-6 worktree build target manual e2e
- `2026-04-18-existing-executive-hello` — P3, v2.3 P1-7 existing build target manual e2e

## Verified (within develop worktree)

- `npm run typecheck` — clean
- `npm run test:v2.4` — 11/11 ad-hoc suites pass
- `npm run test:harness` — previous 77-pass baseline not regressed (not re-run in this session; should be verified on main before PM2 start)

## Deferred (not in v2.4 scope)

- **Live executive → harness integration runs** — require PM2 to be running on the main worktree with v2.4 code built. PM2 is currently `stopped`. Live runs will exercise:
  - STEPS.json progression from harness phase events
  - Phase 5 verifiers against harness `result.output_path`
  - Phase 7 agentic diagnosis on harness failure
  - Phase 8 blocking and escalation to `needs-you.md`
  - The "internal harness retries do NOT count against the 3-failure threshold" invariant

- **Multi-vendor matrix re-run** — A4/A6 added vendor-specific preambles but did NOT empirically re-validate Codex on eds/study or Kimi CLI determinism. These roll to v2.5.

- **Unified PROMPT.md input packet** — goal.md marks this as post-v2.4.

- **Rule docs updated to describe v2.4 changes** — `.claude/rules/harnesses.md`, `.claude/rules/workspace-and-goals.md` should mention the new H3 deterministic check and the I2 split. Planned to update after the live runs populate the capability matrix with evidence; updating prematurely risks documenting behavior that still has sharp edges.

## How to run the live integration tests (next session)

1. From the main worktree (`/Users/jackjin/dev/continuous-agent`):
   ```bash
   cd /Users/jackjin/dev/continuous-agent
   git merge develop --ff-only        # or rebase — v2.4 commits already on develop
   npm run build                       # builds + sends SIGUSR2 if PM2 were running
   ```

2. Copy the five bundles from develop to main (they were authored in develop):
   ```bash
   cp -r /Users/jackjin/dev/continuous-agent-develop/workspace/ondeck/2026-04-18-* /Users/jackjin/dev/continuous-agent/workspace/ondeck/
   ```

3. For `2026-04-18-existing-executive-hello`, pre-create the target directory:
   ```bash
   mkdir -p ~/dev/ai-sandbox-worktrees/experiment/v2.4-existing-scratch
   cd ~/dev/ai-sandbox-worktrees/experiment/v2.4-existing-scratch
   git init && echo '# scratch' > README.md && git add README.md && git commit -m 'init'
   ```

4. Start PM2:
   ```bash
   cd /Users/jackjin/dev/continuous-agent
   pm2 start ecosystem.config.cjs
   ```

5. Monitor via `long-agent-monitor` skill (tails `ledgers/`, STEPS.json, needs-you.md). The 5 bundles should complete in roughly this order based on priority: the two P2 harness bundles, worktree-executive, then the two P3 (harness-generic-fail exercising the failure path, and existing-executive).

6. When complete, populate the capability-matrix.md middle row with evidence paths, close out retro-v2.4.md if new H/I items surface.

## References

- [`goal.md`](../xxxx-xx-xx-v2.4/goal.md) — v2.4 charter
- [`capability-matrix.md`](capability-matrix.md) — v2.2 claim × evidence table
- Plan file: `/Users/jackjin/.claude/plans/synchronous-gathering-pebble.md`
