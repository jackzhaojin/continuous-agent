# Harness Mode

Harness mode is a v2.2 execution pattern that runs a dedicated multi-agent plan-then-build pipeline (a **harness**) instead of spawning a single coding worker. A harness ships with its own orchestrator, its own phase list, and its own retry logic. The continuous-agent repo hosts three native TypeScript harnesses:

| Harness | What it builds | Pipeline | Vendor parity |
|---|---|---|---|
| `generic` | Rust/Go/Python/Node/web projects from a PROMPT.md | SPEC (WHY → WHAT → HOW → WHEN) → RESEARCH → BUILD → VALIDATE | Claude / Codex / Kimi (structurally) |
| `eds` | Adobe AEM Edge Delivery Services sites; build agent pushes to `jack-da-live-harness-built` | Same 4-agent spec + per-task loop as generic, plus `ensureIgnoreFiles()` | Claude / Codex / Kimi (structurally) |
| `study` | React + ShadCN study apps with TTS, quizzes, podcast content | DECOMPOSE → RESEARCH → SYNTHESIZE → CONTENT → TTS → DEPOSIT → VALIDATE (coordinator on Claude, specialist fallback on Codex/Kimi) | Claude / Codex / Kimi |

> **Status:** P1 through P5 plus partial P7 are landed and on disk. All three harnesses are native TypeScript — the transitional shell-out runner is deleted. Generic + EDS run across Claude/Codex/Kimi through the vendor abstraction. Study now supports all vendors as well: Claude uses the native coordinator Task/Skill flow, while Codex/Kimi use an orchestrator-managed specialist fallback path. `npm run harness:list` prints all three registered harnesses.

You can run a harness two ways: **standalone** (just the harness, no executive loop) or **integrated** (the 24x7 executive picks it up as a goal and drives it through the normal goal → contract → steps lifecycle).

## 1. Standalone Mode — the unified CLI

Use this when you just want the single-shot plan-then-build experience. No PM2, no goal bundles, no queue.

```bash
npm run harness -- --name <generic|eds|study> --prompt <path/to/PROMPT.md> [flags]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--name <harness>` | yes | Which harness to run. `npm run harness:list` prints registered harnesses. |
| `--prompt <path>` | yes | Path to the `PROMPT.md` file that defines the work. Relative paths resolve against CWD. |
| `--target <dir>` | no | Target working directory. If omitted, derived from the prompt path (dir-of-prompt, or two levels up if inside `ai-docs/SPEC/`). |
| `--vendor <name>` | no | `claude` \| `codex` \| `kimi` \| `kimi-cli` \| `kimi-wire`. Defaults to `$WORKER_VENDOR` or `claude`. |
| `--mode <mode>` | no | `auto` (default) \| `bootstrap` \| `adopt` \| `extend` \| `extend-deep` \| `resume`. Overrides the harness's own mode detection. |
| `--max-turns <n>` | no | Max turns per internal agent call. |
| `--list` | — | Print registered harnesses and exit. |
| `--help` | — | Print usage. |

The CLI auto-loads `.env.worker` then `.env` (dotenv precedence) before resolving the vendor.

### Environment

| Env var | Purpose |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Required for the `claude` vendor (Pro/Max subscription). |
| `WORKER_VENDOR` | Default vendor if `--vendor` is omitted. |
| `MODEL_<AGENT>` | Per-agent model override. Names match internal agent identifiers with `-` → `_`. Examples: `MODEL_SPEC_WHY=claude-opus-4-5`, `MODEL_BUILD=claude-sonnet-4-5`, `MODEL_VALIDATE=claude-sonnet-4-5`. |
| `RUN_LIVE_E2E` | Set to `1` to run `tests/e2e/harnesses/claude-live-generic.e2e.ts` against the real Claude SDK. |

### Examples

**Build a Node app with the generic harness (Claude, auto mode):**
```bash
npm run harness -- --name generic \
  --prompt ./input/my-app/PROMPT.md \
  --target /tmp/my-app
```

**Resume an in-progress run:**
```bash
npm run harness -- --name generic \
  --prompt ./input/my-app/PROMPT.md \
  --target /tmp/my-app \
  --mode resume
```

**Run an EDS build (writes `.gitignore` + `.hlxignore` automatically):**
```bash
npm run harness -- --name eds \
  --prompt ./input/site/PROMPT.md \
  --target /tmp/my-eds-site
```

