# Continuous Executive Agent — Monitor Instructions

Custom monitoring instructions for the 24/7 autonomous executive agent running via PM2.

---

## Agent Identity

- **Agent name**: `executive-loop`
- **Runtime**: Node.js (ES modules, TypeScript compiled to `dist/`)
- **Process manager**: PM2 (ecosystem.config.cjs)
- **Working directory**: `/Users/jackjin/dev/continuous-agent`
- **Worker output directory**: `/Users/jackjin/dev/agent-outputs`
- **Nature**: 24/7 persistent agent — continuously selects, executes, and validates work. Never "finishes" — it idles when the queue is empty, then resumes when new goals appear.
- **Human communication channel**: `workspace/needs-you.md` — this is how the agent (and you, the monitor) communicate with the human owner asynchronously. The human checks this file periodically and responds inline.

**IMPORTANT — This is a continuously running autonomous executive agent, not a script or a harness.** It makes its own decisions about what to work on, how to retry failures, and when to escalate. It already has a built-in mechanism to ask the human for help (`needs-you.md`). Your job as monitor is to catch issues the agent *cannot* catch itself (process crashes, scope violations, systemic failures) and to use the same `needs-you.md` channel to notify the human when you intervene or observe something concerning.

## Startup

### Starting the Agent

```bash
cd /Users/jackjin/dev/continuous-agent

# Build first (required after code changes)
npm run build

# Start with PM2
pm2 start ecosystem.config.cjs

# Verify it started
pm2 describe executive-loop
```

### Checking if Already Running

```bash
pm2 describe executive-loop 2>/dev/null | head -20
```

If status shows `online`, skip startup. If `stopped` or `errored`, investigate logs before restarting.

### Restarting After Code Changes

```bash
cd /Users/jackjin/dev/continuous-agent
npm run build
pm2 restart executive-loop
```

**CAUTION:** Only restart if the agent is idle or between iterations. Restarting mid-task kills the worker. Check `pm2 logs executive-loop --lines 5 --nostream` — if you see a recent `PHASE 4: Execute Work` without a corresponding Phase 5/6, the agent is mid-task.

## Key Files to Monitor

All monitoring state lives in two directories:

### Ledgers (`ledgers/`)

| File | What It Tells You | Check Frequency |
|------|-------------------|-----------------|
| `ledgers/executive-{date}.log` | Full iteration log — phases, decisions, errors | Every check |
| `ledgers/work-ledger.jsonl` | Structured task events (STARTED, COMPLETED, BLOCKED) | Every check |
| `ledgers/capability-ledger.jsonl` | Capability pass/fail with confidence scores | Occasional |
| `ledgers/pm2-combined.log` | PM2-level stdout (includes all console output) | On anomaly |
| `ledgers/pm2-error.log` | PM2-level stderr (crashes, unhandled rejections) | On anomaly |
| `ledgers/{date}/worker-{contract-id}.log` | Individual worker session logs | When investigating task |

### Workspace (`workspace/`)

| File/Dir | What It Tells You | Check Frequency |
|----------|-------------------|-----------------|
| `workspace/ondeck/` | Goals queued for auto-promotion | Every check |
| `workspace/in-progress/P{0-4}/` | Active goals by priority tier | Every check |
| `workspace/blocked/` | Goals that hit 10 retries | Every check |
| `workspace/archive/` | Completed/cancelled goals | Occasional |
| `workspace/needs-you.md` | Items awaiting human input | Every check |

### Worker Output Directory (`agent-outputs/`)

The agent writes ALL project output to `/Users/jackjin/dev/agent-outputs/`. This is a **separate git repo** from the agent itself. Workers create isolated project directories here — never in the agent codebase (Constitution Article I, Section 6).

**Directory structure:**
```
agent-outputs/
├── .git/                         # Its own git repo
├── README.md
└── projects/
    ├── {category}/               # nextjs, react, node, misc, python
    │   └── {date}/               # 2026-01-28
    │       └── {task-slug}/      # e.g. 1769398504453
    │           ├── .git/         # Each project has its own git repo
    │           ├── package.json
    │           ├── src/
    │           └── ...
```

**What to verify in agent-outputs:**

