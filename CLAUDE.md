# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A continuously-running autonomous agent that finds and executes work without waiting for human prompts. It runs 24/7 via PM2, picks goals from a prioritized queue, spawns workers via a multi-vendor abstraction layer (Claude Agent SDK, OpenAI Codex SDK, or Kimi CLI/Wire), validates results, and moves to the next task. Human interaction happens asynchronously via `workspace/needs-you.md`.

## Build & Run

```bash
npm install && npm run build      # Build TypeScript to dist/
npm run typecheck                  # Type check only
npm run dev                        # Development mode (tsx, no build needed)
pm2 start ecosystem.config.cjs    # Production (requires build first)
```

**Entry point:** `src/core/executive-loop.ts` (PM2 runs `dist/core/executive-loop.js`, process name `executive-loop`).

**Hot reload:** Run `npm run build` only. Don't restart PM2 unless explicitly needed -- changes take effect on the next loop iteration while the current worker continues uninterrupted.

**PM2 note:** `NODE_ENV=development` in `ecosystem.config.cjs` so worker `npm install` gets devDependencies. The `cwd` and `AGENT_OUTPUTS_PATH` are hardcoded absolute paths in that file.

## TypeScript Conventions

- ES modules (`"type": "module"` in package.json), target ES2022, strict mode
- Import paths need `.js` extension (`'./types.js'` even for `.ts` files)
- No test framework -- validation is done through runtime verifiers, not unit tests
- Ad-hoc tests live in `tests/adhoc/` and run via `npx tsx tests/adhoc/<file>.ts`
- E2E vendor tests: `npx tsx tests/e2e/vendor-workers/<test>.ts` (Claude, Codex, Kimi wire, Kimi CLI, registry)

## Architecture

### Three-Layer Split

| Layer | Location | Purpose | Uses LLM? |
|-------|----------|---------|-----------|
| **Agentic** | `src/agentic/` | AI decisions: work selection, strategy, diagnosis, prompt building | Yes |
| **Deterministic** | `src/deterministic/` | Mechanical ops: file I/O, health checks, state updates, Notion reporting | No |
| **Core** | `src/core/` | Loop orchestration, types, logging | No |

Logging tags operations as `[AGENTIC]` or `[DETERMINISTIC]` for debugging.

### Identity Layer (v2.0)

`src/identity/` -- Agent communication presence (Gmail + Discord). All opt-in, disabled by default.

- `gmail-client.ts` -- OAuth2 refresh token flow, email fetch/send/archive, intent parsing
- `discord-client.ts` -- Webhook-based notifications with throttling
- `inbox-checker.ts` -- Phase 0.5: fetches unread emails, queues actionable intents

### Vendor Abstraction Layer (v2.1)

`src/core/vendor/` -- Multi-vendor LLM support for workers and chat completions.

Two interfaces:
- **`AgentWorkerProvider`** -- Full agentic execution (tools, file editing, code execution)
- **`ChatCompletionProvider`** -- Simple text-in/text-out LLM calls (breakdown, diagnosis)

Worker vendors (`WORKER_VENDOR` env):

| Vendor | Provider | Auth |
|--------|----------|------|
| `claude` (default) | Claude Agent SDK `query()` | `CLAUDE_CODE_OAUTH_TOKEN` |
| `codex` | OpenAI Codex SDK threads | `codex login` (ChatGPT) |
| `kimi` | Wire SDK or CLI stream-json | `kimi login` (CLI session) |

Kimi has two modes (`KIMI_MODE` env): `wire` (default, `@moonshot-ai/kimi-agent-sdk`, bidirectional) or `cli` (`--print --output-format=stream-json`, simpler, cleaner logs).

**Per-goal vendor override:** Add `worker_vendor: codex` (or `kimi`) to PROMPT.md frontmatter. Priority: goal frontmatter > `WORKER_VENDOR` env > `claude` default.

All providers normalize output to `AgentWorkerMessage` with structured `[tool_call]`, `[tool_result]`, and `[thinking]` prefixes in text for uniform logging.

**Reference POCs:** `references/poc/{claude,codex,kimi}/` contain standalone proof-of-concept scripts.

**Live comparison:** Same prompt executed across all 4 vendors, deployed at [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/). Analysis in `learning/finance-dashboard-comparison-2026-03-31.md`.

