---
name: long-agent-monitor
description: Monitor long-running AI agents (5+ hours or 24/7) to ensure they stay on track. Use when the user says "monitor agent", "watch the agent", "check on the agent", or wants to supervise an autonomous agent process. Handles agent startup (via CLAUDE.md or custom instructions), continuous progress monitoring, loop detection, and intervention (kill, revert, fix) when an agent behaves unexpectedly. Accepts custom monitor instructions as args or prompts the user for them. This skill is specifically for long-running deterministic-loop processes that run headless AI coding clients (Claude Code, Codex CLI, aider, etc.) — either 24/7 persistent agents or multi-hour harnesses executing sequential agentic task pipelines. Do NOT use for short one-off agent runs or non-agentic processes.
---

# Long Agent Monitor

Monitor long-running autonomous agents to ensure they execute successfully, detect failures and loops, and intervene when necessary.

This skill is for **long-running deterministic-loop processes** that run headless AI coding clients — Claude Code, Codex CLI, aider, or similar. The monitored process is either:
- A **24/7 persistent agent** cycling through work continuously, or
- A **long-running harness** (5+ hours) executing a sequence of agentic tasks in a pipeline

Do NOT use this skill for short one-off agent runs or non-agentic processes.

## Step 1: Obtain Monitor Instructions

Custom monitor instructions are critical for effective monitoring. They define what the agent does, how to check progress, and when to intervene.

**Check for custom instructions in this order:**

1. **Args provided** — if the user passed a file path or inline instructions as args, use those
2. **Project root file** — look for `monitor-instructions.md` in the project's root directory (the agent's working directory or harness directory). If found, use it automatically and inform the user.
3. **Ask the user** — if no args and no project file found, ask:

> This skill works best with custom monitor instructions tailored to your agent. These instructions tell me:
> - How to start the agent (or where it's already running)
> - What "progress" looks like (new files, logs, commits, API calls)
> - What "gone wrong" looks like (specific errors, forbidden actions)
> - What I'm allowed to do if things go wrong (kill, revert, fix code)
>
> Do you have a monitor instructions file (markdown), or can you describe these?
> You can use `references/default-monitor-instructions.md` in this skill as a starting template.

4. **User declines or gives nothing** — use the defaults at [references/default-monitor-instructions.md](references/default-monitor-instructions.md). Inform the user:

> Using default monitor instructions. These assume PM2, check every 60s, and will kill the agent if it repeats the same action 11+ times. For better monitoring, provide custom instructions next time.

Read the monitor instructions file into context before proceeding.

## Step 2: Start or Locate the Agent

Determine whether the agent needs to be started or is already running.

**Agent already running?**
- Check `ps aux | grep <expected-process-pattern>` for running processes
- Check `pm2 list` if PM2 is available
- Check for PID files or nohup processes
- If found, skip to Step 3

**Agent needs to start?**
- Follow startup instructions from the monitor instructions file
- If monitor instructions say "read CLAUDE.md", read the project's CLAUDE.md for start commands
- **CRITICAL: The agent process MUST be started independently of the Claude Code session.** If the agent runs as a foreground child process of Claude Code (e.g., via `Bash` tool without backgrounding), it will die when the Claude session ends, times out, or is interrupted. This defeats the purpose of long-running monitoring.
  - **If PM2 is available**, always use `pm2 start` — this is the preferred method. PM2 keeps the process alive across session disconnects and provides built-in log management.
  - **If PM2 is not available**, use `nohup <command> > output.log 2>&1 &` or `setsid` to fully detach the process from the terminal session.
  - **Never** use the Bash tool's `run_in_background` parameter as the primary launch method — that background task is still tied to the Claude session and will be killed when the session ends.
- Verify the process started successfully before proceeding (check `pm2 list`, `ps aux`, or the PID file)

## Step 3: Discover Agent Behavior

Before monitoring, understand what the agent is doing:

1. Read the monitor instructions for expected behavior
2. If not documented, inspect:
   - Recent PM2 logs (`pm2 logs <name> --lines 100 --nostream`)
   - Recent git log for commits by the agent
   - Recently modified files (`find . -mmin -5 -type f`)
   - Output directories for new artifacts
3. Establish a baseline: what does "normal progress" look like for this agent?

## Step 4: Monitor Loop

Run a continuous monitoring loop. Each iteration:

1. **Check process health** — is the agent alive? (`pm2 describe <name>` or `ps`)
2. **Check progress** — compare current state to last check:
   - New log lines
   - New or modified files
   - New git commits
   - Changed process metrics (CPU, memory)
3. **Detect anomalies** against thresholds from monitor instructions:
   - **Repetition loop** — same action/task repeated beyond threshold (default: 11 times)
   - **Stalled** — no new output for extended period
   - **Scope violation** — changes outside expected directories
   - **Resource spike** — abnormal CPU/memory usage
   - **Error state** — process crashed or entered error state
4. **Report status** using the log format from monitor instructions
5. **Sleep** for the configured interval (default: 60 seconds)

Use `sleep` between checks. This is a long-running monitoring task — expect to run for hours.

## Step 5: Intervene When Necessary

When an anomaly exceeds thresholds:

1. **Kill the agent** — stop the process (`pm2 stop <name>`)
2. **Assess damage** — check what the agent changed since last known-good state
3. **Revert if needed** — `git checkout -- .` for uncommitted changes, or targeted reverts
4. **Fix if needed** — if the agent introduced a clear bug, fix it
5. **Report to user** — summarize what happened, what was detected, and what action was taken

After intervention, **do not restart the agent automatically**. Wait for user instructions.

## Important Constraints

- **Never spawn Task/SubAgent processes** — all monitoring, checking, and intervention must execute directly in the main context window. Do not use the Task tool to delegate any part of this skill (monitoring loops, log reading, process checks, interventions, etc.) to a subagent. This skill requires persistent state and continuity that only the main context provides.
- Never push commits on behalf of the agent
- Never take over the agent's tasks — only monitor and intervene
- Never restart an agent that the user intentionally stopped
- Always report interventions to the user before taking further action
- If unsure whether to intervene, ask the user rather than acting
