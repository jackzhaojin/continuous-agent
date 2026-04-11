---
paths:
  - "src/harnesses/**"
  - "tests/adhoc/2026-04-11-harness-v22/**"
  - "tests/e2e/harnesses/**"
  - "HARNESS.md"
---

# Harnesses (v2.2)

Harnesses are multi-agent plan-then-build pipelines that live under `src/harnesses/<name>/` and implement the `HarnessOrchestrator` interface. Three are shipped: `generic`, `eds`, `study`. They can run two ways:

1. **Standalone** — via `npm run harness -- --name <name> --prompt <path>` (unified CLI at `src/harnesses/cli.ts`)
2. **Integrated** — dropped into `workspace/ondeck/` as a goal bundle with `execution_pattern: harness`. The executive loop's `src/agentic/execution/harness-executor.ts` bridges events into STEPS.json via a `StepSink`.

See `HARNESS.md` (repo root) for the full CLI reference and phased status.

## The vendor-agnostic chokepoint

`src/harnesses/core/harness-agent-runner.ts:runHarnessAgent()` is the **single** place where a harness invokes an LLM. It:

1. Adapts the prompt for the target vendor via `adaptPromptForVendor()`
2. Maps Claude-native tool names via `mapToolNames()` (e.g. `Bash` → `Shell` on Kimi)
3. Calls `provider.spawn()` from `AgentWorkerProvider`
4. Accumulates text, extracts the LAST ```json handoff block, returns a `HarnessAgentResult`

**Do NOT import `@anthropic-ai/claude-agent-sdk` directly from inside `src/harnesses/*`.** That would break Codex/Kimi parity. The `ClaudeAgentWorkerProvider` is still the default provider, but it's injected through `HarnessRunConfig.provider`, not imported.

## Interface

```ts
interface HarnessOrchestrator {
  readonly name: string;
  readonly phaseList: readonly string[];       // pre-seeds STEPS.json in executive mode
  detectMode(targetDir, promptFile): Promise<HarnessMode>;
  run(config: HarnessRunConfig): AsyncIterable<HarnessEvent>;
  getState(targetDir): Promise<HarnessState>;
}
```

Events fan out through `HarnessEventBus` (`src/harnesses/core/harness-event-bus.ts`). The CLI renders them to stdout; the executive bridges them into STEPS.json + worker transcripts.

## Layout per harness

```
src/harnesses/<name>/
├── index.ts              # class <Name>Harness implements HarnessOrchestrator
├── orchestrator.ts       # run loop, calls runHarnessAgent()
├── state-store.ts        # STATUS.json / TASKS.json / PROGRESS_LOG.md helpers
├── prompt-loader.ts      # loads prompts/*.md with {{VAR}} substitution
├── model-defaults.ts     # per-agent tools + default models
├── mode-detector.ts      # scenario detection (bootstrap/adopt/extend/resume)
├── prompts/              # prompt templates (copied verbatim from JS source)
└── <harness-specific>/   # eds: ignore-files.ts; study: agents/, skills/, agent-loader.ts
```

## State schemas (byte-compatible with JS originals)

- **generic + eds**: `<target>/ai-docs/SPEC/STATUS.json` (phase cursor: INIT/EXECUTING/PAUSED/COMPLETE) + `TASKS.json` + `PROGRESS_LOG.md`
- **study**: `<target>/ai-docs/STATUS.json` with per-phase objects (7 phases: DECOMPOSE → RESEARCH → SYNTHESIZE → CONTENT → TTS → DEPOSIT → VALIDATE)

Resume paths MUST work against on-disk bundles last touched by the JS harnesses. Never break these schemas.

## Harness-specific details

**generic** — 4-agent spec pipeline (WHY/WHAT/HOW/WHEN) → per-task RESEARCH → BUILD retries → VALIDATE retries → subtask creation on validation failure. Full resume granularity via `detectTaskProgress()` (reads on-disk handoff JSON).

**eds** — Same structure as generic plus `ensureIgnoreFiles()` (`src/harnesses/eds/ignore-files.ts`) which writes `.gitignore` (`.playwright-mcp`) and `.hlxignore` (`ai-docs/`, `.playwright-mcp`) so AEM EDS ingest excludes them. The da.live push flow lives **in the build agent prompt** (Bash tool), not in TypeScript — the agent runs `git push` to `jack-da-live-harness-built` itself.

**study** — Delegates the entire 7-phase pipeline to a single `coordinator` agent (see `src/harnesses/study/agents/coordinator/AGENT.md`). Coordinator uses Claude's native Task/Skill tools to spawn specialists from `src/harnesses/study/agents/` and invoke skills from `src/harnesses/study/skills/`. **Vendor parity is Claude-only** — the `__spawn__` JSON emulation for Codex/Kimi is deferred to v2.3 (documented in `src/harnesses/study/orchestrator.ts` header).

## Tests

- **Unit**: `tests/adhoc/2026-04-11-harness-v22/*.adhoc.ts` — pure functions, state stores, mode detection, loaders, ignore-files, model defaults
- **Mock-provider e2e**: `tests/e2e/harnesses/mock-{generic,eds,study}-orchestrator.e2e.ts` — full orchestrator flow against a fake `AgentWorkerProvider` that returns canned handoff JSON. Exercises event sequence, STATUS.json writes, per-agent outputs, PROGRESS_LOG phase markers.
- **Live e2e** (gated): `tests/e2e/harnesses/claude-live-generic.e2e.ts` — only runs when `RUN_LIVE_E2E=1`. Burns real OAuth credits.
- **Run the suite**: `npm run test:harness` (chains all unit + mock e2e). `npm run test:harness:live` for the gated Claude run.

## Executive-mode integration

The executive loop's dispatch branch for `execution_pattern: 'harness'` is at `src/core/executive-loop.ts:~413`. It calls `executeHarness()` which:

1. Resolves the harness from the registry by `workItem.harness`
2. Resolves the provider via `getAgentWorkerProviderForVendor(workItem.worker_vendor)`
3. Detects mode via `harness.detectMode()` (unless overridden by frontmatter)
4. Pre-seeds STEPS.json from `harness.phaseList` on first run (respects resume)
5. Consumes `harness.run()` and routes events through a `StepSink`
6. Returns a `WorkerResult` to the loop's normal success/failure path

Internal harness retries are NOT counted against the executive's 3-failure threshold. Only a `run_complete(success=false)` or `run_failed` bumps the goal's failure count.

## Registering a new harness

1. Create `src/harnesses/<name>/` with the files above
2. Add `REGISTRY.set('<name>', new <Name>Harness());` to `src/harnesses/core/harness-registry.ts`
3. Verify with `npx tsx src/harnesses/cli.ts --list`
4. Write mock + unit tests under `tests/adhoc/2026-04-11-harness-v22/` and `tests/e2e/harnesses/`