### Executive Loop Phases

`src/core/executive-loop.ts` runs continuously:

1. **Phase 0.5** -- Check inbox (Gmail, opt-in)
2. **Phase 1** -- Health check (auth, disk, dependencies)
3. **Phase 2** -- Process human inputs from `needs-you.md` + ingest `queue.md`
4. **Phase 3** -- Select work by priority (P0 > P1 > P2 > P3 > P4)
5. **Phase 3b** -- Auto-breakdown of complex goals (>100 turns) into 2-5 steps
6. **Phase 4** -- Execute: resolve execution pattern, spawn Agent SDK worker
7. **Phase 5** -- Validate: run verifiers on `result.output_path` (NOT agent codebase)
8. **Phase 6** -- Update state: goal bundles, ledgers, Notion, Discord
9. **Phase 7** -- Agentic diagnosis (after 3+ failures)
10. **Phase 8** -- Block after 10 failures, write to `needs-you.md`

### Execution Patterns (v2.0)

Resolved via: PROMPT.md `execution_pattern` field > playbook match > system default.

- `plan-then-execute` -- Default. Research then build.
- `loop-until-progress` -- Keep trying while making gains (uses standard worker for now).
- `plan-mode` -- Read-only tools only.
- `deterministic-pipeline` -- Fixed step sequence (executor built, not yet wired into loop).

## Two-Repository Architecture

- **`continuous-agent/`** (this repo) -- Agent infrastructure ONLY. No application code.
- **`ai-sandbox/`** (sibling directory) -- ALL worker outputs. Monorepo with isolated project directories.

Workers NEVER write to the agent codebase. Enforced by Constitution Article I, Section 6.

**GitHub Pages CI:** `ai-sandbox/.github/workflows/deploy-pages.yml` auto-deploys all Vite projects on push to main. Build script (`scripts/build-pages-site.mjs`) recursively discovers projects, builds with correct `--base` paths, and generates a landing page. Live at [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/).

**Exceptions:**
- `[SELF-ENHANCE]` prefixed goals route to agent codebase via `.claude/agents/self-enhancer.md`
- `[SKILL-BUILD]` prefixed goals route to `.claude/agents/skill-builder.md`
- Both work on branches for human review before merge

## Agent Configuration (`.claude/`)

The `.claude/` directory is where agentic behavior is defined — agents, rules, and skills that Claude loads when working on this codebase.

| Directory | Purpose |
|-----------|---------|
| `.claude/agents/` | Subagent definitions (self-enhancer, skill-builder). Spawned for `[SELF-ENHANCE]` and `[SKILL-BUILD]` goals. |
| `.claude/rules/` | Contextual rules loaded by Claude Code — domain knowledge about each subsystem (identity, verifiers, ledgers, credentials, etc.) |
| `.claude/skills/` | Reusable skill definitions with `SKILL.md` files. Used by the executive loop, work selection, validation, and more. |

**Key principle:** Communication, diagnosis, and decision-making are **agentic** — driven by LLM reasoning, not hardcoded TypeScript logic. The TypeScript is plumbing (fetch data, execute decisions, write state). The intelligence lives in prompts sent to `ChatCompletionProvider`.

Examples of agentic (not deterministic) behavior:
- **Email triage** (`inbox-checker.ts`) — LLM classifies each email and decides: queue, reply, or archive
- **Goal breakdown** (`goal-breakdown.ts`) — LLM decides how to split complex goals into steps
- **Diagnosis** (`agentic-diagnosis.ts`) — LLM investigates why a worker failed and suggests fixes
- **Work selection** (`work-selector.ts`) — LLM-assisted prioritization when multiple goals compete

## Goal Bundles

Goals are directories in `workspace/` containing `PROMPT.md` (YAML frontmatter + markdown body).

**Lifecycle:** `drafts/` -> `ondeck/` (auto-promoted by priority) -> `in-progress/P{0-4}/` -> `completed/`

**Per-bundle files:**
- `PROMPT.md` -- Goal definition with frontmatter (title, slug, priority, status, tags, output_path, execution_pattern)
- `STEPS.json` -- Machine-readable step tracking (source of truth)
- `PROGRESS_LOG.md` -- Append-only human-readable timeline
- `CONTRACTS.jsonl` -- Per-bundle contract event log

