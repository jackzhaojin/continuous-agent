---
name: long-agent-monitor
description: Monitor the continuous-agent executive loop running via PM2. Checks PM2 process health, tails executive and worker logs from ledgers/, inspects ai-sandbox for worker output progress, reviews goal bundles in workspace/, and surfaces issues from needs-you.md. Use when the user says "monitor agent", "check the agent", "how's the agent doing", or wants a status report on the running autonomous system.
---

# Long Agent Monitor

Monitor the continuous-agent executive loop and its spawned workers. This skill checks PM2 process health, reads ledgers, inspects ai-sandbox output, and reviews goal progress — giving a complete picture of the running system.

## Step 1: PM2 Process Health

Check the executive loop process managed by PM2:

```bash
# Process status — is it online, stopped, erroring?
pm2 describe executive-loop

# Quick overview of all PM2 processes
pm2 list

# Resource usage (CPU, memory, restarts, uptime)
pm2 show executive-loop
```

**Key things to check:**
- **Status**: must be `online`. If `stopped` or `erroring`, report immediately.
- **Restarts**: high restart count indicates crash loops. Check `restart_time` and `unstable_restarts`.
- **Memory**: compare against the 1G `max_memory_restart` limit in `ecosystem.config.cjs`.
- **Uptime**: very short uptime + high restarts = crash loop.

If the process is down, do NOT restart automatically. Report the status and ask the user.

## Step 2: Executive Loop Logs

Read recent executive loop output from PM2 and ledger files:

```bash
# Recent PM2 logs (stdout + stderr combined)
pm2 logs executive-loop --lines 100 --nostream

# Today's executive log
tail -100 ledgers/executive-$(date +%Y-%m-%d).log

# PM2 error log for crashes
tail -50 ledgers/pm2-error.log
```

**What to look for:**
- **Phase progression**: healthy loop cycles through Phases 0.5 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
- **`[AGENTIC]` vs `[DETERMINISTIC]`** tags for understanding what layer is active
- **Worker spawn events**: look for worker start/finish messages
- **Error patterns**: auth failures, build errors, timeout messages
- **Idle sleeping**: `IDLE_SLEEP_SECONDS` messages mean queue is empty (normal if no work)
- **Unhealthy sleeping**: `UNHEALTHY_SLEEP_SECONDS` means health check failed (investigate)

## Step 3: Work Ledger

Check the append-only work ledger for recent task outcomes:

```bash
# Last 20 events
tail -20 ledgers/work-ledger.jsonl

# Recent failures
grep '"status":"failed"' ledgers/work-ledger.jsonl | tail -10

# Recent completions
grep '"status":"completed"' ledgers/work-ledger.jsonl | tail -10
```

Parse the JSONL entries and report:
- **Recent completions** — what goals finished successfully
- **Recent failures** — what goals failed, how many retries
- **Failure streaks** — same goal failing 3+ times triggers agentic diagnosis (Phase 7), 10+ triggers block (Phase 8)

## Step 4: Goal Bundle Status

Scan workspace directories for current goal state:

```bash
# Active work
ls workspace/in-progress/P0/ workspace/in-progress/P1/ workspace/in-progress/P2/ workspace/in-progress/P3/ workspace/in-progress/P4/ 2>/dev/null

# Queued work
ls workspace/ondeck/ 2>/dev/null

# Drafts waiting for promotion
ls workspace/drafts/ 2>/dev/null

# Recently completed
ls workspace/completed/ | tail -10
```

**For each in-progress goal**, read its key files:
- `PROMPT.md` — frontmatter for title, priority, status, worker_vendor, execution_pattern
- `STEPS.json` — step-by-step progress (source of truth for multi-step goals)
- `PROGRESS_LOG.md` — human-readable timeline of what happened

**Report:**
- Which goals are actively being worked on
- Step completion progress (e.g., "Step 2/5 complete")
- Which goals are queued and their priorities
- Any goals stuck in `in-progress` with `status: failed` or high failure counts

## Step 5: AI Sandbox Output

Check the `ai-sandbox` sibling directory for worker output artifacts:

```bash
# Recent changes in ai-sandbox
cd ../ai-sandbox && git log --oneline -10

# Recently modified project directories
ls -lt ../ai-sandbox/ | head -15

# Check for uncommitted worker output
cd ../ai-sandbox && git status --short
```

**What to look for:**
- **New project directories** created by workers
- **Recent commits** — workers commit their output to ai-sandbox
- **Build status** — check if Vite projects build correctly (GitHub Pages CI deploys from main)
- **Uncommitted changes** — workers may have left uncommitted work if they failed mid-task

Cross-reference ai-sandbox output with the `output_path` field in active goal PROMPT.md files to verify workers are writing to the correct locations.

## Step 6: Needs-You & Blocked Goals

Check for goals that need human attention:

```bash
cat workspace/needs-you.md
```

This file is written by Phase 8 when a goal fails 10+ times and gets blocked. It may also contain:
- Auth token expiration notices
- Goals that need human design decisions
- Worker environment issues

Report any entries to the user — these require human action to unblock.

## Step 7: Queue & Upcoming Work

Review the work queue for what's coming next:

```bash
cat workspace/queue.md
```

This shows goals waiting to be ingested by Phase 2. Report:
- Number of queued goals
- Priority distribution
- Any goals that look misconfigured or missing required fields

## Step 8: Summary Report

Compile findings into a concise status report:

```
[MONITOR] <timestamp>
  PM2: <online|stopped|erroring> | uptime: <duration> | restarts: <count> | memory: <MB>
  Active goals: <count> (<list with priorities>)
  Recent completions: <count in last 24h>
  Recent failures: <count in last 24h>
  AI Sandbox: <recent commits summary>
  Blocked: <count in needs-you.md>
  Queue depth: <count>
  Issues: <none | list of problems found>
```

## Continuous Monitoring Mode

If the user asks to "keep watching" or "monitor continuously":

1. Run Steps 1-8 as the initial check
2. Sleep for 60 seconds between iterations
3. On subsequent iterations, focus on **deltas** — what changed since last check
4. Alert immediately if:
   - PM2 process goes down
   - A goal enters failure streak (3+ consecutive failures)
   - `needs-you.md` gets new entries
   - Worker appears stuck (no new log output for 15+ minutes)
   - Memory usage approaching 1G limit

Use the `/loop` skill if available for recurring checks.

## Intervention Guidelines

This skill is for **monitoring and reporting only** by default. Do NOT:
- Restart PM2 processes without user approval
- Modify goal bundles or ledgers
- Push commits on behalf of workers
- Take over worker tasks

**Exception:** If the user explicitly grants intervention authority, you may:
- `pm2 stop executive-loop` to halt a crash-looping process
- `pm2 restart executive-loop` after a fix is applied
- Flag specific goals for re-queue by updating their status

Always explain what you found and what you recommend before taking action.
