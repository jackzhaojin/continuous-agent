# Continuous Executive Agent

An autonomous AI agent that runs 24/7, finds work from a prioritized queue, spawns [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) workers to execute it, validates results, and moves on -- all without waiting for human prompts.

## Why

Most AI coding agents are reactive: you prompt, they respond. This agent flips the model. You drop goals into a queue, and it works through them autonomously -- selecting the highest priority task, breaking complex goals into steps, retrying with different strategies on failure, and only asking for help when truly stuck. It runs continuously via PM2 and communicates asynchronously through markdown files.

The result is an AI that operates more like a junior developer with a task board than a chatbot waiting for instructions.

## How It Works

The agent runs a continuous **executive loop** with these phases:

```
Check Inbox -> Health Check -> Process Inputs -> Select Work -> Execute -> Validate -> Update State -> Continue/Sleep
```

Each iteration selects the highest-priority unblocked goal, spawns an isolated Claude worker to execute it, validates the output with deterministic verifiers, and immediately picks up the next goal. It sleeps only when the queue is empty.

### Work Hierarchy

```
Goal (what to build)
  |-- Steps (auto-generated breakdown for complex goals)
       |-- Contracts (scoped worker sessions with turn budgets)
```

**Goals** are directories in `workspace/` containing a `PROMPT.md` with YAML frontmatter. They flow through a lifecycle: `drafts/` -> `ondeck/` -> `in-progress/P{0-4}/` -> `completed/`.

When a goal exceeds ~100 estimated turns, the agent automatically breaks it into **steps** using an LLM call. Each step runs as an independent worker session sharing the same project directory.

### Architecture

The codebase enforces a strict separation:

| Layer | Location | Role |
|-------|----------|------|
| **Agentic** | `src/agentic/` | AI decisions -- work selection, strategy, diagnosis, prompt building |
| **Deterministic** | `src/deterministic/` | Mechanical ops -- file I/O, health checks, state updates |
| **Core** | `src/core/` | Loop orchestration, types, logging |
| **Identity** | `src/identity/` | Communication -- Gmail inbox, Discord notifications |

### Two-Repository Design

```
continuous-agent/     <-- This repo: the brain
  src/                Executive loop, worker spawner, verifiers
  workspace/          Goal bundles, constitution, human interaction
  ledgers/            Append-only audit trail (JSONL)

ai-sandbox/           <-- Sibling repo: the output
  projects/           Everything the agent builds, each with its own git history
```

