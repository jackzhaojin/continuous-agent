# Continuous Executive Agent

An autonomous AI agent that finds and executes work proactively without waiting for human prompts. It runs 24/7 via PM2, picks up goals from a prioritized queue, spawns Claude Agent SDK workers, validates results, and moves on to the next task — all without human intervention.

## How It Works

The agent runs a continuous **8-phase executive loop**:

```
Health Check → Process Inputs → Select Work → Create Contract → Execute → Validate → Update State → Continue/Sleep
```

Each iteration selects the highest-priority unblocked goal, spawns an isolated Claude worker to execute it, validates the output, and immediately picks up the next goal. Sleep only occurs when the queue is empty.

## Work Hierarchy: Goals, Steps, and Contracts

Work is organized in three tiers:

```
Goal (what to build)
 └── Steps (how to break it down)
      └── Contracts (scoped worker sessions)
```

### Goals

A **goal** is a unit of work — "Build a chat app", "Fix the OAuth bug", "Record a demo video". Goals live as **goal bundles** in `workspace/`: a folder containing a `PROMPT.md` file with YAML frontmatter and a markdown description.

```yaml
# workspace/in-progress/P2/fix-chatapp-oauth/PROMPT.md
---
title: "Fix Chat App OAuth"
slug: "fix-chatapp-oauth"
priority: P2
status: pending
complexity: high
tags: [bugfix, oauth]
max_turns: 500          # Override for turn-intensive tasks
output_path:            # Set by worker on first execution
---

## Problem
The chat app uses ANTHROPIC_API_KEY but we only have OAuth...
```

**Goal lifecycle:** `drafts/` → `ondeck/` (auto-promoted by priority) → `in-progress/P{0-4}/` → `completed/`

Priority levels: **P0** (critical) > **P1** (urgent) > **P2** (high) > **P3** (normal) > **P4** (low/self-improvement)

### Steps

When a goal is too complex for a single worker session (>100 estimated turns), the agent **automatically breaks it down into steps** using an LLM call. Each step is executed independently with shared project state.

Steps are tracked in `STEPS.json` (machine-readable) alongside `PROGRESS_LOG.md` (human-readable timeline). If a step fails, the system can re-breakdown remaining work (up to 2 times).

### Contracts

A **contract** is a scoped work agreement given to a single worker: the prompt, allowed tools, Definition of Done, and a turn budget. Each contract produces an isolated Claude Agent SDK session that executes in the `ai-sandbox/` directory.

Contracts are ephemeral — they exist for the duration of a worker session. Every contract is logged to `CONTRACTS.jsonl` in the goal bundle and to `ledgers/work-ledger.jsonl` for full traceability.

## Turn Budgets

Each worker session has a **turn limit** — the maximum number of tool-call rounds before the worker wraps up. The limit is resolved in priority order:

| Source | Example | When to use |
|--------|---------|-------------|
| `max_turns` in PROMPT.md | `max_turns: 500` | Playwright, complex full-stack builds, multi-phase demos |
| `estimated_turns` per step | Set by LLM breakdown | Auto-breakdown of complex goals |
| `MAX_TURNS_PER_STEP` env var | `200` (default) | System-wide default |

Simple goals use the default (200). Set `max_turns: 500` in a goal's frontmatter for turn-intensive work like Playwright testing, video recording, or large refactors.

## Hot Reload: Update Without Interrupting

A key design principle: **rebuild without restarting**. The agent should not be interrupted mid-task.

```bash
npm run build    # Rebuild TypeScript → dist/
                 # Changes take effect on the NEXT loop iteration
                 # Current worker continues uninterrupted
```

This means you can:

- **Drop new goals** into `workspace/ondeck/` — the agent picks them up on the next idle cycle
- **Edit a goal's PROMPT.md** (add `max_turns`, update description) — takes effect on the next retry
- **Update agent source code** and rebuild — the running worker finishes, then the next iteration uses new code
- **Tune environment variables** in `ecosystem.config.cjs` — requires `pm2 restart` but only when the agent is idle

The agent and its workers are decoupled: the executive loop orchestrates, workers execute in isolation. You can modify the orchestration layer while a worker is running.

## Two-Repository Architecture

