# PRD: Unified Build Target Model

## Document Status
Draft — v2.3 planning

**Part of:** [`goal.md`](goal.md) — This PRD covers Phase 1 (Unified Build Targets) of the v2.3 release. See `goal.md` for the full v2.3 scope including Phase 2 (Capability Hardening) and Phase 3 (Retro Carry-Forward).

## Owner
Jack Jin

## Summary

Today the harness system and the 24x7 executive agent write output to different places (`harness-v2-test/` vs `ai-sandbox/`) with different isolation models. This PRD defines a unified build-target selection layer so both execution paths — harness multi-agent pipelines and executive-loop worker spawns — share the same three options for where work lands:

1. **Git Worktree** (new default) — isolated branch + worktree off a new `ai-sandbox-v2` repo
2. **Existing Project** — work directly in an external repo/directory the user already owns
3. **Monorepo Folder** (legacy) — subfolder inside the current `ai-sandbox/` flat structure

The selection is driven by the input packet (PROMPT.md frontmatter), not CLI flags or env vars. This also lays groundwork for unifying the input packet schema between harness and executive execution.

---

## Problem Statement

### Current state

| Execution path | Output destination | Isolation model |
|---|---|---|
| Executive-loop workers | `ai-sandbox/<project>/` on a branch | Shared monorepo, per-project folder |
| Harness CLI (`--target`) | Arbitrary directory (e.g. `harness-v2-test/`) | Fully isolated directory |
| EDS harness | Pushes to `jack-da-live-harness-built` | Template-bound external repo |
| `[SELF-ENHANCE]` / `[SKILL-BUILD]` | `continuous-agent/` on a branch | Agent codebase (unchanged by this PRD) |