**Override specific agent models:**
```bash
MODEL_SPEC_WHY=claude-opus-4-5 \
MODEL_BUILD=claude-sonnet-4-5 \
npm run harness -- --name generic --prompt ./input/my-app/PROMPT.md
```

**List registered harnesses:**
```bash
npm run harness:list
# generic
# eds
# study
```

### What the output looks like

Events stream to stdout in real time:

```
[17:31:14] 🚀 run_start generic mode=bootstrap target=/tmp/my-app
[17:31:14] ▶ phase_start SPEC
[17:31:17]   ↪ agent_start spec-why (claude/claude-opus-4-5)
[17:31:58]   ✔ agent_complete spec-why (44012ms)
[17:32:02]   ↪ agent_start spec-what (claude/claude-opus-4-5)
...
[17:40:18] ▶ phase_start RESEARCH
[17:40:22]   ↪ agent_start research (claude/claude-opus-4-5)
[17:41:04]   ✔ agent_complete research (42119ms)
[17:41:04] ✔ phase_complete RESEARCH
[17:41:04] ▶ phase_start BUILD
...
[18:04:22] ✅ run_complete success=true
```

Exit code is `0` on success, `1` on failure. `SIGINT` once triggers a graceful abort; twice forces exit.

## 2. Integrated Mode — executive loop picks up a goal bundle

Use this when you want the 24x7 executive to drive the harness: retry diagnosis, step tracking in `STEPS.json`, Notion reporting, Discord notifications, blocking on `needs-you.md` — the full treatment.

Drop a goal bundle into `workspace/ondeck/` with these frontmatter fields:

```yaml
---
title: "Build the auth service with the generic harness"
slug: "auth-svc-harness"
priority: P2
status: pending
tags: [harness, nodejs]

execution_pattern: harness      # <- the v2.2 pattern
harness: generic                # <- generic | eds | study
harness_target: /tmp/auth-svc   # <- absolute or ai-sandbox-relative
harness_mode: auto              # <- optional; defaults to auto-detect

worker_vendor: claude           # <- claude | codex | kimi | kimi-cli | kimi-wire

model_overrides:                # <- optional per-agent model routing
  spec_why: claude-opus-4-5
  build: claude-sonnet-4-5
---

## Problem
Build a Node.js auth service with JWT and refresh tokens...

## Definition of Done
- [ ] All endpoints return expected status codes
- [ ] Integration tests pass
```

### How it flows

1. Phase 3 picks up the bundle by priority.
2. Phase 4 resolves `execution_pattern: harness` and dispatches to `src/agentic/execution/harness-executor.ts`.
3. The executor:
   - Resolves the harness from `src/harnesses/core/harness-registry.ts`.
   - Resolves the provider via `getAgentWorkerProviderForVendor(workItem.worker_vendor)`.
   - Resolves the target dir: `workItem.harness_target` if set, otherwise `ai-sandbox/harnesses/<name>/<slug>/`.
   - **Pre-seeds `STEPS.json`** with the harness's static phase list (5 rows for generic/eds: SPEC / RESEARCH / BUILD / VALIDATE / COMPLETE; 7 rows for study). Idempotent on resume.
   - Calls the harness's `detectMode()` and runs it as an async generator.
   - Forwards `agent_message` events into the normal worker transcript log — ledgers look identical to a regular worker run, just tagged `execution_pattern: harness`.
   - Routes `phase_start` / `phase_complete` / `subtask_created` / `retry_scheduled` events through a `StepSink` that mirrors them into `STEPS.json`.
4. The returned `WorkerResult` feeds Phase 5 validation, Phase 6 state updates, Phase 7 diagnosis, and Phase 8 blocking exactly like any other worker.

### Invariant: harness retries don't count against the executive

A harness run = **one** worker execution from the executive's perspective. If the harness's internal loop retries a BUILD agent 3 times, that does **not** increment the goal's retry count. Only `run_complete(success=false)` or `run_failed` counts as one failed execution. This matches how you'd want a "meta-worker" to behave: the harness handles its own internal robustness, the executive handles cross-run escalation.

### Target directory rules

- **Standalone mode:** `--target` can be anywhere, absolute or relative. Defaults to dir-of-PROMPT.
- **Integrated mode:**
  - If `harness_target` is absolute, it's used verbatim (this is the documented exception to "workers only write to ai-sandbox").
  - If `harness_target` is relative, it resolves against `ai-sandbox/`.
  - If `harness_target` is omitted, the default is `ai-sandbox/harnesses/<name>/<slug>/`.