| Check | How | What It Means |
|-------|-----|---------------|
| New project dirs appearing | `find projects/ -maxdepth 3 -type d -mmin -30` | Agent is creating worker outputs |
| Each project has `.git/` | `ls projects/{cat}/{date}/{slug}/.git` | Worker initialized git properly |
| Git has commits | `cd <project> && git log --oneline -5` | Worker is committing its work |
| Recent commits have substance | `cd <project> && git diff --stat HEAD~1` | Commits aren't empty |
| No files outside projects/ | `git -C /Users/jackjin/dev/agent-outputs status` | No scope violations |

**CRITICAL — Priority check:** After the agent completes a task (work-ledger shows `TASK_COMPLETED`), verify the `output_path` from the ledger entry actually exists and contains a git repo with commits. This is the single most important indicator that the agent is producing real work.

**The exception — self-enhancement tasks:** Tasks prefixed `[SELF-ENHANCE]` write to the `continuous-agent/` codebase instead of `agent-outputs/`. These create branches like `self-enhance/{slug}` in the agent repo. This is expected and not a scope violation.

## Monitoring Cadence

- **Check interval**: every 5 minutes
- **Deep audit**: every 30 minutes

### Quick Check Script

```bash
# 1. Process alive?
pm2 describe executive-loop --no-color 2>/dev/null | grep -E "status|uptime|restarts"

# 2. Recent executive log (last 30 lines)
tail -30 /Users/jackjin/dev/continuous-agent/ledgers/executive-$(date +%Y-%m-%d).log

# 3. Recent work events
tail -5 /Users/jackjin/dev/continuous-agent/ledgers/work-ledger.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    d = json.loads(line.strip())
    print(f\"{d.get('ts','?')[:19]}  {d.get('event','?'):20s}  {d.get('title','?')[:50]}  {d.get('output_path','')[:60]}\")
"

# 4. Goal pipeline state
echo "=== Ondeck ===" && ls /Users/jackjin/dev/continuous-agent/workspace/ondeck/ 2>/dev/null | grep -v .gitkeep
echo "=== In Progress ===" && find /Users/jackjin/dev/continuous-agent/workspace/in-progress -name "PROMPT.md" -exec dirname {} \; 2>/dev/null
echo "=== Blocked ===" && ls /Users/jackjin/dev/continuous-agent/workspace/blocked/ 2>/dev/null | grep -v .gitkeep
echo "=== Archive ===" && ls /Users/jackjin/dev/continuous-agent/workspace/archive/ 2>/dev/null | grep -v .gitkeep

# 5. needs-you.md (any blocking items?)
grep -E "BLOCKING|HIGH" /Users/jackjin/dev/continuous-agent/workspace/needs-you.md 2>/dev/null || echo "No blocking items"

# 5b. Step progress for active multi-step tasks
echo "=== Step Progress ==="
find /Users/jackjin/dev/continuous-agent/workspace/in-progress -name "PROMPT.md" 2>/dev/null | while read f; do
  slug=$(basename $(dirname "$f"))
  steps_total=$(grep -c "^### Step" "$f" 2>/dev/null || echo 0)
  steps_done=$(grep -ci "Status.*Complete" "$f" 2>/dev/null || echo 0)
  if [ "$steps_total" -gt 0 ]; then
    echo "  $slug: $steps_done/$steps_total steps complete"
  fi
done

# 6. Agent-outputs: recent project directories and git activity
echo "=== Recent Worker Outputs ==="
find /Users/jackjin/dev/agent-outputs/projects -maxdepth 3 -type d -mmin -60 2>/dev/null | sort
echo "=== Git commits in newest project ==="
NEWEST=$(find /Users/jackjin/dev/agent-outputs/projects -maxdepth 3 -name ".git" -type d -mmin -60 2>/dev/null | head -1 | sed 's/\/.git$//')
if [ -n "$NEWEST" ]; then
  echo "Project: $NEWEST"
  git -C "$NEWEST" log --oneline -5 2>/dev/null
  echo "Files:"
  git -C "$NEWEST" diff --stat HEAD~1 2>/dev/null || echo "(single commit)"
else
  echo "No projects modified in last 60 min"
fi

# 7. Agent-outputs repo-level status (scope violation check)
echo "=== agent-outputs repo status ==="
git -C /Users/jackjin/dev/agent-outputs status --short 2>/dev/null | head -10
```

## What Normal Progress Looks Like

