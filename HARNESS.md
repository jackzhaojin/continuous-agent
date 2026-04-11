# Harness Mode

Harness mode is a v2.2 execution pattern that runs a dedicated multi-agent plan-then-build pipeline (a **harness**) instead of spawning a single coding worker. A harness ships with its own orchestrator, its own phase list, and its own retry logic. The continuous-agent repo hosts three:

| Harness | What it builds | Pipeline |
|---|---|---|
| `generic` | Rust/Go/Python/Node/web projects from a PROMPT.md | SPEC_WHY → SPEC_WHAT → SPEC_HOW → SPEC_WHEN → TASK_RESEARCH → TASK_BUILD → TASK_VALIDATE |
| `eds` | Adobe AEM Edge Delivery Services sites; pushes to `jack-da-live-harness-built` for Adobe dev-ops | same 7-phase spec→task shape as generic |
| `study` | React + ShadCN study apps with TTS, quizzes, podcast content | DECOMPOSE → RESEARCH → SYNTHESIZE → CONTENT → TTS → DEPOSIT → VALIDATE |

> **Status (2026-04-11):** P1 + P2 scaffolding is live. The standalone CLI and executive-loop dispatch are wired up. Under the hood they currently shell out to the original JS harnesses in `jack-dev-server-configs/local/`. Native TypeScript ports with full Codex + Kimi parity land in P3–P5. Only `generic` is registered so far; `eds` and `study` show up in P4 / P5.

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
| `--prompt <path>` | yes | Path to the `PROMPT.md` file that defines the work. Relative paths are resolved from the current working directory. |
| `--target <dir>` | no | Target working directory. If omitted, derived from the prompt path. |
| `--vendor <name>` | no | `claude` \| `codex` \| `kimi` \| `kimi-cli` \| `kimi-wire`. Defaults to `$WORKER_VENDOR` or `claude`. **Note:** non-Claude vendors land in P3+.  |
| `--mode <mode>` | no | `auto` (default) \| `bootstrap` \| `adopt` \| `extend` \| `extend-deep` \| `resume`. Override the harness's own mode detection. |
| `--max-turns <n>` | no | Max turns per internal agent call. |
| `--list` | — | Print registered harnesses and exit. |
| `--help` | — | Print usage. |

### Environment

| Env var | Purpose |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Required for the `claude` vendor (Pro/Max subscription). |
| `WORKER_VENDOR` | Default vendor if `--vendor` is omitted. |
| `MODEL_<AGENT>` | Per-agent model override. Example: `MODEL_SPEC_WHY=claude-opus-4-5 MODEL_BUILD=kimi-k2.5`. The suffix matches the harness's internal agent name. |
| `GENERIC_HARNESS_ROOT` | P1/P2 only: override path to the JS harness tree. Defaults to `~/dev/jack-dev-server-configs/local/generic-harness-v2026-01-v2`. |
| `EDS_HARNESS_ROOT` | Same, for the EDS harness (P4). |
| `STUDY_HARNESS_ROOT` | Same, for the study harness (P5). |

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

**Override specific agent models (P3+):**
```bash
MODEL_SPEC_WHY=claude-opus-4-5 \
MODEL_BUILD=kimi-k2.5 \
npm run harness -- --name generic --prompt ./input/my-app/PROMPT.md
```

**List what's registered:**
```bash
npm run harness:list
```

### What the output looks like

Events stream to stdout in real time:

```
[17:31:14] 🚀 run_start generic mode=bootstrap target=/tmp/my-app
[17:31:14] ▶ phase_start SPEC_WHY
[17:31:17]   ↪ agent_start spec_why (claude/claude-sonnet-4-5)
[17:31:42]     Defining why we need this app...
[17:31:58]   ✔ agent_complete spec_why (44012ms)
[17:31:58] ✔ phase_complete SPEC_WHY
[17:31:58] ▶ phase_start SPEC_WHAT
...
[18:04:22] ✅ run_complete success=true
```

Exit code is `0` on success, `1` on failure.

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

execution_pattern: harness      # <- the new v2.2 pattern
harness: generic                # <- generic | eds | study
harness_target: /tmp/auth-svc   # <- absolute or ai-sandbox-relative
harness_mode: auto              # <- optional; defaults to auto-detect

worker_vendor: claude           # <- optional per-goal vendor override

model_overrides:                # <- optional per-agent model routing
  spec_why: claude-opus-4-5
  build: kimi-k2.5
---

## Problem
Build a Node.js auth service with JWT and refresh tokens...

## Definition of Done
- [ ] All endpoints return expected status codes
- [ ] Integration tests pass
```

### How it flows

1. The executive loop's Phase 3 picks up the bundle by priority.
2. Phase 4 resolves `execution_pattern: harness` and dispatches to `src/agentic/execution/harness-executor.ts`.
3. The executor:
   - Resolves the harness from `src/harnesses/core/harness-registry.ts`.
   - Resolves the provider via `getAgentWorkerProviderForVendor(workItem.worker_vendor)`.
   - Resolves the target dir: `workItem.harness_target` if set, otherwise `ai-sandbox/harnesses/<name>/<slug>/`.
   - **Pre-seeds `STEPS.json`** with the harness's static phase list (7 rows for generic/eds, 7 rows for study). This is idempotent on resume.
   - Calls the harness's mode detector and runs it as an async generator.
   - Forwards `agent_message` events into the normal worker transcript log (ledgers look identical to a regular worker run, just tagged `execution_pattern: harness`).
   - Routes `phase_start` / `phase_complete` / `subtask_created` / `retry_scheduled` events through a `StepSink` that mirrors them into `STEPS.json`.
4. The returned `WorkerResult` feeds Phase 5 validation, Phase 6 state updates, Phase 7 diagnosis, and Phase 8 blocking exactly like any other worker.

### Invariant: harness retries don't count against the executive

A harness run = **one** worker execution from the executive's perspective. If the harness's internal loop retries a BUILD agent 3 times, that does **not** increment the goal's retry count. Only `run_complete(success=false)` or `run_failed` counts as one failed execution. This matches how you'd want a "meta-worker" to behave: the harness handles its own internal robustness, the executive handles cross-run escalation.

### Target directory rules

- **Standalone mode:** `--target` can be anywhere, absolute or relative. Defaults to dir-of-PROMPT.
- **Integrated mode:**
  - If `harness_target` is absolute, it's used verbatim (this is fine — harness mode is the documented exception to "workers only write to ai-sandbox").
  - If `harness_target` is relative, it resolves against `ai-sandbox/`.
  - If `harness_target` is omitted, the default is `ai-sandbox/harnesses/<name>/<slug>/`.

### EDS special case (P4)

The `eds` harness must push generated AEM blocks to `https://github.com/jackzhaojin/jack-da-live-harness-built` as a feature branch in the exact structure Adobe's AEM ingest expects. This push happens inside the build/validate phases regardless of where `harness_target` is. Override the remote via `DA_LIVE_TARGET_REMOTE` if you're forking.

