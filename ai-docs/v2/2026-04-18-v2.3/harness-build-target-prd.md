# PRD: Unified Build Target Model

## Document Status
Draft — v2.3 planning

**Part of:** [`goal.md`](goal.md) — This PRD covers Phase 1 (Unified Build Targets) of the v2.3 release. See `goal.md` for the full v2.3 scope including Phase 2 (Capability Hardening) and Phase 3 (Retro Carry-Forward).

## Owner
Jack Jin

## Summary

Today the harness system and the 24x7 executive agent write output to different places (`harness-v2-test/` vs `ai-sandbox/`) with different isolation models. This PRD defines a unified build-target selection layer so both execution paths — harness multi-agent pipelines and executive-loop worker spawns — share the same three options for where work lands:

1. **Git Worktree** (new default) — isolated branch + worktree off a new `ai-sandbox` repo
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

Create an isolated branch + worktree off the `ai-sandbox` repository.

**How it works:**
- `ai-sandbox` is a manually-created repo with two long-lived branches:
  - **`base`** — minimal init commit (Apache 2.0 license, baseline `.gitignore`). All worktrees branch from here.
  - **`main`** — where finished demos get merged in. This is the public-facing branch with completed work.
- Each new project gets `git worktree add` off the `base` branch, on a new `proj/<slug>` branch
- The worktree directory becomes the worker's `output_path` / harness's `targetDir`
- Local state (`.env`, caches, `node_modules`, build artifacts) stays in the worktree and is gitignored
- Switching projects = switching worktrees, not branches in a shared checkout

