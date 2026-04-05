---
name: long-agent-monitor
description: Monitor the continuous-agent executive loop running via PM2. Checks PM2 process health, tails executive and worker logs from ledgers/, inspects ai-sandbox for worker output progress, reviews goal bundles in workspace/, and surfaces issues from needs-you.md. Use when the user says "monitor agent", "check the agent", "how's the agent doing", or wants a status report on the running autonomous system.
---

# Long Agent Monitor

Monitor the continuous-agent executive loop and its spawned workers. This skill checks PM2 process health, reads ledgers, inspects ai-sandbox output, and reviews goal progress — giving a complete picture of the running system.

## CRITICAL: This is a Continuous Monitoring Skill

**This skill runs continuously until the user explicitly stops it.** It is NOT a one-shot status check.

When this skill is invoked:
1. **Immediately** run a full system check (Steps 1-8 below) — this is the aggressive initial pass
2. **Then enter a continuous monitoring loop**, running a delta check every **5 minutes** (300 seconds)
3. **Never stop on your own.** Keep looping until the user says "stop monitoring", "stop", "that's enough", or similar
4. Between checks, use `sleep 300` to wait. This is expected — do not skip the sleep or exit early
5. Use the `/loop 5m` skill if available, otherwise manage the timer manually with `sleep 300`

**The user expects you to keep watching.** If you finish one check and stop, you have failed the purpose of this skill. The whole point is persistent, ongoing supervision of a 24/7 autonomous system.

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

## Step 8: Summary Report (MUST print every cycle)

**Every single monitoring cycle MUST produce visible output.** The user needs to see proof that monitoring is active and the system is being watched. Never run a silent check — always print the report.

### Full Report (first check and every 6th cycle ~30 min)

```
========================================
[MONITOR] YYYY-MM-DD HH:mm:ss | FULL CHECK
========================================
  PM2: <online|stopped|erroring> | uptime: <duration> | restarts: <count> | memory: <MB>
  Active goals: <count> (<list with priorities and titles>)
  Step progress: <e.g., "goal-name: Step 2/5 complete">
  Recent completions (24h): <count> — <list>
  Recent failures (24h): <count> — <list>
  AI Sandbox: <recent commits, new projects>
  Blocked: <count in needs-you.md>
  Queue depth: <count>
  Issues: <none | list of problems found>
  Next check in: 5 minutes
========================================
```

### Delta Report (every other cycle)

```
[MONITOR] YYYY-MM-DD HH:mm:ss | DELTA
  PM2: <online> | mem: <MB>
  Changes since last check:
    - <what changed — new logs, goal progress, new commits, failures, etc.>
    - <or "No changes detected — system idle">
  Issues: <none | new issues>
  Next check in: 5 minutes
```

**Why this matters:** The user is supervising a 24/7 autonomous system. If they glance at their terminal and see no recent monitor output, they don't know if the monitor is still running or if it crashed. Every cycle must produce visible output to confirm the monitor is alive and the system is being watched.

## Continuous Monitoring Loop (DEFAULT BEHAVIOR)

**This is NOT optional — continuous monitoring is the default behavior of this skill.**

After the initial full check (Steps 1-8), enter the monitoring loop:

### Loop Structure

```
INITIAL: Run full Steps 1-8 immediately (aggressive first pass)
LOOP (repeats every 5 minutes until user stops):
  1. sleep 300
  2. Run delta check (Steps 1-8, but only report changes)
  3. Print summary report
  4. Continue loop
```

### Delta Checks (what to compare each iteration)

On each loop iteration, compare against the previous check:
- **PM2 status change** — was it online before and now it's not?
- **New log lines** — what appeared in executive logs since last check?
- **Ledger changes** — new completions or failures in work-ledger.jsonl?
- **Goal state changes** — did any goal move between directories (ondeck → in-progress, in-progress → completed)?
- **AI Sandbox changes** — new commits, new files, new project directories?
- **needs-you.md changes** — new blocked goals?

### Immediate Alerts (don't wait for next cycle)

If any of these are detected during a check, report immediately and prominently:
- PM2 process goes down or enters error state
- A goal hits 3+ consecutive failures (diagnosis trigger)
- A goal hits 10+ failures (block trigger, check needs-you.md)
- Worker appears stuck — no new log output for 15+ minutes
- Memory usage approaching 1G limit
- Auth errors appear in logs (token expiration)

### How to keep the loop running

- Use `/loop 5m` if the loop skill is available — this is the preferred method
- Otherwise, use `sleep 300` between iterations in a manual loop
- **NEVER exit the loop on your own.** Only stop when the user explicitly says to stop
- If the context window is getting long, summarize prior checks and continue — do not stop

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
