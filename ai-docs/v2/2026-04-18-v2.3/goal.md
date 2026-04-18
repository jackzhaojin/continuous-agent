# v2.3 — Unified Build Targets

**Status:** Shipped (this is the v2.3.0 release scope)
**Focus:** Unify where harnesses and the executive agent write output — one build-target model, three options.

> **Scope change on 2026-04-18.** v2.3 was originally scoped as "Unified Build Targets + Hardening Release" across three phases. The hardening (Phase 2) and retro carry-forward (Phase 3) work has been split out into a dedicated v2.4 release — see [`../xxxx-xx-xx-v2.4/goal.md`](../xxxx-xx-xx-v2.4/goal.md). v2.3.0 covers only the build-target model below.

## Why v2.3 Exists

**Fragmented output model.** Harnesses wrote to one place (`harness-v2-test/`), the executive agent wrote to another (`ai-sandbox/`), and there was no way to point either at an existing project. As the system scales to more builds and real repos, a unified build-target layer is the prerequisite for everything that comes next.

v2.3 builds that layer. Hardening rides on top of it in v2.4.

## Build-Target Model

Three options, selected per-goal via PROMPT.md frontmatter:

| Target | Description | When to use |
|---|---|---|
| **worktree** (default) | Git worktree off `ai-sandbox` `base` branch; tiered-namespace path (branch namespace → folder hierarchy) | New projects, incubating work, parallel builds |
| **existing** | Work directly in an external repo/directory | Improving existing projects, migrations |
| **monorepo** (legacy) | Anchored at the `monorepo/legacy-v2.2` worktree (preserves the pre-rebaseline flat layout) | Backward compat, scratch experiments, piling onto the legacy archive |

## Delivery Status

1. ~~**P1-1:** Stand up a new home for sandbox output~~ **DONE 2026-04-17.** Decision changed from standing up a separate `ai-demos` repo to rebaselining the existing `ai-sandbox` in place: `base` (clean init), `main` (showcase), `monorepo/legacy-v2.2` (preserved flat layout). Original SHAs and timestamps intact. Safety net tag: `pre-rebaseline-backup`.
2. ~~**P1-2:** Add `build_target`, `target_dir`, `target_branch` to PROMPT.md frontmatter parser~~ **DONE.** Field parsed in `prompt-md-parser.ts`; `BuildTarget` type in `core/types.ts`.
3. ~~**P1-3:** Implement worktree creation in worker-spawner~~ **DONE.** Centralized in `src/deterministic/build-target-resolver.ts`. Tiered-namespace convention applied: branch `<namespace>/<slug>` → `~/dev/ai-sandbox-worktrees/<namespace>/<slug>/`.
4. ~~**P1-4:** Implement `existing` target~~ **DONE.** Validates `target_dir`, skips project scaffold, respects existing conventions.
5. ~~**P1-5:** Wire harness `targetDir` resolution through PROMPT.md instead of CLI `--target`~~ **DONE.** `harness-executor.resolveHarnessTarget()` uses the resolver; CLI `--target` is an optional override.
6. **P1-6:** Run one harness goal and one executive goal using worktree target end-to-end (manual e2e — **pending**, carried into v2.4 hardening).
7. **P1-7:** Run one executive goal using `existing` target against a real external project (manual e2e — **pending**, carried into v2.4 hardening).
8. ~~**P1-8:** Flip default from `monorepo` to `worktree`~~ **DONE 2026-04-17.** `getDefaultBuildTarget()` returns `'worktree'`. Override via `BUILD_TARGET_DEFAULT` env if a deployment needs the legacy default.

## Success Criteria (v2.3.0)

- Both harness and executive agent can create and write to a worktree off `ai-sandbox` `base` (per-worktree path mirrors branch namespace) — **met**
- An executive goal can target an existing external project via `target_dir` — **met** (manual e2e validation in v2.4)
- Legacy flat-layout path still works for goals with `build_target: monorepo`, anchored at the `monorepo/legacy-v2.2` worktree — **met**
- `output_path` persistence and retry context work correctly for all three targets — **met** (regression tests: `build-target-resolver.adhoc.ts`, `monorepo-legacy-routing.adhoc.ts`, `real-ai-sandbox-integration.adhoc.ts`)

## Env & Path Changes

- `AI_DEMOS_PATH` → `AI_SANDBOX_PATH`; `AI_DEMOS_WORKTREES_PATH` → `AI_SANDBOX_WORKTREES_PATH`
- New `AI_SANDBOX_LEGACY_MONOREPO_PATH` overrides the legacy worktree path (default: `<AI_SANDBOX_WORKTREES_PATH>/monorepo/legacy-v2.2/`)
- `AGENT_OUTPUTS_BASE` redirected to `getLegacyMonorepoWorktreePath()` so centralized `.env`/`.claude`/`CLAUDE.md` setup lands in the legacy worktree

## Non-Goals (for v2.3)

- v2.2 claim verification and hardening — moved to [v2.4](../xxxx-xx-xx-v2.4/goal.md)
- H/I retro carry-forward items — moved to [v2.4](../xxxx-xx-xx-v2.4/goal.md)
- Full unified input packet (vendor/model config in PROMPT.md frontmatter, CLI wrapper) — tracked as post-v2.3 future work in the PRD
- Auto-creating or rebaselining the `ai-sandbox` repo — Jack did this manually on 2026-04-17

## References

- [`harness-build-target-prd.md`](harness-build-target-prd.md) — Build-target PRD (full Phase 1 detail + post-v2.3 "Unified Input Packet" roadmap)
- [`prompt-log-2.3.1-harness-build-target.md`](prompt-log-2.3.1-harness-build-target.md) — Session log for the build-target work
- [`prompt-log-update-sandbox-gh-action.md`](prompt-log-update-sandbox-gh-action.md) — Pages CI rewire for the rebaselined `ai-sandbox`
- [`../xxxx-xx-xx-v2.4/goal.md`](../xxxx-xx-xx-v2.4/goal.md) — Follow-on hardening release