**Directory structure (decided):**
```
~/dev/ai-sandbox/                       ← actual repo checkout (main branch — merged demos)
~/dev/ai-sandbox-worktrees/             ← all worktrees live here; branch namespace mirrors folder structure
  ├── proj/                             ← worktrees for `proj/*` branches (new project work)
  │   ├── player-mcp/                   ← branch: proj/player-mcp (forked from base)
  │   ├── supabase-migration/           ← branch: proj/supabase-migration (forked from base)
  │   └── portfolio-refresh/            ← branch: proj/portfolio-refresh (forked from base)
  ├── monorepo/                         ← worktrees for `monorepo/*` branches (legacy / archive)
  │   └── legacy-v2.2/                  ← branch: monorepo/legacy-v2.2 (preserves pre-rebaseline history)
  └── ...                               ← future namespaces (e.g. `release/`, `experiment/`) follow the same rule
```

**Tiered-namespace convention:** Worktree paths mirror branch names exactly. A branch named `<namespace>/<slug>` (with a slash) lives at `~/dev/ai-sandbox-worktrees/<namespace>/<slug>/`. A branch with multiple slashes (e.g. `experiment/spike/foo`) nests further. This keeps `git worktree list` output and the filesystem layout in lockstep — no slug munging, no dropped prefixes.

- **Branch naming:** `proj/<slug>` (e.g. `proj/player-mcp`) for new project work; other namespaces (`monorepo/`, `release/`, etc.) follow the same `<namespace>/<slug>` shape
- **Worktree base point:** `base` branch (not `main` — keeps worktrees clean of other projects' code)
- **Worktree path:** `~/dev/ai-sandbox-worktrees/<branch-name>/` (literal branch name — slashes become folder separators)
- **Creation command:** `git -C ~/dev/ai-sandbox worktree add ~/dev/ai-sandbox-worktrees/proj/<slug> -b proj/<slug> base`
- **Promotion:** When a project is ready, merge `proj/<slug>` → `main`. The `base` branch never moves.
- Worktrees share the git object database with the main repo — lightweight, no duplicated history
- The main repo checkout on `main` accumulates finished demos; `base` stays minimal forever

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
- `worker-spawner.ts` project directory setup changes from the legacy flat `<sandbox>/<slug>/` (now preserved on the `monorepo/legacy-v2.2` branch) to `git worktree add` against the `base` branch in the rebaselined `ai-sandbox` repo
- `output_path` in PROMPT.md frontmatter points to the worktree directory
- Retry context preservation still works — `output_path` persists across attempts
- The legacy GitHub Pages CI (`.github/workflows/deploy-pages.yml`) only applied to the legacy flat layout and does NOT apply per-worktree; deployment is per-project from each worktree branch

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

Create a subfolder inside the legacy flat layout — now preserved on the `monorepo/legacy-v2.2` branch of `ai-sandbox`. Typically materialized as its own worktree (e.g. `~/dev/ai-sandbox-worktrees/legacy-v2.2/`) so it doesn't fight with the worktree-default workflow on `base`/`main`.

**How it works:**
- Worktree of `monorepo/legacy-v2.2` at `~/dev/ai-sandbox-worktrees/legacy-v2.2/` holds the historical flat layout (`projects/{react,nextjs,node,misc}/<date>/<slug>/`)
- New monorepo-target goals add subfolders inside that worktree and commit on the `monorepo/legacy-v2.2` branch
- Shared `.gitignore` (the legacy version, not `base`'s), shared CI, shared GitHub Pages deploy (if re-pointed at this branch)
- No local isolation between projects on this branch

**When to use:**
- Quick scratch experiments that don't warrant a fresh `proj/<slug>` worktree
- Backward compatibility with existing goals and in-progress work that referenced the flat layout
- Continuing iteration on a project that already lives in `monorepo/legacy-v2.2`

**PROMPT.md frontmatter:**
```yaml
build_target: monorepo
```

**Implications for existing code:**
- Resolver routes the worker to the `monorepo/legacy-v2.2` worktree path instead of creating a fresh `proj/<slug>` worktree
- Existing goals without `build_target` should fall back to `monorepo` during transition, then to `worktree` once the new flow is validated

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
build_target: worktree             # worktree | existing | monorepo (default: worktree)
target_dir:                        # required for 'existing', ignored otherwise
target_branch:                     # optional — auto-generated for worktree, current branch for monorepo/existing

# Execution
execution_pattern: harness         # plan-then-execute | harness | plan-mode | etc.
harness: generic                   # which harness (when execution_pattern=harness)

# Worker vendor & model
worker_vendor: claude              # claude | codex | kimi (default: claude)
worker_model:                      # model override (default: vendor's default model)

# Existing fields
tags: []
output_path:                       # set by system on first execution
source_project:                    # slug of source project to copy from
branch:                            # set for self-enhancement tasks
---
```

**Defaults:** If a field is omitted, the system uses its default. Defaults are documented in one place (likely `src/deterministic/prompt-md-parser.ts` or a shared `defaults.ts`). Harness CLI flags become overrides for testing, not the primary config path.

**Executive is not configurable.** Planning, breakdown, diagnosis, validation — all executive-tier work is always Claude. This is not an input packet field. Only the worker execution is vendor/model-selectable.

**Phased delivery:**
- v2.3: Add `build_target` + `target_dir` + `target_branch` to PROMPT.md parser. Wire into worker-spawner and harness-executor.
- Post-v2.3: Migrate vendor/model config from CLI flags + env vars into PROMPT.md. Unify harness and executive input parsing fully.

### Frontmatter field → code path reference

Every frontmatter field must map to deterministic code that reads it. If a field doesn't trigger code, it shouldn't be in the frontmatter. This table is the authoritative reference for what each field does and where.

#### Core fields (required)

| Field | Values | Default | Parsed in | Used by | What it triggers |
|---|---|---|---|---|---|
| `title` | string | `"Untitled"` | `prompt-md-parser.ts` | `goal-scanner.ts:275` | `[SELF-ENHANCE]`/`[SKILL-BUILD]` prefix → routes worker to agent codebase instead of output repo |
| `slug` | string (URL-safe) | `"untitled"` | `prompt-md-parser.ts` | `goal-scanner.ts:320` | Directory name, cross-references, worktree branch name (`proj/<slug>`) |
| `priority` | `P0`\|`P1`\|`P2`\|`P3`\|`P4` | `P4` | `prompt-md-parser.ts` | `goal-scanner.ts:41,171` | Work selection order; auto-promotion from `ondeck/` to `in-progress/P{n}/` |
| `status` | `pending`\|`in_progress`\|`blocked`\|`complete` | `pending` | `prompt-md-parser.ts` | `goal-scanner.ts:280` | Controls whether goal is eligible for execution; `blocked` keeps it in-place |

#### Build target fields (v2.3 — this PRD)

| Field | Values | Default | Parsed in | Used by | What it triggers |
|---|---|---|---|---|---|
| `build_target` | `worktree`\|`existing`\|`monorepo` | `worktree` | `prompt-md-parser.ts` | `worker-spawner.ts`, `harness-executor.ts` | Determines output directory creation strategy (worktree add / validate existing / monorepo subfolder) |
| `target_dir` | absolute path | _(none)_ | `prompt-md-parser.ts` | `worker-spawner.ts`, `harness-executor.ts` | Required for `existing`. Worker uses this as project root, skips scaffold. |
| `target_branch` | string | auto-generated | `prompt-md-parser.ts` | `worker-spawner.ts` | For `worktree`: overrides auto `proj/<slug>`. For `existing`/`monorepo`: creates a branch if set, otherwise uses current. |

#### Execution fields

| Field | Values | Default | Parsed in | Used by | What it triggers |
|---|---|---|---|---|---|
| `execution_pattern` | `plan-then-execute`\|`harness`\|`loop-until-progress`\|`plan-mode`\|`deterministic-pipeline` | `plan-then-execute` | `prompt-md-parser.ts` | `execution-pattern-resolver.ts`, `executive-loop.ts:~413` | `harness` → delegates to `HarnessOrchestrator` via `harness-executor.ts`. Others → worker-spawner with different tool/prompt strategies. |
| `harness` | `generic`\|`eds`\|`study` | _(none)_ | `goal-scanner.ts:338` | `harness-executor.ts:70` | Which registered harness to run (only when `execution_pattern: harness`) |
| `harness_target` | absolute path | _(none)_ | `goal-scanner.ts:339` | `harness-executor.ts` | Override harness target directory (CLI testing). Superseded by `target_dir` in v2.3. |
| `harness_mode` | `bootstrap`\|`adopt`\|`extend`\|`extend-deep`\|`resume` | auto-detected | `goal-scanner.ts:341` | `harness-executor.ts:102` | Override harness `detectMode()`. Usually auto-detected from on-disk state. |
| `model_overrides` | `Record<string, string>` | _(none)_ | `goal-scanner.ts:346` | harness `model-defaults.ts` | Per-agent model overrides within a harness pipeline (e.g. `{ "spec": "opus", "build": "sonnet" }`) |
| `worker_vendor` | `claude`\|`codex`\|`kimi`\|`kimi-cli`\|`kimi-wire` | `claude` | `goal-scanner.ts:334` | `worker-spawner.ts`, `vendor-registry.ts` | Selects `AgentWorkerProvider` implementation. Falls back: frontmatter → `WORKER_VENDOR` env → `claude`. |
| `worker_model` | string | vendor default | `prompt-md-parser.ts` | `worker-spawner.ts` | Model override passed to the vendor's provider. Each vendor has its own default. |
| `max_turns` | integer | `200` | `goal-scanner.ts:332` | `worker-spawner.ts` | Max agent turns per step. Set `500` for Playwright/complex. |

#### Optional metadata fields

| Field | Values | Default | Parsed in | Used by | What it triggers |
|---|---|---|---|---|---|
| `complexity` | `low`\|`medium`\|`high` | _(none)_ | `prompt-md-parser.ts` | `goal-breakdown.ts` | Affects auto-breakdown heuristic (threshold: `BREAKDOWN_THRESHOLD_TURNS`, default 100) |
| `created` | ISO 8601 date | _(none)_ | `prompt-md-parser.ts` | _(informational)_ | No code reads this — purely for human tracking |
| `tags` | string[] | `[]` | `prompt-md-parser.ts` | `goal-scanner.ts` | Categorization. No execution logic currently — available for future filtering/routing. |
| `source_project` | slug string | _(none)_ | `goal-scanner.ts:315` | `worker-spawner.ts:654` | Copies an existing completed project as starting point via `project-registry.yml` |

#### System-managed fields (do not set manually)

| Field | Values | Default | Set by | What it triggers |
|---|---|---|---|---|
| `output_path` | absolute path | _(none)_ | `worker-spawner.ts:822` | Persists project directory across retries. Once set, all retries resume in the same directory. |
| `branch` | string | _(none)_ | `worker-spawner.ts` | Git branch for `[SELF-ENHANCE]`/`[SKILL-BUILD]` goals. Worker updates PROMPT.md with this. |

#### UI/Web goal fields (optional — only for goals with a user-facing UI)

These are functional and wired to real code, but only relevant for UI goals with data backends. Omit them for CLI tools, backend services, or non-UI work.

| Field | Values | Default | Parsed in | Used by | What it triggers |
|---|---|---|---|---|---|
| `definition_of_done_journey` | string (literal user flow) | _(none)_ | `goal-scanner.ts:350` | `integration-validator-runner.ts:67`, `prompt-builder.ts:282` | Phase 5b integration validator asserts against this. Injected verbatim into every worker prompt so each step knows the flow it contributes to. |
| `data_requirements` | string (persistence layer spec) | _(none)_ | `goal-scanner.ts:353` | `goal-breakdown.ts:327,336` | Breakdown Pass A prepends a locked `[PREREQUISITE]` step (schema + seed + API smoke). Also injected into validator context. |
| `integration_gate_cadence` | integer | auto (clamped 3–8) | `goal-scanner.ts:356` | `goal-breakdown.ts:391` | Overrides automatic `[GATE]` checkpoint spacing in Breakdown Pass B. Lower = more frequent journey gates. |

---

## Migration Plan

### Phase 1: Add build_target to PROMPT.md (v2.3)

1. ~~Jack manually creates `ai-sandbox` repo with Apache 2.0 license, baseline `.gitignore`, README~~ **DONE 2026-04-17.** Existing `ai-sandbox` repo rebaselined: `base` branch holds the clean init commit (Apache 2.0 + minimal `.gitignore`, backdated to 2026-03-28), `main` is reset to `base` for showcase use, and the entire previous flat layout is preserved on `monorepo/legacy-v2.2` (original SHAs and timestamps intact).
2. ~~Add `build_target` field to `prompt-md-parser.ts` (default: `monorepo` during transition)~~ **DONE.** Field parsed in `prompt-md-parser.ts`; `BuildTarget` type lives in `core/types.ts`; `coerceBuildTarget`/`decideBuildTarget` in `build-target-resolver.ts`.
3. ~~Add worktree creation logic to worker-spawner (or a shared `build-target-resolver.ts`)~~ **DONE.** Logic centralized in `src/deterministic/build-target-resolver.ts`; worker-spawner and harness-executor both call `resolveBuildTarget()`.
4. ~~Add `existing` target support — validate `target_dir`, skip scaffold~~ **DONE.** Resolver throws on missing/non-dir `target_dir`; worker-spawner skips scaffold and source-project copy when `resolution.build_target === 'existing'`.
5. ~~Harness `HarnessRunConfig.targetDir` reads from PROMPT.md `target_dir` / worktree path instead of CLI `--target`~~ **DONE.** `harness-executor.resolveHarnessTarget()` reads frontmatter via the resolver; CLI `--target` is now an optional override (PROMPT.md primary).
6. ~~Flip default from `monorepo` to `worktree` once validated~~ **DONE 2026-04-17.** `getDefaultBuildTarget()` returns `'worktree'`. Override via `BUILD_TARGET_DEFAULT` env if a deployment needs the legacy default.

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

- Auto-creating or rebaselining the `ai-sandbox` repo (Jack did this manually on 2026-04-17)
- Replacing the two-repo split for agent infra (`continuous-agent/` stays separate)
- Changing `[SELF-ENHANCE]` / `[SKILL-BUILD]` routing (still targets agent codebase)
- Fully automating worktree-to-standalone-repo promotion in v2.3
- CI/CD pipeline per worktree (future)

---

## Decisions Made

1. **Worktree directory structure:** Option A — dedicated parent directory. Main repo at `~/dev/ai-sandbox/`, all worktrees at `~/dev/ai-sandbox-worktrees/<branch-name>/`. **Branch namespace mirrors folder structure** — a branch named `<namespace>/<slug>` (e.g. `proj/player-mcp`, `monorepo/legacy-v2.2`) maps to `~/dev/ai-sandbox-worktrees/<namespace>/<slug>/`. No slug munging, no dropped prefixes — `git worktree list` and the filesystem layout stay in lockstep. Default branch convention for new work: `proj/<slug>`, forked from `base`. Finished demos merge to `main`. The `base` branch is frozen at the init commit (LICENSE + `.gitignore`) and never moves.

2. **`.gitignore` template:** Maintain a baseline template in `continuous-agent/workspace-instructions/gitignore-template`. The agent copies this into new worktrees. The `ai-sandbox` repo's own `.gitignore` covers the init commit, but the template in `continuous-agent/` is the authoritative source for updates.

3. **Branch strategy by target type:**
   - **worktree:** If `target_branch` is not provided, auto-generate as `proj/<slug>` where slug is derived from the goal (e.g. `proj/2026-04-12-nextjs-dashboard`). Always a new branch off init commit.
   - **monorepo:** Commit on the current branch. No branch creation.
   - **existing:** Commit on the current branch of the target repo. No branch creation. If the user wants a branch, they specify `target_branch` explicitly.

4. **Migration from the flat `ai-sandbox/` layout:** Done in-place on 2026-04-17 by rebaselining the existing `ai-sandbox` repo. The flat layout (`projects/{react,nextjs,node,misc}/<date>/<slug>/`) is preserved on the `monorepo/legacy-v2.2` branch with original SHAs and timestamps intact. `base` and `main` are clean orphan branches; `monorepo/legacy-v2.2` is a parallel ancestry (does NOT descend from `base`). The `pre-rebaseline-backup` tag pins the pre-surgery tip as a safety net. New work goes on `proj/<slug>` worktrees off `base`. If individual legacy projects are worth continuing, they can be manually checked out from `monorepo/legacy-v2.2`.

5. **Model configuration scope:**
   - **Executive agent:** Always Claude. No vendor/model override — hardcoded, not configurable.
   - **Workers:** Configurable via PROMPT.md frontmatter. Two fields:
     - `worker_vendor` — which vendor to use (`claude`, `codex`, `kimi`). Defaults to `claude`.
     - `worker_model` — which model from that vendor. Defaults to the vendor's default model.
   - **No per-role splits** (planner/validator/worker) in v2.3. The executive handles planning and validation itself (always Claude). Workers get one vendor + one model.
   - Vendor-specific model defaults and instruction tuning must work correctly for each supported model (carried from v2.0 requirement). The vendor adapter (`vendor-adapter.ts`) and model defaults per harness (`model-defaults.ts`) must be validated per vendor.

## Open Questions

1. For harness multi-agent pipelines (e.g. generic has WHY/WHAT/HOW/WHEN + RESEARCH + BUILD + VALIDATE agents), should each agent within the harness be individually configurable, or does the whole harness use the single `worker_vendor`/`worker_model`? Currently `model-defaults.ts` per harness assigns models per agent role — that's a harness-internal decision, not an input packet field. Is that the right boundary?
