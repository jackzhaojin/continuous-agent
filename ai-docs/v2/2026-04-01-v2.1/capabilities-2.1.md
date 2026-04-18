# V2.1 Capability Surface (Consolidated)

**Date:** 2026-04-01 → 2026-04-11 (sub-releases v2.1.1–v2.1.6)
**Audience:** v2.2/v2.3 planners and integrators.

V2.1 shipped as six discrete sub-releases. This consolidated reference summarizes the executable capabilities each one added, with pointers to the per-release goal docs and retros. For the marquee vendor abstraction features that defined v2.1.0, see [`completion.md`](./completion.md).

## Sub-Release Index

| Sub-version | Date | Theme | Doc |
|-------------|------|-------|-----|
| v2.1.0 | 2026-04-01 | Vendor abstraction layer (Claude/Codex/Kimi) | [completion.md](./completion.md) |
| v2.1.1 | 2026-04-04 | Hardening: prompt refactor, agentic email triage, agent rules | [prompt-log-v2.1.1-hardening.md](./prompt-log-v2.1.1-hardening.md) |
| v2.1.2 | 2026-04-05 | Docs overhaul, jack-git-commit skill, PM2 SIGUSR2 hot reload | [prompt-log-2.1.2.md](./prompt-log-2.1.2.md) |
| v2.1.3 | 2026-04-05 | Release ops: tagging, PR review, Kimi CLI cutover, breakdown tuning | [prompt-log-2.1.3.md](./prompt-log-2.1.3.md) |
| v2.1.4 | 2026-04-05 | Skill-based prompt composition, two-CWD architecture, web-testing skill | [goal-2.1.4.md](./goal-2.1.4.md) |
| v2.1.5 | 2026-04-06 | Build verification hardening, dynamic port detection, orphan cleanup | [goal-2.1.5.md](./goal-2.1.5.md) |
| v2.1.6 | 2026-04-11 | Executive self-triage, defect-subtask pipeline, journey-first discipline | [goal-2.1.6.md](./goal-2.1.6.md) |

## v2.1.0 — Vendor Abstraction (Marquee)

See [`completion.md`](./completion.md) for full surface. Highlights:

- `AgentWorkerProvider` and `ChatCompletionProvider` interfaces in `src/core/vendor/`
- Three backends: Claude Agent SDK, OpenAI Codex SDK, Kimi (wire + CLI dual-mode via `KIMI_MODE`)
- Per-goal override: `worker_vendor: codex` in PROMPT.md frontmatter
- All vendor outputs normalized to `AgentWorkerMessage` with `[tool_call]`, `[tool_result]`, `[thinking]` prefixes
- GitHub Pages CI deploys all Vite builds to [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/)
- 4-vendor finance-dashboard benchmark deployed and scored

## v2.1.1 — Hardening Pass

| Capability | Where |
|-----------|-------|
| Worker prompts refactored into `worker-prompts/` versioned templates | `src/agentic/prompts/worker-prompts/` |
| Agentic email triage: LLM classifies inbox (queue/reply/archive) instead of regex rules | `src/agentic/inbox-checker.ts` |
| Throttling on email replies | inbox-checker |
| Claude skills/agents/rules formalized in `.claude/` | `.claude/skills/`, `.claude/agents/`, `.claude/rules/` |
| `long-agent-monitor` skill for live agent supervision | `.claude/skills/long-agent-monitor/` |
| E2E test coverage extended for vendor workers | `tests/e2e/vendor-workers/` |
| Kimi model config consolidated | env + vendor-registry |

## v2.1.2 — Docs + DX

| Capability | Where |
|-----------|-------|
| README rewritten as "coding agents" framing with technical-highlights extraction | `README.md`, `docs/technical-highlights/` |
| `jack-git-commit` skill: structured commits with conventional format, auto-staging, gitignore audit, traceable footers (Goal/Step/Worker) | `.claude/skills/jack-git-commit/` |
| `goal-drafter` skill with guided interview for human-facing goal authoring | `.claude/skills/goal-drafter/` |
| `executive-agent-operator` agent for live system supervision and triage | `.claude/agents/executive-agent-operator.md` |
| Discord notification fixes (webhook formatting, throttle window) | `src/agentic/discord-notifier.ts` |
| **PM2 SIGUSR2 hot reload** — `npm run build` triggers graceful next-iteration restart without killing the in-flight worker | `ecosystem.config.cjs`, `package.json` build script |
| Build version stamping: timestamp + git commit hash recorded in ledgers | `src/core/build-version.ts` |
| `workspace-instructions/` reorganized for git-tracked goal templates | `workspace-instructions/` |

## v2.1.3 — Release Ops

| Capability | Where |
|-----------|-------|
| v2.1.2 tag + push, PR #15 reviewed and merged | git tags, GH PR |
| Step granularity tuning: break work into finer chunks within max-steps constraints | `src/agentic/breakdown.ts` |
| Kimi CLI cutover: disabled wire mode default, switched to CLI as primary | `KIMI_MODE` env default |
| Breakdown tuning for max-step constraints | breakdown |

## v2.1.4 — Skill-Based Prompt Composition

| Capability | Where |
|-----------|-------|
| **Two-CWD architecture** — worker skills live in `claude-files-to-output/skills/` (executive) and sync to `ai-sandbox/.claude/skills/` per worker spawn | `src/agentic/execution/worker-spawner.ts` |
| **Per-vendor prompt adaptation** — Claude gets lightweight prompts (SDK auto-discovers skills); Kimi/Codex get heavyweight injected prompts with full skill content + tool name mappings (`Shell` instead of `Bash`) | `src/agentic/prompts/prompt-builder.ts` |
| `web-testing` skill with forced playwright-cli usage for all web projects | `claude-files-to-output/skills/web-testing/` |
| Dynamic port detection (no more hardcoded `:3000`) — detects which port Next.js actually binds to | `web-testing/SKILL.md` |
| V1 prompt-composition dead-code removal (V2_PROMPT_COMPOSITION flag retired; V2 is the only path) | prompt-builder cleanup |
| Regression test step auto-insertion | breakdown |

