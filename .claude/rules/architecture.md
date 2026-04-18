---
paths:
  - "src/**"
---

# Architecture

## Three-Layer Split

| Layer | Location | Purpose | Uses LLM? |
|-------|----------|---------|-----------|
| **Agentic** | `src/agentic/` | AI decisions: work selection, strategy, diagnosis, prompt building | Yes |
| **Deterministic** | `src/deterministic/` | Mechanical ops: file I/O, health checks, state updates, Notion reporting | No |
| **Core** | `src/core/` | Loop orchestration, types, logging | No |
| **Identity** | `src/identity/` | Gmail + Discord communication presence (opt-in) | Partial |

Logging tags operations as `[AGENTIC]` or `[DETERMINISTIC]` for debugging.

**Key principle:** Communication, diagnosis, and decision-making are **agentic** — driven by LLM reasoning, not hardcoded TypeScript logic. The TypeScript is plumbing (fetch data, execute decisions, write state). The intelligence lives in skills loaded by the prompt builder.

Examples: email triage (`inbox-checker.ts`), goal breakdown (`goal-breakdown.ts`), diagnosis (`agentic-diagnosis.ts`), work selection (`work-selector.ts`) — all LLM-driven.

## Two-Repository Design

- **`continuous-agent/`** (this repo) — Agent infrastructure ONLY. No application code.
- **`ai-sandbox/`** (sibling directory) — ALL worker outputs. Rebaselined 2026-04-17 to a worktree-per-project model:
  - `base` — frozen init commit (Apache 2.0 + `.gitignore`). All `proj/<slug>` worktrees fork from here.
  - `main` — empty showcase; finished demos merge here.
  - `monorepo/legacy-v2.2` — pre-rebaseline flat layout, materialized as the legacy worktree at `~/dev/ai-sandbox-worktrees/monorepo/legacy-v2.2/`. `build_target: monorepo` writes inside it.

New project work: a `proj/<slug>` branch in its own worktree at `~/dev/ai-sandbox-worktrees/proj/<slug>/` (tiered-namespace convention — branch namespace mirrors folder hierarchy). Workers NEVER write to the agent codebase. Enforced by Constitution Article I, Section 6.

**Exceptions:**
- `[SELF-ENHANCE]` prefixed goals route to agent codebase via `.claude/agents/self-enhancer.md`
- `[SKILL-BUILD]` prefixed goals route to `.claude/agents/skill-builder.md`
- Both work on branches for human review before merge

**GitHub Pages CI:** `.github/workflows/deploy-pages.yml` (lives on `monorepo/legacy-v2.2`) auto-deploys all Vite projects from the legacy flat layout. Live at [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/). Per-worktree deploys for new `proj/<slug>` work are not yet wired (future work).

## Vendor Abstraction Layer (v2.1)

`src/core/vendor/` — Multi-vendor LLM support. Two interfaces:
- **`AgentWorkerProvider`** — Full agentic execution (tools, file editing, code execution)
- **`ChatCompletionProvider`** — Simple text-in/text-out LLM calls (breakdown, diagnosis)

Worker vendors (`WORKER_VENDOR` env):

| Vendor | Provider | Auth |
|--------|----------|------|
| `claude` (default) | Claude Agent SDK `query()` | `CLAUDE_CODE_OAUTH_TOKEN` |
| `codex` | OpenAI Codex SDK threads | `codex login` (ChatGPT) |
| `kimi` | Wire SDK or CLI stream-json | `kimi login` (CLI session) |

Kimi has two modes (`KIMI_MODE` env): `cli` (default, accurate turn counting) or `wire` (bidirectional but inflates turn counts).

**Per-goal override:** Add `worker_vendor: codex` (or `kimi`) to PROMPT.md frontmatter. Priority: goal frontmatter > `WORKER_VENDOR` env > `claude` default.

All providers normalize output to `AgentWorkerMessage` with structured `[tool_call]`, `[tool_result]`, and `[thinking]` prefixes for uniform logging.

## Execution Patterns (v2.0)

Resolved via: PROMPT.md `execution_pattern` field > playbook match > system default.

- `plan-then-execute` — Default. Research then build.
- `loop-until-progress` — Keep trying while making gains.
- `plan-mode` — Read-only tools only.
- `deterministic-pipeline` — Fixed step sequence.
- `harness` — v2.2: delegates to a registered harness under `src/harnesses/<name>/`. See `.claude/rules/harnesses.md`.
