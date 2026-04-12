# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) **and** other agents (Codex, Kimi, etc.) working in this repository. Claude auto-loads `.claude/rules/*.md`; other agents should read the referenced rule files manually on demand.

## Project Overview

A continuously-running autonomous agent that finds and executes work without waiting for human prompts. It runs 24/7 via PM2, picks goals from a prioritized queue, spawns workers via a multi-vendor abstraction (Claude Agent SDK, OpenAI Codex SDK, Kimi CLI/Wire), validates results, and moves to the next task. Human interaction is async via `workspace/needs-you.md`.

## Build & Run

```bash
npm install && npm run build      # Build TypeScript to dist/
npm run typecheck                  # Type check only (use this in secondary worktrees)
npm run dev                        # Development mode (tsx, no build needed)
pm2 start ecosystem.config.cjs     # Production (requires build first)
```

**Entry point:** `src/core/executive-loop.ts` (PM2 runs `dist/core/executive-loop.js`, process name `executive-loop`).

**Hot reload:** Run `npm run build` only — the build script ends with `pm2 sendSignal SIGUSR2 executive-loop`. The current worker continues uninterrupted; changes take effect on the next loop iteration. Don't restart PM2 unless explicitly asked.

## Critical Invariants

1. **Constitution** (`workspace/constitution.md`) — NEVER auto-modify
2. **Ledgers** — Append-only JSONL, never truncate or modify existing entries
3. **Verifiers** — Must check `result.output_path`, NOT `process.cwd()`
4. **Worker skills** — Add to `claude-files-to-output/skills/` (synced to ai-sandbox per spawn)
5. **PM2** — Rebuild only (`npm run build`); never `pm2 restart` without explicit ask
6. **Develop worktree** — NEVER run `npm run build` in `continuous-agent-develop`. The SIGUSR2 hits main's registered dist/, not develop's. Use `npm run typecheck` in secondary worktrees.
7. **Never commit or push** unless explicitly instructed

## TypeScript Conventions

- ES modules (`"type": "module"`), target ES2022, strict mode
- Import paths need `.js` extension (`'./types.js'` even for `.ts` files)
- No test framework — validation via runtime verifiers
- Ad-hoc tests: `tests/adhoc/` run via `npx tsx tests/adhoc/<file>.ts`
- E2E vendor tests: `tests/e2e/vendor-workers/` (Claude, Codex, Kimi wire, Kimi CLI, registry)
- Harness v2.2 tests: `npm run test:harness` (unit + mock e2e, no API calls); `npm run test:harness:live` for gated Claude run

## Feature Flags

All default OFF unless noted:

```
V2_TRACK_RECORDS=true          # Update track_record in SKILL.md files
IDENTITY_ENABLED=true          # Master switch for Gmail + Discord
GMAIL_ENABLED=true             # Gmail inbox checking
DISCORD_ENABLED=true           # Discord notifications
```

`V2_PROMPT_COMPOSITION` has been removed — V2 skill-based composition is now the only path.

## Rule Files — Manual Index

Claude Code auto-loads these via `.claude/rules/`. **Other agents (Codex, Kimi, etc.) should read the relevant file manually when working in the matching area.** One-line descriptions:

| Rule File | Covers |
|-----------|--------|
| [`.claude/rules/architecture.md`](.claude/rules/architecture.md) | Three-layer split (agentic/deterministic/core), two-repo design, vendor abstraction, execution patterns |
| [`.claude/rules/skills-and-prompts.md`](.claude/rules/skills-and-prompts.md) | Two-CWD skill model, executive vs worker skills, prompt composition pipeline, vendor-specific behavior |
| [`.claude/rules/executive-loop.md`](.claude/rules/executive-loop.md) | 8-phase loop details, sleep logic, env loading order |
| [`.claude/rules/harnesses.md`](.claude/rules/harnesses.md) | v2.2 harness mode — HarnessOrchestrator interface, vendor-agnostic chokepoint, per-harness deltas, registration flow |
| [`.claude/rules/workspace-and-goals.md`](.claude/rules/workspace-and-goals.md) | Goal bundle lifecycle, STEPS.json schema, per-bundle files, needs-you.md human interaction |
| [`.claude/rules/worker-spawner.md`](.claude/rules/worker-spawner.md) | Worker spawning pipeline, CLAUDE.md generation, skill sync |
| [`.claude/rules/credentials-and-env.md`](.claude/rules/credentials-and-env.md) | Three-tier credential system, OAuth-first auth, leakage validation |
| [`.claude/rules/verifiers.md`](.claude/rules/verifiers.md) | Runtime verifier contract, output_path requirement |
| [`.claude/rules/ledgers.md`](.claude/rules/ledgers.md) | JSONL append-only audit trail, contract log format |
| [`.claude/rules/identity-system.md`](.claude/rules/identity-system.md) | Gmail + Discord identity layer, opt-in feature flags |
| [`.claude/rules/notion-reporting.md`](.claude/rules/notion-reporting.md) | Fire-and-forget Notion integration, monthly rotation |
| [`.claude/rules/self-enhancement.md`](.claude/rules/self-enhancement.md) | `[SELF-ENHANCE]` and `[SKILL-BUILD]` goal routing, branch workflow |
| [`.claude/rules/capabilities.md`](.claude/rules/capabilities.md) | Capability registries under `capabilities/*.yml` |
| [`.claude/rules/reference-pocs.md`](.claude/rules/reference-pocs.md) | Standalone vendor POCs at `references/poc/{claude,codex,kimi}/` |
| [`.claude/rules/key-files-and-debugging.md`](.claude/rules/key-files-and-debugging.md) | File index for fast navigation + common issues + debug commands |

## Other Key Docs

- `HARNESS.md` (repo root) — Full harness v2.2 CLI reference, frontmatter fields, phased delivery status
- `workspace-instructions/` — Git-tracked goal template, frontmatter field reference, workspace file docs
- `CONTRIBUTING.md` — TypeScript conventions + "writing a new harness" guide
- `workspace/constitution.md` — Immutable hard limits (**never auto-modify**)
