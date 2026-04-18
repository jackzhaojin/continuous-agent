# V2.2 Capability Surface

**Date:** 2026-04-11
**Audience:** v2.3 planners and integrators building on top of the harness framework.

This doc lists the executable capabilities v2.2 delivered — the interfaces, contracts, and behavioral guarantees that downstream work can rely on. For "what shipped" see [`completion.md`](./completion.md); for "why and how it was built" see [`outcome.md`](./outcome.md) and [`prompt-log.md`](./prompt-log.md).

## 1. HarnessOrchestrator Interface

**Contract location:** `src/harnesses/core/types.ts`

Any harness registered via `harness-registry.ts` must implement:

```ts
interface HarnessOrchestrator {
  name: string;                       // matches CLI --name and PROMPT.md `harness:` frontmatter
  detectMode(target: string): Mode;   // bootstrap | adopt | extend | resume
  run(opts: RunOptions): Promise<RunResult>;
  emit(event: HarnessEvent): void;    // phase_start | phase_complete | agent_message | subtask_created | run_complete
}
```

**Guarantees:**
- The executive loop only escalates on `run_complete({ success: false })`. Internal phase retries are invisible to the 3-strike threshold.
- Events emitted via `emit()` are mirrored into STEPS.json for that goal — workers see harness progress as steps/subtasks.
- `detectMode()` is called once before `run()`; explicit `--mode` flag overrides.

## 2. Vendor Dispatch (`runHarnessAgent`)

**Contract location:** `src/harnesses/core/harness-agent-runner.ts`

Every harness phase that needs an LLM call routes through `runHarnessAgent()`. This is the single chokepoint that handles:

| Concern | Behavior |
|---------|----------|
| Vendor selection | `worker_vendor` PROMPT.md field > `WORKER_VENDOR` env > `claude` default |
| Tool name mapping | Auto-rewrites `Bash` → `Shell` for Codex/Kimi, etc. |
| Prompt adaptation | Claude gets lightweight prompts (SDK auto-discovers skills); Codex/Kimi get heavyweight injected prompts with full skill content inlined |
| Output normalization | All vendors emit `AgentWorkerMessage` with `[tool_call]`, `[tool_result]`, `[thinking]` prefixes |

Adding a new vendor only requires registering it in `src/core/vendor/vendor-registry.ts`; no changes needed in any harness implementation.

## 3. Unified CLI Surface

**Entry point:** `npm run harness -- <flags>`

| Flag | Required | Purpose |
|------|----------|---------|
| `--name` | yes | Harness to invoke (`generic`, `eds`, `study`) |
| `--prompt` | yes | Path to PROMPT.md describing the goal |
| `--mode` | no | `bootstrap` (new) / `adopt` (existing untouched) / `extend` (existing in-progress) / `resume` (continue last run) |
| `--vendor` | no | `claude` / `codex` / `kimi` (overrides PROMPT.md) |
| `--target` | no | Project path; auto-detected if omitted |
| `--model` | no | Vendor-specific model id override |

The CLI is a self-contained entry — it does not require the executive loop to be running. This makes it usable for ad-hoc development outside of 24x7 mode.

## 4. State Mirroring

| Harness | Native state | Mirrored to |
|---------|--------------|-------------|
| `generic-v2` | `STATUS.json` + `TASKS.json` (per project sub-branch) | STEPS.json (per goal) |
| `eds-site-builder` | `STATUS.json` + `TASKS.json` | STEPS.json |
| `study` | per-phase `STATUS.json` | STEPS.json |

`status-mirror.ts` is the only place STEPS.json gets updated from harness state. This means executive-side validators and dashboards see harness progress through the same surface they see normal worker progress.

## 5. PROMPT.md Frontmatter Additions

For goal bundles using the harness execution pattern:

```yaml
execution_pattern: harness
harness: generic | eds | study
worker_vendor: claude | codex | kimi    # optional
mode: bootstrap | adopt | extend | resume  # optional
```

Existing PROMPT.md fields (intent, definition_of_done, definition_of_done_journey, allowed_tools, max_turns) continue to work; harnesses respect them where applicable.

## 6. Test Surface

| Test target | What it validates |
|-------------|-------------------|
| `npm run test:harness` | All 105 unit + mock e2e + Kimi K2.5 validation tests |
| `RUN_LIVE_E2E=1 npm run test:harness:live` | Gated live Claude harness run |
| `tests/adhoc/2026-04-11-harness-v22/run-all.sh` | Multi-vendor smoke driver (Kimi included) |

New harnesses MUST add at least:
- Unit tests for their orchestrator
- A mock-provider e2e (canned handoff data, no live LLM)
- Optional: Kimi/Codex parity tests if multi-vendor support is in scope

## 7. What v2.2 Does NOT Guarantee (yet)

These are explicitly out of scope and reserved for v2.3:

- **Codex parity for EDS and study harnesses** — only `generic-v2` is multi-vendor across all three vendors today
- **Kimi K2.5 CLI determinism** — wire mode is the supported path; CLI is intermittent
- **Kimi K2.5 HOW phase translation** — prompt adaptation needs reinforcement for non-Claude vendors
- **Live multi-vendor CI** — local-only behind `RUN_LIVE_E2E=1`
- **OSS publishing pipeline** — adapter layer is OSS-clean, but no release automation yet

## 8. Cross-Version Dependencies

| Capability v2.2 relies on | Source version |
|---------------------------|----------------|
| Vendor abstraction (`AgentWorkerProvider`, `ChatCompletionProvider`) | v2.1 |
| Per-goal vendor override via PROMPT.md | v2.1 |
| Skill-based prompt composition (two-CWD model) | v2.1.4 |
| Defect-subtask hierarchy in STEPS.json | v2.1.6 |
| `execution_pattern` field + resolver | v2.0 |
| 8-phase executive loop | v1.0 |

Anything older than v2.0 is foundational and not separately surfaced here.