**Real project:** [b2b-postal-checkout v1](`../../../`see project registry) — Next.js 15, 32 steps, 52 commits, broken end-to-end data flow but 40+ polished components. See [`retro-b2b-postal-checkout-v2.1.5.md`](./retro-b2b-postal-checkout-v2.1.5.md).

## v2.1.5 — Build Verification Hardening

| Capability | Where |
|-----------|-------|
| `node_build` verifier promoted from advisory to **hard failure** for web projects | `src/deterministic/verifiers/node-build.ts` |
| Post-build verification step auto-inserted | breakdown |
| Orphan process cleanup between steps (kills stranded next/vite servers) | `src/agentic/execution/worker-spawner.ts` |
| Step-level build health tracking in STEPS.json | STEPS.json schema |
| Build-fix regression loop (workers must verify build still passes before declaring done) | `web-testing` skill |
| Reference POC pruning (removed stale POCs that confused workers) | `references/poc/` |

**Real project:** Continuing b2b-postal-checkout — fixing port collisions and orphan processes during run.

## v2.1.6 — Executive Self-Triage & Recovery

This is the largest sub-release; sets up v2.2 harness work.

| Capability | Where |
|-----------|-------|
| **Failure classification** — categorizes failures as worker / infrastructure / environment | `src/agentic/diagnosis.ts` |
| **Self-triage skill** — agent spawns to fix verifier bugs autonomously when classified as infrastructure | `.claude/skills/self-triage/` |
| **Recovery pipeline** — automatically unblocks failed goals after self-triage fix lands | `src/core/executive-loop.ts` recovery phase |
| **Defect-subtask pipeline** — STEPS.json supports hierarchical subtasks (step-5 → step-5.1 → step-5.1.1); Phase 5b integration-validator files defects; work-selector walks depth-first so subtasks run before next sibling | `src/core/work-selector.ts`, `src/agentic/execution/integration-validator.ts` |
| **Journey-first worker discipline** — new `definition_of_done_journey` PROMPT.md field specifies the full user flow workers must validate (e.g., "form → submit → rates → confirm"); workers receive this in every step | PROMPT.md frontmatter |
| **Integration gate steps** — auto-inserted `[GATE]` steps run full E2E journey tests at regular cadence; `journey.spec.ts` grows append-only across gates | breakdown + gate runner |
| Phase 5b integration-validator | executive-loop |
| Structured handoff pipeline — workers produce YAML handoff blocks; executive parses and injects prior-step context into next worker | `src/agentic/handoff-parser.ts` |

**Real project:** b2b-postal-checkout v2 — 55 steps, 11 gates, 60 commits, 83 components. See [`retro-b2b-postal-checkout-v2.1.6.md`](./retro-b2b-postal-checkout-v2.1.6.md).

## What v2.1 Changed Permanently

These are now load-bearing assumptions for v2.2+:

| Assumption | Implication |
|-----------|-------------|
| Workers can run on any of 3 vendors | Skills must be vendor-portable; tool names must be mapped at the chokepoint, not hardcoded |
| Worker skills live in two places (CWDs) | Skill authors edit `claude-files-to-output/skills/`; ai-sandbox copies are spawn-time syncs, not source of truth |
| `node_build` is a hard failure for web projects | Workers cannot leave broken builds; verifier escalates |
| STEPS.json is hierarchical | Validators can file subtasks; depth-first work selection is invariant |
| Hot reload is SIGUSR2 (no restart) | Never `pm2 restart` for code changes |
| `definition_of_done_journey` is the success contract for web projects | Component-by-component completion ≠ done; full user flow must work |

## Known Gaps Carried Into v2.2

These v2.1.6 retro findings shaped v2.2 priorities:

- **H1: Handoff parser fragile on Kimi output** — addressed in v2.2 by routing all vendor calls through `runHarnessAgent()` chokepoint
- **H3: Gates detect regressions but don't block merge** — partially addressed; full enforcement deferred
- **I4: Workers reinvent UI components instead of using libraries** — prompt/skill issue; not v2.2 scope
- **Kimi K2.5 prompt translation gaps** — v2.2 addressed for harness phases, but general worker path still relies on heavyweight injection

## Real Projects Built During v2.1

| Project | Path | Sub-version | URL |
|---------|------|-------------|-----|
| Finance dashboard (4 vendors) | `ai-sandbox/projects/react/2026-03-31/finance-dashboard-{claude,codex,kimi-cli,kimi-wire}` | v2.1.0 deploy | [Live](https://jackzhaojin.github.io/ai-sandbox/) |
| Finance dashboard refinement | `ai-sandbox/projects/react/2026-04-04/finance-dashboard-{kimi-cli,kimi-wire}` | v2.1 | (same Pages site) |
| B2B postal checkout v1 | `ai-sandbox/projects/nextjs/2026-04-05/1775414201963` | v2.1.4 | (Next.js, not deployed) |
| B2B postal checkout v2 | `ai-sandbox/projects/nextjs/2026-04-11/1775939155064` | v2.1.6 | (Next.js, not deployed) |
| B2B postal checkout iterations | `ai-sandbox/projects/nextjs/2026-04-11/{1775931318881,1775937114098,1775938112028}` | v2.1.6 | — |
| B2B postal checkout (Supabase) | `ai-sandbox/projects/misc/2026-04-11/1775935234448` | v2.1.6 | — |