The agent never writes application code to its own codebase. All outputs go to isolated project directories in `ai-sandbox/`. This is enforced by the constitution.

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- [PM2](https://pm2.keymetrics.io/) (`npm install -g pm2`)
- Claude Pro or Max subscription (for OAuth token)

### Setup

```bash
git clone https://github.com/jackzhaojin/continuous-agent.git
cd continuous-agent
npm install

# Configure credentials
cp .env.executive.example .env.executive   # Executive loop config
cp .env.worker.example .env.worker         # Worker auth

# Add your Claude OAuth token to .env.worker:
# CLAUDE_CODE_OAUTH_TOKEN=your-token-here

# Create the sibling output directory
mkdir -p ../ai-sandbox

# Build and start
npm run build
pm2 start ecosystem.config.cjs
```

### Give It Work

```bash
# Copy the goal template
cp -r workspace/_TEMPLATE workspace/ondeck/my-first-goal

# Edit the prompt
vim workspace/ondeck/my-first-goal/PROMPT.md

# The agent auto-promotes it by priority and starts working
```

A goal's `PROMPT.md` looks like:

```yaml
---
title: "Build a Todo App"
slug: "todo-app"
priority: P2
status: pending
tags: [react, typescript]
---

## Problem
Build a simple React todo app with local storage persistence...

## Definition of Done
- [ ] App renders and is interactive
- [ ] Todos persist across page refreshes
```

### Monitor

```bash
pm2 logs executive-loop                         # Stream logs
tail -f ledgers/executive-$(date +%Y-%m-%d).log # Executive log
cat workspace/needs-you.md                       # Check for blockers
cat workspace/goals.md                           # Auto-generated index
```

## Key Concepts

### Constitution

Eight immutable hard limits in `workspace/constitution.md` that the agent cannot override:

1. No spending beyond $20/month per service
2. No permanent deletions (archive/soft-delete only)
3. No external publishing without approval
4. No credential exposure
5. No access control expansion
6. No output in agent codebase
7. All activity must be logged
8. 10 retries minimum before blocking

### Retry System

When a worker fails, the agent doesn't just retry -- it selects a **different strategy** each time: simplify scope, research first, break into subtasks, try different tools. After 10 failures (constitutional limit), it marks the goal as blocked and writes to `workspace/needs-you.md` for human help, then moves on to other work.

### Human Interaction

The agent communicates asynchronously via `workspace/needs-you.md`. When blocked, it writes what it needs:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Need DB credentials | 401 on Supabase | | BLOCKING | 2026-01-25 |
```

You respond by editing the Response column with tags like `[APPROVED]`, `[DECISION]`, `[INFO]`, or `[SKIP]`. The agent detects responses within ~30 seconds and unblocks automatically.

### Credential Tiers

Credentials are physically separated into three files to prevent accidental leakage:

| Tier | File | Purpose |
|------|------|---------|
| Executive | `.env.executive` | Loop config, Notion API, identity settings |
| Worker | `.env.worker` | Claude SDK auth (OAuth token) |
| Application | `.env.app` | App credentials (DB, storage) -- optional |

Executive-tier keys never reach workers. The spawner validates this on every execution.

### Self-Enhancement

Goals prefixed with `[SELF-ENHANCE]` allow the agent to modify its own infrastructure code. Changes are made on a branch for human review before merging. Similarly, `[SKILL-BUILD]` goals create reusable Claude Code skills.

### Execution Patterns (v2.0)

Goals can specify an execution pattern in their PROMPT.md frontmatter:

- `plan-then-execute` -- Default. Research then build.
- `plan-mode` -- Read-only analysis, no code changes.
- `loop-until-progress` -- Keep iterating while making gains.
- `deterministic-pipeline` -- Fixed multi-step sequence.

### Identity System (v2.0)

The agent can optionally have its own communication presence:

- **Gmail** -- Checks inbox for new goals, approvals, priority changes
- **Discord** -- Sends completion/blocked notifications via webhooks

All identity features are opt-in and disabled by default via feature flags.

## Observability

```bash
# What is the agent doing right now?
tail -20 ledgers/executive-$(date +%Y-%m-%d).log

# Trace a goal to its worker logs
grep "Todo App" ledgers/work-ledger.jsonl | jq -r '.contract_id'
cat ledgers/2026-01-25/worker-contract-<id>.log

# What's blocked?
cat workspace/needs-you.md

# Goal overview
cat workspace/goals.md
```

## Development

```bash
npm run dev          # Run with tsx (no build needed)
npm run build        # Build TypeScript to dist/
npm run typecheck    # Type check without emitting
```

When modifying the agent while it's running: just `npm run build`. The current worker continues uninterrupted; changes take effect on the next loop iteration.

## Project Structure

```
src/
  core/              Executive loop, types, logging
  agentic/           AI decisions (work selection, strategy, prompts, diagnosis)
  deterministic/     Mechanical ops (state, health, verifiers, Notion, credentials)
  identity/          Gmail + Discord communication (v2.0)
workspace/           Goal bundles, constitution, needs-you.md
ledgers/             Append-only JSONL audit trail + worker logs
capabilities/        YAML registries (technical, delivery, functional)
references/poc/      Agent SDK proof-of-concept projects
ai-docs/             PRDs, specs, version history
```

## Related

- **[ai-sandbox](https://github.com/jackzhaojin/ai-sandbox)** -- Everything the agent has built
- **[Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk)** -- The SDK this agent uses to spawn workers

## License

MIT