## 3. What's implemented vs. planned

| Phase | Status | What it delivers |
|---|---|---|
| **P1** — CLI skeleton, types, registry, shell-out runner | ✅ done | `npm run harness --` works for `generic` via shell-out to the JS harness |
| **P2** — `'harness'` execution pattern + executive dispatch | ✅ done | Goal bundles with `execution_pattern: harness` run end-to-end through the executive loop |
| **P3** — Port generic harness JS → TS, full vendor parity | ⏳ pending | `WORKER_VENDOR=codex` and `WORKER_VENDOR=kimi-wire` parity, native runner replaces shell-out |
| **P4** — Port EDS harness + `da-live-pusher.ts` | ⏳ pending | `--name eds` registered, Adobe dev-ops push preserved, Playwright via `npx playwright test` for non-Claude |
| **P5** — Port study harness + `Task`/`Skill` emulation | ⏳ pending | `--name study` registered, `__spawn__` JSON protocol emulates SDK `Task` tool uniformly across all vendors |
| **P7** — OSS scrub, Apache-2.0, README rewrite, gitleaks | ⏳ pending | Public-release-ready repo |

P6 (consolidating generic + EDS shared base) is deferred per `ai-docs/v2/2026-04-11-v2.2/goals.md`.

## 4. Key files

| File | Role |
|---|---|
| `src/harnesses/core/types.ts` | `HarnessOrchestrator`, `HarnessEvent`, `HarnessRunConfig`, `HarnessState`, `StepSink`, `RunHarnessAgentArgs` |
| `src/harnesses/core/harness-registry.ts` | Static registry; register new harnesses here |
| `src/harnesses/core/harness-event-bus.ts` | Async-iterable fan-out helper for orchestrators that emit from concurrent paths |
| `src/harnesses/core/status-mirror.ts` | `seedStepsFromPhases()` and `makeStepSink()` — one-way mirror into `STEPS.json` |
| `src/harnesses/cli.ts` | Unified CLI entry point (`npm run harness --`) |
| `src/harnesses/shellout-runner.ts` | **Transitional** (P1/P2 only) subprocess wrapper; deleted at end of P5 |
| `src/harnesses/generic/index.ts` | `GenericHarness implements HarnessOrchestrator` — stub in P1, full port in P3 |
| `src/agentic/execution/harness-executor.ts` | Executive-loop bridge for `execution_pattern: harness` |
| `src/core/executive-loop.ts:~413` | Dispatch branch: `if (patternResolution.pattern === 'harness') …` |
| `src/core/types.ts` | `ExecutionPattern` union, `WorkItem.harness*` fields |
| `src/deterministic/execution-pattern-resolver.ts` | `VALID_PATTERNS` includes `'harness'` |
| `src/deterministic/prompt-md-parser.ts` | Parses `harness`, `harness_target`, `harness_mode`, `model_overrides` frontmatter |

## 5. Troubleshooting

**`[harness] unknown harness 'eds'. Available: generic`**
Only `generic` is registered so far. `eds` and `study` land in P4 / P5.

**`[harness] vendor 'codex' auth invalid`**
Non-Claude vendors go through the vendor registry, which validates authentication at the provider level. For now, only `claude` is expected to work end-to-end through the shell-out path. Multi-vendor parity is the P3 deliverable.

**`Harness JS tree not found at …`**
The shell-out runner defaults to the JS harnesses under `~/dev/jack-dev-server-configs/local/`. Override with `GENERIC_HARNESS_ROOT` / `EDS_HARNESS_ROOT` / `STUDY_HARNESS_ROOT` if your layout is different.

**`STEPS.json` shows harness phases but no progress**
Check `ledgers/executive-$(date +%Y-%m-%d).log` for `[harness-executor]` lines. The shell-out runner polls the harness's `STATUS.json` every 2 seconds; if that file never appears, the subprocess didn't start the harness properly.

**Ecosystem config for PM2**
No changes needed — PM2 already runs `dist/core/executive-loop.js`, which now knows about `execution_pattern: harness`. Just `npm run build` to rebuild after pulling this change (SIGUSR2 hot reload).

## 6. Full plan & design rationale

The architecture doc (port vs. wrap, `__spawn__` protocol, Task/Skill emulation, file-by-file change list, phased delivery order) lives at `~/.claude/plans/shiny-splashing-tide.md`. The goals and binding decisions (D1 — both standalone + meta-worker wrap, D2 — unified CLI, D3 — full vendor parity) are in `ai-docs/v2/2026-04-11-v2.2/goals.md`.