## Credential System

Three physically separated tiers:

| Tier | File | Purpose |
|------|------|---------|
| 1 - Executive | `.env.executive` | Loop config, Notion, identity settings |
| 2 - Worker | `.env.worker` | Claude SDK auth (OAuth token) |
| 3 - Application | `.env.app` | App credentials (DB, storage) with `APP_` prefix |

Tier 1 keys never reach workers. Auth is OAuth-first (`CLAUDE_CODE_OAUTH_TOKEN`). Codex and Kimi authenticate via their respective CLI logins (`codex login`, `kimi login`) -- no API keys needed for worker execution.

Loading order: `.env.executive` -> `.env.worker` -> `.env` (legacy fallback). Worker spawner copies `.env.worker` to `ai-sandbox/.env` and validates no Tier 1 key leakage.

## Feature Flags (v2.0)

All default OFF:

```
V2_PROMPT_COMPOSITION=true    # Skill+playbook composition in prompts
V2_TRACK_RECORDS=true          # Update track_record in SKILL.md files
IDENTITY_ENABLED=true          # Master switch for Gmail + Discord
GMAIL_ENABLED=true             # Gmail inbox checking
DISCORD_ENABLED=true           # Discord notifications
```

## Key Files Quick Reference

| What | Where |
|------|-------|
| Executive loop | `src/core/executive-loop.ts` |
| Vendor registry | `src/core/vendor/vendor-registry.ts` |
| Vendor types | `src/core/vendor/types.ts` |
| Worker spawner | `src/agentic/execution/worker-spawner.ts` |
| Work selector | `src/agentic/work-selection/work-selector.ts` |
| Goal scanner | `src/agentic/work-selection/goal-scanner.ts` |
| Goal breakdown | `src/agentic/work-selection/goal-breakdown.ts` |
| Prompt builder | `src/agentic/intelligence/prompt-builder.ts` |
| Strategy selector | `src/agentic/intelligence/strategy-selector.ts` |
| State handler | `src/deterministic/state-handler.ts` |
| STEPS.json handler | `src/deterministic/steps-json-handler.ts` |
| Credential tiers | `src/deterministic/credential-tiers.ts` |
| Skill/playbook loaders | `src/deterministic/skill-loader.ts`, `playbook-loader.ts` |
| Pattern resolver | `src/deterministic/execution-pattern-resolver.ts` |
| Notion reporter | `src/deterministic/notion-reporter.ts` |
| Identity (Gmail) | `src/identity/gmail-client.ts` |
| Identity (Discord) | `src/identity/discord-client.ts` |
| Constitution | `workspace/constitution.md` (**NEVER auto-modify**) |
| Prompt templates | `src/agentic/worker-prompts/{category}/` (versioned filenames) |
| Capability registries | `capabilities/*.yml` |

## Code Modification Rules

1. **Constitution** (`workspace/constitution.md`) -- NEVER auto-modify
2. **Ledgers** -- Append-only JSONL, never truncate or modify existing entries
3. **Verifiers** -- Must check `result.output_path`, NOT `process.cwd()`
4. **Prompt templates** -- Changes affect all future tasks; organized in `src/agentic/worker-prompts/{category}/`
5. **PM2** -- Rebuild only (`npm run build`), don't restart unless explicitly asked

## Debugging

```bash
tail -f ledgers/executive-$(date +%Y-%m-%d).log   # Live executive log
pm2 logs executive-loop                             # PM2 logs
cat workspace/needs-you.md                          # Blocked goals
tail -20 ledgers/work-ledger.jsonl                  # Recent events
grep "Goal Name" ledgers/work-ledger.jsonl | jq -r '.contract_id'  # Trace to worker log
```

**Common issues:**
- Worker fails immediately -> Check `.env.worker` auth tokens
- Build fails -> `npm run typecheck` for details
- No work selected -> Check `workspace/in-progress/P{0-4}/` for bundles with `status: pending`
- Steps lost on restart -> Verify STEPS.json exists in the bundle
- Self-enhance/skill-build steps repeat -> Title prefix must be preserved for regex matching in `updateStepStatus`
- PM2 running stale code -> Verify `ecosystem.config.cjs` script path is `dist/core/executive-loop.js`