### EDS special case: da.live push

The `eds` harness must push generated AEM blocks to `https://github.com/jackzhaojin/jack-da-live-harness-built` as a feature branch in the exact structure Adobe's AEM ingest expects. **This push runs inside the build agent itself** (via the Bash tool invoked from the prompt) — there is no `da-live-pusher.ts` in TypeScript. The harness does take care of `ensureIgnoreFiles()` (`.gitignore` + `.hlxignore`) so the repo is ingest-ready before the build agent runs.

## 3. Phased delivery — actual state

| Phase | Status | What's on disk |
|---|---|---|
| **P1** — CLI skeleton, types, registry | ✅ done | `npm run harness --` works; `harness-registry.ts` exposes all three harnesses |
| **P2** — `'harness'` execution pattern + executive dispatch | ✅ done | Goal bundles with `execution_pattern: harness` route through `harness-executor.ts` |
| **P3** — Port generic harness JS → TS | ✅ done | `src/harnesses/generic/` is native TS and goes through `runHarnessAgent()` |
| **P4** — Port EDS harness | ✅ done | `src/harnesses/eds/` is native TS with `ensureIgnoreFiles()`; da.live push stays in the build agent prompt |
| **P5** — Port study harness | ✅ done | `src/harnesses/study/` is native TS with dual execution paths: native coordinator for Claude + specialist fallback for Codex/Kimi |
| **P6** — Consolidate generic + EDS shared base | ⏸ deferred | Per plan — revisit in v2.3 if maintenance cost bites |
| **P7** — OSS scrubbing | ⚠️ partial | `LICENSE` is Apache-2.0, `NOTICE` + `CONTRIBUTING.md` landed. Still open: hardcoded path scrub, README rewrite, gitleaks sweep, package rename |

The transitional `src/harnesses/shellout-runner.ts` from P1/P2 has been **deleted**. All harnesses run native TypeScript.

## 4. Key files

| File | Role |
|---|---|
| `src/harnesses/core/types.ts` | `HarnessOrchestrator`, `HarnessEvent`, `HarnessRunConfig`, `HarnessState`, `StepSink`, `RunHarnessAgentArgs` |
| `src/harnesses/core/harness-agent-runner.ts` | **Vendor-agnostic chokepoint**. `runHarnessAgent()`, `didAgentPass()`, `extractHandoffJson()`. All harnesses go through here. |
| `src/harnesses/core/harness-registry.ts` | Static `Map<string, HarnessOrchestrator>`; register new harnesses here |
| `src/harnesses/core/harness-event-bus.ts` | Async-iterable fan-out helper |
| `src/harnesses/core/status-mirror.ts` | `seedStepsFromPhases()` + `makeStepSink()` — one-way mirror into `STEPS.json` |
| `src/harnesses/cli.ts` | Unified CLI entry point (`npm run harness --`) |
| `src/harnesses/generic/index.ts` | `GenericHarness implements HarnessOrchestrator` |
| `src/harnesses/generic/orchestrator.ts` | Full bootstrap/adopt/extend/resume loop + 4-agent spec + per-task retries |
| `src/harnesses/eds/index.ts` | `EdsHarness implements HarnessOrchestrator` |
| `src/harnesses/eds/ignore-files.ts` | `ensureIgnoreFiles()` — `.gitignore` + `.hlxignore` writer |
| `src/harnesses/study/index.ts` | `StudyHarness implements HarnessOrchestrator` |
| `src/harnesses/study/orchestrator.ts` | Study pipeline orchestrator (Claude coordinator path + non-Claude specialist fallback path) |
| `src/harnesses/study/agent-loader.ts` | Parses `agents/<name>/AGENT.md` frontmatter |
| `src/harnesses/study/agents/**` | 10 specialist agents + coordinator (copied from study-harness-v1 `.claude/agents/`) |
| `src/harnesses/study/skills/**` | 16 skills (copied from study-harness-v1 `.claude/skills/`) |
| `src/agentic/execution/harness-executor.ts` | Executive-loop bridge for `execution_pattern: harness` |
| `src/core/executive-loop.ts:~413` | Dispatch branch: `if (patternResolution.pattern === 'harness') …` |
| `src/agentic/intelligence/vendor-adapter.ts` | Exports `mapToolNames()`, `KIMI_TOOL_MAP`, `CODEX_TOOL_MAP` |