```
continuous-agent/     (this repo — the brain)
 ├── src/             Agent infrastructure: executive loop, worker spawner, verifiers
 ├── workspace/       Goal bundles, constitution, human interaction files
 ├── ledgers/         Append-only JSONL logs + worker execution logs
 └── capabilities/    YAML registries for tracked competencies

ai-sandbox/           (sibling repo — the output)
 └── projects/        All AI-built project code, each with its own git history
     ├── nextjs/      Next.js applications
     └── misc/        Experiments, utilities, calibration exercises
```

The agent NEVER writes application code to its own codebase. All outputs go to isolated project directories in [`ai-sandbox/`](https://github.com/jackzhaojin/ai-sandbox). Constitution Article I, Section 6 enforces this with zero tolerance.

**Exception:** Goals prefixed with `[SELF-ENHANCE]` route to the agent codebase itself, allowing the agent to improve its own infrastructure on a branch for human review.

## Retry and Strategy System

When a worker fails, the agent doesn't just retry — it tries a **different strategy** each time:

1. Simplify scope
2. Research first
3. Break into subtasks
4. Different tools/approach

After 10 failed attempts (Constitutional limit), the goal is marked **Blocked** and the agent writes to `workspace/needs-you.md` for human input, then moves on to other work.

## Human Interaction

The agent communicates asynchronously via `workspace/needs-you.md`. When blocked, it writes what it needs. The human edits the file to respond:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get API token | 401 Unauthorized... | [APPROVED] Token: sk_xyz | BLOCKING | 2026-01-25 |
```

Response tags: `[APPROVED]`, `[DECISION]`, `[INFO]`, `[SKIP]`

The agent detects responses automatically within ~30 seconds and unblocks the goal.

## Credential Management

Credentials are physically separated into three tiers:

| Tier | File | Purpose |
|------|------|---------|
| **1 - Executive** | `.env.executive` | Loop config, Notion reporting |
| **2 - Worker** | `.env.worker` | Claude SDK auth (OAuth token) |
| **3 - Application** | `.env.app` | App credentials (DB, storage) — platform-agnostic |

Tier 1 keys never reach workers. Authentication is **OAuth-first** (`CLAUDE_CODE_OAUTH_TOKEN` via Claude Pro/Max subscription) — no Anthropic API key required.

## Constitution (Hard Limits)

Eight immutable constraints in `workspace/constitution.md` that cannot be overridden by prompts or code:

1. No spending beyond $20/month per service
2. No permanent deletions
3. No external publishing without approval
4. No credential exposure
5. No access control expansion
6. No output in agent codebase (all output → ai-sandbox/)
7. All activity must be logged
8. 10 retries minimum before blocking

## Quick Start

```bash
npm install
cp .env.executive.example .env.executive
cp .env.worker.example .env.worker
# Add CLAUDE_CODE_OAUTH_TOKEN to .env.worker

npm run build
pm2 start ecosystem.config.cjs

# Monitor
pm2 logs executive-loop         # Stream logs
tail -f ledgers/executive-*.log # Executive log
cat workspace/needs-you.md      # Check for blockers
```

## Giving the Agent Work

```bash
# 1. Copy the template
cp -r workspace/_TEMPLATE workspace/ondeck/my-new-goal

# 2. Edit PROMPT.md with your goal
vim workspace/ondeck/my-new-goal/PROMPT.md

# 3. The agent auto-promotes it to in-progress by priority
#    and starts working on the next loop iteration
```

## Observability

```bash
# What is the agent doing right now?
tail -20 ledgers/executive-$(date +%Y-%m-%d).log

# Trace a goal to its worker logs
grep "My Goal" ledgers/work-ledger.jsonl | jq -r '.contract_id'
cat ledgers/2026-01-25/worker-contract-<id>.log

# What's blocked?
cat workspace/needs-you.md
```

## Related

- **[ai-sandbox](https://github.com/jackzhaojin/ai-sandbox)** — Public repo of everything the agent has built
- **CLAUDE.md** — Detailed technical guidance for working with this codebase
- **ai-docs/** — PRDs, specs, and feature documentation

## Requirements

- Node.js >= 18.0.0
- PM2 for production deployment
- Claude Pro/Max subscription (OAuth token)

## License

Private / Operational
