# V2.2 Completion Report

**Completed:** 2026-04-11
**PR:** [#19](https://github.com/jackzhaojin/continuous-agent/pull/19) — merged to `main`

## What Shipped

### Harness Integration Framework (`src/harnesses/`)

Three multi-agent plan-then-build pipelines ported from JavaScript to TypeScript and integrated as first-class agents in the executive loop.

| Harness | Source | Purpose | Status |
|---------|--------|---------|--------|
| `generic-v2` | upstream `/jack-dev-server-configs/local/generic-harness-v2` | Plan + build for arbitrary projects with sub-branch isolation | Full multi-vendor |
| `eds-site-builder` | upstream `/jack-dev-server-configs/local/eds-site-builder-harness` | Adobe Edge Delivery Services site authoring | Claude full; Kimi wire OK |
| `study` | upstream `/jack-dev-server-configs/local/study-harness` | Per-phase study/learn pipeline with dual-vendor coordinator path | Claude full; Kimi wire OK |

Both execution modes work:
- **Standalone:** `npm run harness -- --name <generic|eds|study> --prompt <path>` (no executive loop)
- **Integrated:** Goal bundle with `execution_pattern: harness` runs through 24x7 executive loop as a meta-worker

### HarnessOrchestrator Interface (`src/harnesses/core/`)

Vendor-agnostic chokepoint that maps harness internals onto the executive's contract / steps / verifier model.

| File | Role |
|------|------|
| `types.ts` | `HarnessOrchestrator` interface, event schema, mode/state types |
| `harness-registry.ts` | Per-name registration; CLI and executor look up by `--name` or `harness:` frontmatter |
| `harness-agent-runner.ts` | Single dispatch point: prompt adaptation, tool name mapping, multi-vendor provider call |
| `harness-event-bus.ts` | Phase events (phase_start, phase_complete, agent_message, subtask_created) |
| `status-mirror.ts` | Mirrors STATUS.json + TASKS.json (generic/EDS) or per-phase STATUS.json (study) into STEPS.json |

**Retry semantics:** Internal harness retries do not count against the executive's 3-strike threshold. Only `run_complete(success=false)` increments the goal failure count. This protects long multi-phase runs from being killed by the orchestrator's own retry policy.

### Multi-Vendor Harness Execution

| Vendor | generic-v2 | eds-site-builder | study | Notes |
|--------|------------|------------------|-------|-------|
| Claude Sonnet 4.6 | Full | Full | Full | Default; lightweight prompts via SDK auto-discovery |
| Codex | Full | Deferred to v2.3 | Deferred to v2.3 | Tool name mapping (`Shell` ≠ `Bash`) needed |
| Kimi K2.5 (wire) | Full | Works | Works | Recommended over CLI |
| Kimi K2.5 (CLI) | Intermittent | Intermittent | Intermittent | Hardened in commit 1b009bd; not deterministic — see Known Issues |

3-vendor visual comparison run end-to-end against `harness-v2-test` with Playwright CLI headful verification (Kimi/Codex/Claude all functional).

### Unified Harness CLI (`src/harnesses/cli.ts`)

Single entry point replaces per-harness `npm start` commands.

```bash
npm run harness -- \
  --name generic|eds|study \
  --prompt <path-to-PROMPT.md> \
  [--mode bootstrap|adopt|extend|resume] \
  [--vendor claude|codex|kimi] \
  [--target <path>] \
  [--model <id>]
```

Auto-detects mode from target state; explicit `--mode` overrides.

### Comprehensive Test Suite

| Tests | Count | Command |
|-------|-------|---------|
| Unit (core, state/mode, loaders) | 71 | `npm run test:harness` |
| Mock-provider e2e (full orchestrator with canned handoff) | 6 | `npm run test:harness` |
| Kimi K2.5 validation (tool mapping, prompt adaptation, model resolution, registry) | 28 | `npm run test:harness` |
| Live Claude e2e (gated) | — | `RUN_LIVE_E2E=1 npm run test:harness:live` |
| **Total green** | **105** | |

### HARNESS.md Reference Docs

Full CLI guide, frontmatter fields, phased delivery status (P1–P7), vendor notes, troubleshooting, architecture rationale, and key files index. README updated to point harness-mode users to HARNESS.md.

## Scope Decisions

| Decision | Rationale |
|----------|-----------|
| OSS-readiness via adapter layer | Upstream harness sources at `/jack-dev-server-configs/local/*-harness-*` remain untouched; all v2.2 fixes live in `continuous-agent`. Lets upstream evolve independently. |
| Internal retries don't count against 3-strike | Long harness phases would otherwise hit the goal failure ceiling on transient errors. Only run-level failures escalate. |
| Kimi wire is the supported path | CLI handoff intermittently passes wrong file set to next phase. Wire SDK is reliable. |
| Codex parity for generic only | Tool mapping + prompt adaptation works for generic-v2; EDS/study need vendor-specific tuning deferred to v2.3. |
| No CI for live multi-vendor e2e | Cost/API gating; local-only via `RUN_LIVE_E2E=1`. |

## Known Issues (deferred to v2.3)

- **Kimi K2.5 CLI handoff** — intermittent wrong-file-set on phase transitions. Hardened in `1b009bd` but not deterministic.
- **Kimi K2.5 HOW translation** — prompt adaptation for non-Claude vendors needs reinforcement for the spec-when (HOW) phase.
- **Kimi K2.5 token budget** — task 3 (BUILD) exceeded budget on first attempt; ~20k tokens sufficient for simple tasks, larger builds need per-task tuning.
- **Codex parity** — full multi-vendor support for EDS and study harnesses deferred.
- **Validator recursive loop** — over-indexed on handoff-format defects causing infinite retries. Fixed in `16545dc`.

## Key Files

| File | Purpose |
|------|---------|
| `src/harnesses/cli.ts` | Unified CLI entry point |
| `src/harnesses/core/types.ts` | `HarnessOrchestrator` interface, event schema |
| `src/harnesses/core/harness-agent-runner.ts` | Vendor dispatch + prompt adaptation |
| `src/harnesses/core/harness-registry.ts` | Per-name harness registration |
| `src/harnesses/core/status-mirror.ts` | STATUS.json/TASKS.json → STEPS.json bridge |
| `src/harnesses/{generic,eds,study}/` | Per-harness orchestrator implementations |
| `tests/harness/` | Unit + mock e2e + Kimi validation suites |
| `HARNESS.md` | CLI reference, frontmatter fields, phased delivery status |
| `.claude/rules/harnesses.md` | Architecture rule file (auto-loaded by Claude Code) |

## Process Notes

- Never built or restarted PM2 from develop worktree (would SIGUSR2 main's registered dist/)
- Never committed or pushed without explicit `/jack-git-commit` invocation
- Upstream OSS harnesses untouched; all fixes in adapter layer
- `CLAUDE.md` reduced to invariants + rule index; detail moved to `.claude/rules/*.md`

## Cross-References

- Goals captured in [`goals.md`](./goals.md)
- Detailed outcome and timeline in [`outcome.md`](./outcome.md)
- Multi-session prompt log in [`prompt-log.md`](./prompt-log.md)
- Kimi K2.5 validation report in [`validation-report-kimi-k2.5.md`](./validation-report-kimi-k2.5.md)
- Capability surface for v2.3 planners in [`capabilities-2.2.md`](./capabilities-2.2.md)