### Healthy Iteration Pattern — Simple Task (No Breakdown)

Each loop iteration produces log output following this sequence:

```
================================================================================
ITERATION N
================================================================================
⚙️ [DETERMINISTIC] PHASE 1: Health Check
  Health: healthy
  ✓ github-cli: GitHub CLI authenticated
  ✓ disk-space: Disk usage: XX% used
  ✓ node-version: Node.js vXX.X.X
  ✓ reference-integrity: ...

🤖 [AGENTIC] PHASE 2: Process Human Inputs

🤖 [AGENTIC] PHASE 3: Select Work (Priority: P0 > P1 > P2 > P3 > P4)
🤖 [AGENTIC] Selected TASK: [P3] Some Task Title
  Complexity estimate: 75 turns (below breakdown threshold)

🤖 [AGENTIC] PHASE 4: Execute Work (Agent SDK Worker)

🤖 [AGENTIC] PHASE 5: Validate Work
  Verifier results: N passed, 0 failed
🤖 [AGENTIC]   ✓ All verifiers passed

⚙️ [DETERMINISTIC] PHASE 6: Update State (Success)
⚙️ [DETERMINISTIC] Continue immediately (more work may be available)
```

### Healthy Iteration Pattern — Complex Task (Auto-Breakdown + Step Execution)

When a task exceeds the complexity threshold (>100 estimated turns), Phase 3b auto-breaks it into steps. The agent then executes one step per iteration:

```
================================================================================
ITERATION N (first encounter with complex task)
================================================================================
🤖 [AGENTIC] PHASE 3: Select Work
🤖 [AGENTIC] Selected TASK: [P3] Full-Stack Music Player Platform
🤖 [AGENTIC] PHASE 3b: Auto-Breakdown
  Estimated complexity: 225 turns (threshold: 100)
  Generated 8 steps for "Full-Stack Music Player Platform"
  Steps written to PROMPT.md — re-selecting to execute step 1
  Re-selected: Step 1/8: Research existing patterns and plan approach

🤖 [AGENTIC] PHASE 4: Execute Work (Step 1 of 8)
... worker runs ...

⚙️ [DETERMINISTIC] PHASE 6: Update State (Success)
  ✓ Step 1 complete
  Updated step 1 status to "complete" in PROMPT.md
  7 steps remaining
⚙️ [DETERMINISTIC] Continue immediately (more work may be available)

================================================================================
ITERATION N+1 (continues same task, next step)
================================================================================
🤖 [AGENTIC] PHASE 3: Select Work
🤖 [AGENTIC] Selected STEP: [P3] Full-Stack Music Player Platform — Step 2/8: Initialize project with Next.js

🤖 [AGENTIC] PHASE 4: Execute Work (Step 2 of 8)
...
```

**Key things to watch in step execution:**
- After Phase 3b, work-ledger should log `TASK_BREAKDOWN` event
- Each step completion logs `STEP_COMPLETED` to work-ledger
- PROMPT.md body should show step status updates (Pending → Complete)
- When ALL steps complete, the task itself is marked complete (`TASK_COMPLETED`)
- All steps share the SAME `output_path` — no duplicate project directories

### Normal Idle Pattern

When no work is available, the agent sleeps 30s (or 60s in dev) between polls:

```
🤖 [AGENTIC] PHASE 3: Select Work
🤖 [AGENTIC]   No work available in queue
🤖 [AGENTIC]   Checking for self-improvement opportunities...
🤖 [AGENTIC]   No self-improvement triggers ready
⚙️ [DETERMINISTIC] No work available - sleeping 30s
```

### Normal Goal Lifecycle

1. Goal appears in `workspace/ondeck/{slug}/PROMPT.md`
2. `goal-scanner.ts` auto-promotes it to `workspace/in-progress/P{n}/{slug}/` (based on priority field)
3. Agent selects it in Phase 3
4. **If complex (>100 est. turns):** Phase 3b auto-breaks into steps, writes `## Steps` to PROMPT.md
5. Agent executes work (full task or one step at a time) in Phase 4
6. On success: PROMPT.md frontmatter set to `status: complete` (stays in `in-progress/P{n}/`)
7. On max failure (10 retries): bundle directory **moved** to `workspace/blocked/{slug}/`, entry added to `needs-you.md`
8. On human unblock: bundle directory **moved back** from `blocked/` to `in-progress/P{n}/`