Problems:
- Two separate output repos with no shared convention
- Harness target is a CLI param; executive target is hardcoded to `ai-sandbox/`
- No way for the executive agent to work on existing external projects (e.g. improve a repo Jack hasn't touched in a year)
- `ai-sandbox/` accumulates dead project folders with no isolation between them
- No unified input packet — harnesses rely on CLI params and `HarnessRunConfig`, executive relies on PROMPT.md frontmatter + env vars, and the fields don't overlap

### Desired state

Both harnesses and the executive agent read a single PROMPT.md input packet that declares `build_target`. The system resolves this to a concrete directory and hands it to the execution path. Output isolation, branch management, and cleanup are handled uniformly.

---

## Build Target Options

### Option 1: Git Worktree (Default)

Create an isolated branch + worktree off the `ai-sandbox-v2` repository.

**How it works:**
- `ai-sandbox-v2` is a manually-created repo with a minimal init commit: Apache 2.0 license, baseline `.gitignore` for AI-built projects, and a README
- Each new project gets `git worktree add` off that init commit, on a new branch
- The worktree directory becomes the worker's `output_path` / harness's `targetDir`
- Local state (`.env`, caches, `node_modules`, build artifacts) stays in the worktree and is gitignored
- Switching projects = switching worktrees, not branches in a shared checkout

**When to use:**
- New projects (the default for any build that doesn't specify otherwise)
- Exploratory / incubating work
- Parallel builds that need isolated local state
- Any project where contamination between builds is a concern

**PROMPT.md frontmatter:**
```yaml
build_target: worktree          # or omit — worktree is the default
```

**Implications for existing code:**
- `worker-spawner.ts` project directory setup changes from `ai-sandbox/<slug>/` to `git worktree add` in the `ai-sandbox-v2` repo
- `output_path` in PROMPT.md frontmatter points to the worktree directory
- Retry context preservation still works — `output_path` persists across attempts
- GitHub Pages CI (`ai-sandbox/.github/workflows/deploy-pages.yml`) does NOT apply to the new repo; deployment is per-project

---

### Option 2: Existing Project

Work directly in an external repository or directory that already exists.

**How it works:**
- The input packet specifies a local directory path (and optionally a remote repo URL)
- The agent/harness works directly in that directory — no worktree, no monorepo subfolder
- The agent treats whatever's already on disk as the starting point
- Commits go to that project's repo, on a branch

**When to use:**
- Improving or extending an existing project Jack owns
- Migrating a project (e.g. swap local DB for Supabase, swap CosmosDB for something else)
- Maintenance work on repos that haven't been touched in months
- Any work where the destination already exists and has its own git history

**PROMPT.md frontmatter:**
```yaml
build_target: existing
target_dir: /Users/jackjin/dev/my-old-project
# optional:
target_branch: ai/improvements    # branch to work on (default: create from current HEAD)
target_remote: git@github.com:jackzhaojin/my-old-project.git
```

**Implications for existing code:**
- Worker spawner skips project directory creation entirely — just validates `target_dir` exists
- No `.gitignore` injection, no project scaffold — the project already has its own
- The harness `detectMode()` should recognize this as an `adopt` or `extend` scenario
- Workers need to respect the project's existing conventions (package manager, framework, etc.)

---

### Option 3: Monorepo Folder (Legacy)

Create a subfolder inside the current `ai-sandbox/` repository.

**How it works:**
- Same as today's behavior: `ai-sandbox/<project-slug>/` with a branch
- Shared `.gitignore`, shared CI, shared GitHub Pages deploy
- No local isolation between projects

**When to use:**
- Quick scratch experiments that don't warrant their own worktree
- Projects that benefit from the existing `ai-sandbox` GitHub Pages auto-deploy
- Backward compatibility with existing goals and in-progress work

**PROMPT.md frontmatter:**
```yaml
build_target: monorepo
```

**Implications for existing code:**
- This is the current `worker-spawner.ts` behavior — no changes needed
- Existing goals without `build_target` should fall back to `monorepo` during migration, then to `worktree` once `ai-sandbox-v2` is ready

---

## Decision Framework

```
Does the input packet specify build_target?
├── Yes → use it
└── No
    ├── Does target_dir exist in frontmatter? → existing
    └── Otherwise → worktree (default)
```

The agent/harness should NOT choose the target autonomously. It comes from the input packet. The executive agent's work-selector may suggest a target when drafting goals, but the final value is set in PROMPT.md before execution begins.

---

## Unified Input Packet

### Current gap

Harness execution is configured by:
- CLI flags (`--name`, `--target`, `--prompt`, `--vendor`, `--model`)
- `HarnessRunConfig` fields (provider, model overrides, tool lists)
- Some PROMPT.md frontmatter (title, slug)

Executive execution is configured by:
- PROMPT.md frontmatter (priority, status, execution_pattern, worker_vendor, tags)
- Environment variables (`WORKER_VENDOR`, `KIMI_MODE`)
- Hardcoded defaults in `worker-spawner.ts`

These don't overlap. A harness goal dropped into `workspace/ondeck/` has to be translated by `harness-executor.ts`.

### Target state

PROMPT.md becomes the single source of truth for both paths. All execution config lives in frontmatter with well-documented defaults:

```yaml
---
title: "Project Title"
slug: "project-slug"
priority: P2
status: pending
complexity: medium
created: "2026-04-12"

# Build target (this PRD)
build_target: worktree             # worktree | existing | monorepo
target_dir:                        # required for 'existing', ignored otherwise
target_branch:                     # optional override

# Execution
execution_pattern: harness         # plan-then-execute | harness | plan-mode | etc.
harness: generic                   # which harness (when execution_pattern=harness)

# Vendor & model config
worker_vendor: claude              # claude | codex | kimi
worker_model:                      # model override for the primary worker
planner_vendor:                    # vendor for planning/breakdown (defaults to worker_vendor)
planner_model:                     # model for planning/breakdown
validator_vendor:                  # vendor for validation (defaults to worker_vendor)
validator_model:                   # model for validation

# Existing fields
tags: []
output_path:                       # set by system on first execution
source_project:                    # slug of source project to copy from
branch:                            # set for self-enhancement tasks
---
```

**Defaults:** If a field is omitted, the system uses its default. Defaults are documented in one place (likely `src/deterministic/prompt-md-parser.ts` or a shared `defaults.ts`). Harness CLI flags become overrides for testing, not the primary config path.

**Phased delivery:**
- v2.3: Add `build_target` + `target_dir` + `target_branch` to PROMPT.md parser. Wire into worker-spawner and harness-executor.
- Post-v2.3: Migrate vendor/model config from CLI flags + env vars into PROMPT.md. Unify harness and executive input parsing fully.

---

## Migration Plan

### Phase 1: Add build_target to PROMPT.md (v2.3)

1. Jack manually creates `ai-sandbox-v2` repo with Apache 2.0 license, baseline `.gitignore`, README
2. Add `build_target` field to `prompt-md-parser.ts` (default: `monorepo` during transition)
3. Add worktree creation logic to worker-spawner (or a shared `build-target-resolver.ts`)
4. Add `existing` target support — validate `target_dir`, skip scaffold
5. Harness `HarnessRunConfig.targetDir` reads from PROMPT.md `target_dir` / worktree path instead of CLI `--target`
6. Flip default from `monorepo` to `worktree` once validated

### Phase 2: Unified input packet (post-v2.3)

7. Move vendor/model CLI params into PROMPT.md frontmatter
8. Harness CLI becomes a thin wrapper that reads PROMPT.md and calls the orchestrator
9. Document all PROMPT.md fields with defaults in one reference (extend `workspace-instructions/`)
10. Executive and harness share the same PROMPT.md parser

### Phase 3: Worktree lifecycle (future)

11. Worktree state tracking (active, paused, merged, archived)
12. Cleanup automation for stale worktrees
13. Promotion path: worktree branch → standalone repo (manual, with tooling assist)

---

## Key Files Affected

| File | Change |
|---|---|
| `src/deterministic/prompt-md-parser.ts` | Parse `build_target`, `target_dir`, `target_branch` |
| `src/agentic/execution/worker-spawner.ts` | Route project setup by build_target |
| `src/agentic/execution/harness-executor.ts` | Read target from PROMPT.md instead of hardcoded path |
| `src/harnesses/cli.ts` | `--target` becomes optional override (PROMPT.md is primary) |
| `src/harnesses/core/harness-agent-runner.ts` | No change (target dir already injected via config) |
| `src/core/types.ts` | Add `BuildTarget` type, extend `WorkItem` |
| `workspace-instructions/` | Document new frontmatter fields |

---

## Non-Goals

- Auto-creating the `ai-sandbox-v2` repo (Jack does this manually)
- Replacing the two-repo split for agent infra (`continuous-agent/` stays separate)
- Changing `[SELF-ENHANCE]` / `[SKILL-BUILD]` routing (still targets agent codebase)
- Fully automating worktree-to-standalone-repo promotion in v2.3
- CI/CD pipeline per worktree (future)

---

## Open Questions

1. Should `ai-sandbox-v2` baseline `.gitignore` be maintained as a template in `continuous-agent/` (e.g. `workspace-instructions/gitignore-template`) so agents can reference it?
2. For `existing` target: should the agent create a branch automatically, or should `target_branch` be required to prevent accidental commits to main?
3. Worktree naming convention: `ai-sandbox-v2-<slug>` in a sibling directory, or a dedicated parent like `~/dev/worktrees/<slug>`?
4. During migration, should existing in-progress goals in `ai-sandbox/` be left alone or migrated to worktrees?
5. Should the unified PROMPT.md support per-phase model overrides (e.g. use Opus for planning, Sonnet for build) or is per-role (worker/planner/validator) sufficient?
