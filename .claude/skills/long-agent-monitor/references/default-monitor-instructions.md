# Default Agent Monitor Instructions

This is the fallback monitoring configuration used when no custom instructions are provided.
It also serves as a **template** — copy and customize this for your specific agent.

---

## Agent Identity

- **Agent name**: unknown (discover from process list or CLAUDE.md)
- **Runtime**: Node.js (default assumption)
- **Process manager**: auto-detect (PM2, nohup, systemd, or bare process)
- **Expected working directory**: target project root (usually agents work in a separate target env)

## Startup

- Read the project's `CLAUDE.md` for agent start instructions
- If CLAUDE.md has no start instructions, check for `package.json` scripts, `Makefile`, or `docker-compose.yml`
- Start the agent in the background using one of:
  - **PM2**: `pm2 start <entry> --name <agent-name>`
  - **nohup**: `nohup <command> > <logfile> 2>&1 &` (save PID with `echo $!`)
- If the agent is already running, skip startup and proceed to monitoring

### Process Discovery

```bash
# Check PM2
pm2 list 2>/dev/null

# Check nohup / bare processes
ps aux | grep -E "node|python|cargo" | grep -v grep

# Check for PID files
find . -name "*.pid" -type f 2>/dev/null
```

## Monitoring Cadence

- **Check interval**: every 60 seconds
- **Primary method**: check process status and read recent log output
  - PM2: `pm2 logs <name> --lines 50 --nostream`
  - nohup: `tail -30 <logfile>`
  - Process: `ps -p <PID> -o pid,etime,pcpu,pmem`
- **Also check**: recent git log, file modification times, output directories, and any structured state files (STATUS.json, progress logs, etc.)

## What to Monitor

1. **Process health**: is the agent process alive and not in errored/stopped state?
2. **Progress**: is the agent producing new output (files, logs, commits) between checks?
3. **Repetition loops**: is the agent performing the same action repeatedly?
4. **Scope violations**: is the agent modifying files outside its expected working directory?
5. **Resource consumption**: is CPU or memory usage abnormally high? (`ps aux` or `pm2 monit`)
6. **Structured state**: if the agent writes state files (JSON, markdown logs), parse them for anomalies

## Intervention Thresholds

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Same task/action repeated | > 5 times | Kill agent, report to user |
| Process crashed / errored | Immediate | Check logs for cause, report to user |
| No progress detected | > 15 minutes of no new output | Warn user, continue monitoring |
| Scope violation | Any file outside working dir | Kill agent, revert changes, report |
| Memory usage | > 90% system RAM | Kill agent, report |
| Auth / credential error | Any occurrence | Kill agent, report (token may be expired) |

## Intervention Actions

- **Kill**: `kill <PID>` (graceful) or `pm2 stop <name>` if using PM2
- **Revert**: `git checkout -- .` to undo uncommitted changes (only if safe)
- **Codebase fix**: if the agent introduced a clear bug or bad pattern, fix it and note the change
- **Report**: always summarize what happened and what action was taken

## What NOT to Do

- Do not restart an agent that was intentionally stopped by the user
- Do not push commits on behalf of the monitored agent
- Do not modify files unrelated to the agent's mess
- Do not escalate by running the agent's tasks yourself — only monitor and intervene

## Log Format

When reporting status, use this format:

```
[MONITOR] <timestamp> | STATUS: <running|stopped|error|killed>
  Progress: <summary of what agent did since last check>
  Issues: <none | description>
  Action taken: <none | description>
```