## 5. Tests

```bash
npm run test:harness          # Unit + mock-provider e2e (no API calls, ~1s total)
npm run test:harness:live     # Gated live Claude run (burns OAuth credits)
```

Layout:

- **Unit** — `tests/adhoc/2026-04-11-harness-v22/`
  - `unit-core.adhoc.ts` — extractHandoffJson, didAgentPass, HarnessEventBus, mapToolNames, registry
  - `unit-state-and-mode.adhoc.ts` — generic+study state round trip, mode detection scenario matrix
  - `unit-loaders-and-config.adhoc.ts` — prompt loaders, study agent-loader, ensureIgnoreFiles, model defaults
- **Mock-provider integration** — `tests/e2e/harnesses/`
  - `mock-generic-orchestrator.e2e.ts` — full bootstrap run + resume. Exercises SPEC → RESEARCH → BUILD → VALIDATE → COMPLETE with canned handoff JSON.
  - `mock-eds-orchestrator.e2e.ts` — same shape + asserts `ensureIgnoreFiles` side effects + idempotency
  - `mock-study-orchestrator.e2e.ts` — coordinator invoked once, 7 phase_starts, target skeleton dirs, COMPLETE pipeline skip
- **Live e2e (gated)** — `tests/e2e/harnesses/claude-live-generic.e2e.ts` (only runs when `RUN_LIVE_E2E=1`)

`tests/adhoc/2026-04-11-harness-v22/run-all.sh` is the runner behind `npm run test:harness`. Current suite: **77 passing, 0 failing**.

## 6. Troubleshooting

**`[harness] unknown harness 'X'. Available: generic, eds, study`**
Only those three are registered. Add one via `src/harnesses/core/harness-registry.ts`.

**`[harness] vendor 'codex' auth invalid`**
Non-Claude vendors go through the vendor registry, which validates authentication at the provider level. `claude` requires `CLAUDE_CODE_OAUTH_TOKEN`. `codex` requires `codex login`. `kimi-cli` / `kimi-wire` require `kimi login`.

**Study harness behavior differs by vendor (`--vendor claude` vs `--vendor codex`/`--vendor kimi-*`)**
Expected — Claude runs the native single-coordinator Task/Skill flow, while Codex/Kimi run the orchestrator-managed specialist fallback (Task/Skill-free). Both are valid end-to-end harness paths.

**`STEPS.json` shows harness phases but no progress**
Check `ledgers/executive-$(date +%Y-%m-%d).log` for `[harness-executor]` lines. If events stop arriving, the harness's `run()` generator is blocked inside a provider.spawn() call — check the worker transcript log.

**`CONSTITUTION.md missing` / `WHY_WHAT.md missing` on first run**
The spec agents are responsible for writing those files. If they run but the files don't appear on disk, either the provider didn't grant `Write` (check `allowedTools`) or the agent's prompt is producing a handoff JSON but skipping the file write. Inspect `ai-docs/SPEC/<mode>_<agent>.md` for the raw agent output.

**Ignore files contain duplicate entries (EDS)**
`ensureIgnoreFiles()` is idempotent (`unit-loaders-and-config.adhoc.ts` covers this). If you see duplicates, something else is appending to `.gitignore` / `.hlxignore` between runs.

**PM2 running stale harness code**
In the **main** worktree: `npm run build` to rebuild + SIGUSR2 the running executive. In a **secondary worktree** (e.g. `continuous-agent-develop`): NEVER run `npm run build` — it signals PM2 which is running main's `dist/`. Use `npm run typecheck`. See the feedback rule at `~/.claude/projects/-Users-jackjin-dev-continuous-agent/memory/feedback_no_build_in_develop_worktree.md`.

## 7. Design rationale & plan

The architecture doc (port vs. wrap, `__spawn__` protocol design, Task/Skill emulation, file-by-file change list, phased delivery order) lives at `~/.claude/plans/shiny-splashing-tide.md`. The goals and binding decisions (D1 — both standalone + meta-worker wrap, D2 — unified CLI, D3 — full vendor parity) are in `ai-docs/v2/2026-04-11-v2.2/goals.md`.

Implementation details for contributors: `.claude/rules/harnesses.md` and `CONTRIBUTING.md` (harness authoring guide).
