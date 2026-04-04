# V2.3 Goal: Integration Wiring & Polish

## Vision

Close the remaining v2.0 integration gaps. All the pieces are built and tested individually — they just need to be wired into the executive loop.

## Items

### 1. Dashboard Live Integration
**Status:** Writer works, UI works, not called from loop
**What:** Call `writeDashboardData()` from Phase 6/7 of the executive loop after state updates.
**Files:** `src/core/executive-loop.ts`, `src/deterministic/dashboard-writer.ts`
**Effort:** Small

### 2. Pipeline Executor Routing
**Status:** Executor works in isolation, Phase 4 falls back to plan-then-execute
**What:** Wire `deterministic-pipeline` execution pattern to call `pipeline-executor.ts` instead of standard worker spawner. Create sample playbooks in `playbooks/pipelines/`.
**Files:** `src/core/executive-loop.ts`, `src/harness/pipeline-executor.ts`, `src/agentic/execution/worker-spawner.ts`
**Effort:** Medium

### 3. Loop-Until-Progress Wrapper
**Status:** Pattern recognized, uses standard worker (no progress check)
**What:** After each worker session with `loop-until-progress` pattern, check if meaningful progress was made (e.g., new files, commits, test passes). If yes, spawn another iteration. If no, stop.
**Files:** `src/core/executive-loop.ts`, `src/agentic/execution/execution-handler.ts`
**Effort:** Medium (needs design — what counts as "progress"?)

## Priority

Low — these are quality-of-life improvements. The agent runs fine without them using the default `plan-then-execute` pattern.