### Normal Multi-Step Task Lifecycle

1. Task selected → Phase 3b estimates complexity → generates 4-9 steps
2. Steps written to PROMPT.md body as `## Steps` section with `- **Status:** Pending`
3. `TASK_BREAKDOWN` event logged to work-ledger
4. Agent re-selects to get Step 1, executes it
5. On step success: step status updated to `Complete` in PROMPT.md body, `STEP_COMPLETED` logged
6. Next iteration: agent selects next pending step (same task, same output directory)
7. Repeat until all steps complete → task marked complete, `TASK_COMPLETED` logged
8. If a step fails 10 times: step and task marked `blocked`, bundle moved to `blocked/`

### Normal Rate Limit Handling

Occasional rate limits are expected. The agent handles them with exponential backoff:

```
⚙️ [DETERMINISTIC] RATE LIMIT ERROR DETECTED
[Backoff] Entering cooldown #1 until <timestamp>
⚙️ [DETERMINISTIC] Rate limit cooldown active - sleeping 60s
```

Backoff doubles each time: 1min → 2min → 4min → 8min → ... → capped at 1hr. Resets on next successful work.

## What Abnormal Looks Like

### PM2 Restart Loop

```bash
pm2 describe executive-loop | grep restarts
```

If `restarts` count is climbing, the process is crashing on startup. Check:
```bash
tail -50 /Users/jackjin/dev/continuous-agent/ledgers/pm2-error.log
```

Common causes: missing env vars, TypeScript compilation error (stale `dist/`), missing `node_modules`.

### Stuck on Same Task (Retry Storm)

Log shows the same task name appearing in Phase 3/4 repeatedly:

```
ITERATION 15 → Selected TASK: [P3] Music Player UI
ITERATION 16 → Selected TASK: [P3] Music Player UI
ITERATION 17 → Selected TASK: [P3] Music Player UI
...
```

With `PHASE 6: Update State (Failure)` each time. This is normal up to 10 retries (Constitution mandate). Becomes abnormal if:
- Strategy selection is repeating the same approach (check for `[AGENTIC] Decision: Apply suggested fix` vs same error each time)
- Retry count exceeds 10 without blocking (state bug)

### Escalating Rate Limits

Multiple consecutive cooldowns with increasing backoff:

```
[Backoff] Entering cooldown #1 ... 60s
[Backoff] Entering cooldown #2 ... 120s
[Backoff] Entering cooldown #3 ... 240s
[Backoff] Entering cooldown #4 ... 480s
```

If it reaches cooldown #5+ (16+ min), the API key may be hitting plan limits. Check the Anthropic dashboard.

### Health Check Failures

```
Health: unhealthy
  ✗ github-cli: GitHub CLI not authenticated
  ✗ disk-space: Disk usage critical: 95% used
```

Agent won't execute work while unhealthy. Sleeps 60s between health rechecks.

### All Tasks Blocked, No Human Response

```bash
# Check if everything is stuck
ls /Users/jackjin/dev/continuous-agent/workspace/blocked/
grep "BLOCKING" /Users/jackjin/dev/continuous-agent/workspace/needs-you.md
```

If `blocked/` has goals and `needs-you.md` has unanswered BLOCKING items, the agent is idling because it has nothing to do. Human must respond in `needs-you.md` or add new goals to `ondeck/`.

### Worker Creates No Output

Phase 4 starts but Phase 5 shows:

```
No output path to validate
```

The spawned worker produced nothing. Check the worker log:
```bash
ls -lt /Users/jackjin/dev/continuous-agent/ledgers/$(date +%Y-%m-%d)/worker-*.log | head -1
# Read the most recent worker log
```

Common causes: OAuth token expired, worker hit its own rate limit, worker crashed early.

### Worker Output Exists but Has No Git History

The project directory exists at the `output_path` but has no `.git/` or no commits:

```bash
# Check a specific project
ls <output_path>/.git       # Should exist
git -C <output_path> log    # Should have commits
git -C <output_path> diff --stat HEAD~1  # Should show real file changes
```

If the directory exists but git is empty or missing, the worker started but didn't commit its work. The verifier (`git_status_clean`) should have caught this — if the task was marked COMPLETED anyway, there's a validation bug.

### Step Not Progressing (Stuck on Same Step)

