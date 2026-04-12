# V2.2 Outcome — Harness Integration + Multi-Vendor + OSS Prep

**Date**: 2026-04-11
**Branch**: `develop` -> PR #19 (open, not merged) against `main`
**Agent**: claude-code (develop worktree)

---

## TL;DR

v2.2 delivered harness abstraction in both modes — **standalone** (harness-only, no 24x7 loop) and **meta-worker integrated** (harness wrapped as a worker in the executive loop). All three harnesses (generic-v2, eds-site-builder, study) ported to TypeScript and exposed via a unified `HarnessOrchestrator` interface. Claude is at full parity; Codex and Kimi have partial parity (wire good, Kimi CLI flaky). Tests (unit + mock e2e) green. PR #19 is open and awaiting human review.

## Goals vs Delivered

| Goal (from goals.md) | Status | Notes |
|----------------------|--------|-------|
| Harness still works standalone | DONE | `npm run harness -- --mode=standalone --harness=<name>` |
| Harness integrated as worker in 24x7 loop | DONE | `HarnessOrchestrator` wraps harness as meta-worker, contract-compatible |
| Multi-vendor execution (Claude + Codex + Kimi) | PARTIAL | Claude full; Codex full on generic; Kimi wire good, Kimi CLI intermittently hands off wrong |
| OSS-prep (upstream harnesses untouched) | DONE | All fixes landed in continuous-agent adapter layer, upstream `/jack-dev-server-configs/local/*-harness-*` unmodified |

## What Works

- Standalone harness runs for all three harnesses (generic-v2, eds-site-builder, study) via unified CLI
- Meta-worker integration: executive loop can schedule a goal with `harness: <name>` frontmatter and it flows through contract, execute, validate phases normally
- Sub-branch strategy preserved for generic-v2 (per-project sub-branch under `harness-v2-test/*`)
- Clean-tree invariant: generic-v2 no longer leaves stray uncommitted changes after a run
- Unit tests for harness registry, orchestrator, delta merging — all passing (`npm run test:harness`)
- Mock e2e covering contract -> harness -> verifier loop — passing
- Live Claude harness gated run (`npm run test:harness:live`) — passing locally
- Docs refresh: `HARNESS.md` (CLI + frontmatter reference), `README.md` pointer, `.claude/rules/harnesses.md`, slimmed `CLAUDE.md` with rule index
- PM2 discipline: no builds run from develop worktree (typecheck only); no unauthorized restarts

## What's Partial / Known Issues

- **Kimi CLI handoff**: intermittently hands off the wrong file set to the next phase. Hardened in commit 1b009bd but not fully deterministic — wire path is preferred for now
- **Codex vendor parity**: works for generic-v2, not yet exercised against eds-site-builder or study harnesses
- **`node_build` env** needed extra guarding (landed in 1b009bd) — watch for regressions
- **Live multi-vendor e2e** not wired into CI (cost/API gating); local-only for now

## What's Not Done (deferred beyond v2.2)

- Full Codex parity across eds-site-builder and study harnesses
- Kimi CLI determinism fix (root cause still open)
- CI integration for live harness runs
- OSS release mechanics (LICENSE audit, CONTRIBUTING updates for harness authors done; publishing pipeline not)

## Key Commits (develop)

```
93407ca feat(docs): update agent instructions + add architecture/key-files/skills docs
23795a4 Merge origin/main into develop (conflict resolution)
e6a619c test(harnesses): add v2.2 harness test suite + refresh docs
36253d1 chore(gitignore): ignore claude code per-machine runtime state
1b009bd fix(worker-base,verifiers): harden kimi handoff and node_build env
0dabd37 feat(harnesses): land P3-P7 - port generic/eds/study to TS + OSS prep
94e80ad fix(harnesses): smoke-test fixes for generic shellout runner
360333a feat(harness): introduce v2.2 harness mode with standalone + integrated patterns
9a85f70 feat(harnesses): scaffold v2.2 harness integration (P1+P2)
```

## PR

- **#19** — `v2.2: harness integration + multi-vendor parity (partial) + OSS prep`
- State: OPEN, not merged (per user instruction)
- Target: `main`

## Process Notes / Rules Enforced

- Never committed or pushed without explicit instruction (user issued `/jack-git-commit` each time)
- No `npm run build` from develop worktree (would SIGUSR2 main's PM2)
- No `pm2 restart` — hot reload only belongs on main worktree
- Upstream OSS harnesses at `/jack-dev-server-configs/local/*-harness-*` remained untouched; all fixes live in adapter layer
- CLAUDE.md reduced to invariants + rule index; detail moved to `.claude/rules/*.md`

## Next Actions (for human review)

1. Review PR #19 on GitHub
2. Decide: merge as-is, or block on Codex parity for remaining harnesses
3. Prioritize Kimi CLI determinism fix vs. declaring Kimi-wire the supported path
4. Schedule live multi-vendor e2e job (weekly? on-demand?)