For multi-step tasks, the agent should advance through steps across iterations. If the log shows the same step number repeatedly:

```
ITERATION 5 → Selected STEP: [P3] Music Player — Step 3/8: Database schema
ITERATION 6 → Selected STEP: [P3] Music Player — Step 3/8: Database schema
ITERATION 7 → Selected STEP: [P3] Music Player — Step 3/8: Database schema
```

This means Step 3 is failing and being retried. Check:
- Work-ledger for `STEP_ATTEMPT_FAILED` events on that step
- The worker log for the specific error
- PROMPT.md to verify previous steps show `Status: Complete` (if not, step persistence may be broken)

This is normal up to 10 retries per step. After 10, the step and task should be marked blocked.

### Step Status Not Persisting (Re-Executing Completed Steps)

If the agent re-selects Step 1 after it was already completed, step status persistence is broken:

```
ITERATION 5 → Step 1 complete → 7 steps remaining
ITERATION 6 → Selected STEP: Step 1 (should be Step 2!)
```

Check the PROMPT.md body — if completed steps still show `- **Status:** Pending`, the `updateStepStatusInPromptMd()` function is failing. This is a **HIGH** severity bug — the agent will loop on the same step forever.

### Agent-Outputs Growing Without Structure

```bash
du -sh /Users/jackjin/dev/agent-outputs/projects/*/
```

If one category (e.g., `misc/`) is growing rapidly with many small directories, the agent may be creating new project dirs for retries of the same task instead of reusing the `output_path`. Check the executive log for `(resuming)` — retry attempts should show the existing output path, not create new ones.

## Intervention Philosophy

**ALWAYS TRIAGE FIRST. Never kill the agent as a first response.**

The agent is doing real work. Killing it mid-task wastes a worker session and loses in-flight progress. The default response to any anomaly is: **diagnose → understand → fix if possible → only then restart**. The only exception is active, ongoing harm (scope violations, credential exposure).

### Severity Levels

**CRITICAL (kill immediately)** — The agent is actively causing damage right now:
- Writing files outside `agent-outputs/` (scope violation)
- Credential exposure in logs or commits
- Runaway disk usage about to fill the drive

For CRITICAL issues: `pm2 stop executive-loop`, then assess damage, revert if needed, report to user.

**HIGH (diagnose first, then act)** — Something is broken but not causing active harm:
- PM2 restart loop (process crashing on startup)
- Auth errors (401/403) — agent can't do work but isn't breaking anything
- Process dead/errored

For HIGH issues: read logs, identify root cause, fix the issue, THEN restart. Never restart without understanding why it failed.

**MEDIUM (monitor and report)** — Suboptimal behavior, agent is safe to keep running:
- Same task failing repeatedly (agent has its own 10-retry limit)
- Rate limit cooldowns escalating
- Completed task has no output or empty git
- No progress for extended period with goals available

For MEDIUM issues: report to user with diagnosis. The agent may self-correct (rate limits cool down, retries eventually block the task). Only intervene if the issue persists across multiple check intervals.

**LOW (informational)** — Note and continue:
- All tasks blocked awaiting human input
- Disk usage climbing but not critical
- Duplicate project dirs for same task

### Intervention Thresholds

| Condition | Severity | Action |
|-----------|----------|--------|
| Worker scope violation | CRITICAL | Stop agent, revert changes, report |
| Credential in logs/commits | CRITICAL | Stop agent, scrub credential, report |
| Disk > 95% full | CRITICAL | Stop agent, clean up, report |
| PM2 restart loop (> 5 in 10 min) | HIGH | Read pm2-error.log, fix root cause, then restart |
| Process dead / errored | HIGH | Read logs for cause, fix, then restart |
| Auth error (`401`, `403`, `EAUTH`) | HIGH | Diagnose (token expired?), fix, then restart |
| Same task failing > 10 times | MEDIUM | Check if auto-block worked; report if not |
| Rate limit cooldown #6+ | MEDIUM | Report — likely API plan limit, agent will self-manage |
| No progress > 30 min (goals exist) | MEDIUM | Check executive log for stuck phase, report |
| Completed task has no output | MEDIUM | Report — possible validation bug |
| Completed task has empty git | MEDIUM | Report — worker started but didn't build |
| Step status not persisting | HIGH | Report — agent will re-execute completed steps forever |
| Same step failing > 10 times without blocking | MEDIUM | Check if auto-block worked; report if not |
| Multi-step task creating duplicate project dirs | MEDIUM | All steps should reuse same output_path |
| Duplicate project dirs | LOW | Report — retry resume logic may be broken |
| All tasks blocked | LOW | Report — human needs to respond in needs-you.md |
| Disk > 90% | LOW | Report — agent-outputs may be filling up |

### Intervention Actions

**Triage sequence (follow this order for every issue):**

1. **Diagnose** — Read relevant logs. Understand what happened and why.
   - `tail -50 ledgers/executive-$(date +%Y-%m-%d).log`
   - `tail -50 ledgers/pm2-error.log`
   - `tail -5 ledgers/work-ledger.jsonl`
2. **Assess scope** — Is the agent actively causing harm, or just failing at work?
   - `git -C /Users/jackjin/dev/agent-outputs status --short`
   - `git -C /Users/jackjin/dev/continuous-agent status --short`
3. **Fix if possible** — Address the root cause before restarting.
   - Rebuild: `cd /Users/jackjin/dev/continuous-agent && npm run build`
   - Revert agent changes: `git checkout -- .` (only if agent corrupted its own code)
   - Check worker damage: `cd /Users/jackjin/dev/agent-outputs && git status && git diff --stat`
4. **Restart only after fix** — `pm2 restart executive-loop` (only when you've confirmed the fix)
5. **Notify the human via needs-you.md** — Write a row to the Actions Needed table so the human sees it on their next check. This is the primary notification channel.

**If you cannot diagnose or fix the issue**, stop the agent (`pm2 stop executive-loop`) and notify the human via `needs-you.md` with full context. Do not restart into the same failure.

### How to Write to needs-you.md

The human communication channel is `workspace/needs-you.md`. When you need to notify the human about a monitor finding, add a row to the **Actions Needed** table:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
| [MONITOR] <description> | <what you found and did> | | BLOCKING | <date> |
```

**Examples:**

```markdown
| [MONITOR] Agent killed — scope violation detected | Worker wrote files to continuous-agent/ instead of agent-outputs/. Reverted changes, stopped PM2. Needs investigation before restart. | | BLOCKING | 2026-01-28 |
```

```markdown
| [MONITOR] Rate limits escalating — cooldown #7 | Agent has been in rate limit backoff for 1hr+. May be hitting API plan limits. Agent is still running but barely progressing. | | HIGH | 2026-01-28 |
```

```markdown
| [MONITOR] PM2 restart loop — fixed and restarted | Process was crashing due to stale dist/. Rebuilt with npm run build, restarted PM2. Agent now running normally. | [auto-resolved] | RESOLVED | 2026-01-28 |
```

**Rules for needs-you.md writes:**
- Prefix the Action with `[MONITOR]` so the human knows it came from the monitor, not the agent itself
- Use `BLOCKING` if you stopped the agent and it needs human action before restart
- Use `HIGH` if the agent is running but needs human attention soon
- If you fixed the issue yourself, still log it but mark as `RESOLVED` so the human has a record
- Keep the "Why" column concise but include enough for the human to understand without reading logs

## What NOT to Do

- Do NOT kill the agent as a first response to non-critical issues — triage first
- Do NOT restart PM2 without first understanding why it failed and confirming a fix
- Do NOT restart the agent if the user intentionally stopped it
- Do NOT push commits from either repo (continuous-agent or agent-outputs)
- Do NOT take over building tasks — only monitor and intervene
- Do NOT modify workspace goal files (PROMPT.md bundles) — that's the agent's job
- Do NOT fill in the "Response" column in needs-you.md — only the human responds to the agent's requests
- You CAN add new `[MONITOR]` rows to the Actions Needed table in needs-you.md — that's how you notify the human
- Do NOT modify source code while the agent is running (rebuild + restart needed)
- Do NOT delete ledger files — they're the audit trail

## Log Format

When reporting status checks, use:

```
[MONITOR] <time> | PM2: <online|stopped|errored> | Uptime: <elapsed> | Restarts: <N>
  Iteration: <N> | Last work: <time or "never">
  Pipeline: ondeck=<N> | active=<N> | blocked=<N> | archived=<N>
  Steps: <task-slug> <done>/<total> (if multi-step task active)
  Recent: <last task event from work-ledger>
  Issues: <none | description>
  Action: <none | description>
```

## Deep Audit Checklist (Every 30 min)

**Priority 1 — Is the agent producing real work?**

1. **Agent-outputs git activity** (MOST IMPORTANT): Verify the agent is actually building things.
   ```bash
   # List all project dirs created today
   find /Users/jackjin/dev/agent-outputs/projects -maxdepth 3 -type d -name ".git" 2>/dev/null | while read gitdir; do
     projdir=$(dirname "$gitdir")
     commits=$(git -C "$projdir" rev-list --count HEAD 2>/dev/null || echo 0)
     last=$(git -C "$projdir" log -1 --format='%ar' 2>/dev/null || echo "unknown")
     echo "$projdir — $commits commits, last: $last"
   done
   ```
   - Each completed task MUST have a project directory at its `output_path`
   - Each project MUST have a `.git/` directory with at least 1 commit
   - Commits should have meaningful diffs (not empty or trivial)
   - Cross-reference with work-ledger: every `TASK_COMPLETED` event has an `output_path` — verify that path exists and has git history

2. **Work ledger → output path verification**: For every recent COMPLETED event, confirm the output exists.
   ```bash
   # Get recent completed tasks and check their output paths
   grep '"TASK_COMPLETED"' /Users/jackjin/dev/continuous-agent/ledgers/work-ledger.jsonl | tail -5 | python3 -c "
   import sys, json, os
   for line in sys.stdin:
       d = json.loads(line.strip())
       p = d.get('output_path', '')
       exists = os.path.isdir(p) if p else False
       has_git = os.path.isdir(os.path.join(p, '.git')) if p else False
       print(f\"{d['title'][:40]:40s}  path_exists={exists}  has_git={has_git}  {p}\")
   "
   ```
   If `path_exists=False` or `has_git=False` for a completed task, the agent claimed success but produced nothing — this is a critical issue.

3. **Scope violation check**: Nothing should be written outside `agent-outputs/projects/` (except self-enhance branches in `continuous-agent/`).
   ```bash
   # Check agent-outputs for unexpected top-level changes
   git -C /Users/jackjin/dev/agent-outputs status --short
   # Check continuous-agent for unexpected changes (should be clean unless self-enhancing)
   git -C /Users/jackjin/dev/continuous-agent status --short
   ```

**Priority 2 — Process and pipeline health**

4. **PM2 health**: `pm2 describe executive-loop` — check restarts, memory, uptime
5. **Goal pipeline consistency**:
   - Goals in `in-progress/` should have `status: pending` or `status: in_progress` in PROMPT.md frontmatter
   - Goals in `blocked/` should have `status: blocked` in PROMPT.md frontmatter
   - If a PROMPT.md in `in-progress/` has `status: blocked`, the directory move failed — report this
6. **Step status consistency** (for multi-step tasks):
   - Check PROMPT.md body `## Steps` section — completed steps should show `- **Status:** Complete`
   - Cross-reference with work-ledger: each `STEP_COMPLETED` event should have a matching status in PROMPT.md
   - If a step shows "Pending" in PROMPT.md but `STEP_COMPLETED` exists in ledger, step persistence is broken — report
   - Verify all steps for a task share the same `output_path` (no duplicate project dirs)
   ```bash
   # Check step status in active multi-step tasks
   find /Users/jackjin/dev/continuous-agent/workspace/in-progress -name "PROMPT.md" 2>/dev/null | while read f; do
     if grep -q "^## Steps" "$f"; then
       slug=$(basename $(dirname "$f"))
       echo "=== $slug ==="
       grep -E "^### Step|Status:" "$f"
     fi
   done
   ```
7. **Work ledger integrity**: last STARTED event should have a corresponding COMPLETED or BLOCKED event (unless currently executing). For multi-step tasks, check for `STEP_COMPLETED` events matching the active step.
8. **Needs-you.md**: any unanswered BLOCKING items? If items are old (>1 hour), flag to user

**Priority 3 — Resource and rate health**

9. **Rate limit state**: check if recent log lines show cooldown patterns
10. **Disk usage**: `df -h /Users/jackjin/dev/agent-outputs` — worker outputs can grow large
11. **Memory**: `pm2 describe executive-loop` — check memory usage vs 1G limit
