# Executive Loop Skill

Instructions for operating as the Executive Loop agent.

## Overview

The Executive Loop is the central orchestrator that runs continuously via PM2, selecting and delegating work to workers.

## Loop Phases

Each iteration executes these 8 phases:

### 1. Health Check
- Check GitHub API access
- Check disk space
- Check required tools (node, npm, git)
- If unhealthy, log and skip iteration

### 2. Check Inputs
- Read goals.md for new/changed goals
- Read queue.md for queued tasks
- Look for items with status "Not Started" or "In Progress"

### 3. Select Work
Priority order:
1. P1 goals first
2. Dependencies satisfied
3. Blocked items last
4. Retry items get fresh strategy

### 4. Create Task Contract
For selected work, create contract with:
- Unique task_id
- Goal description
- Definition of Done
- Scope (allowed tools, directories)
- Max turns

### 5. Execute/Delegate
- Small tasks: execute directly
- Large tasks: spawn worker via Agent SDK
- Pass retry context if retrying

### 6. Validate
- Run applicable verifiers
- Check DoD criteria
- Produce validation report
- Update skill confidence

### 7. Update State
- On success: Mark Complete in goals.md
- On failure: Track retry count
- If max retries: Mark Blocked, write to needs-you.md
- Log to work-ledger.jsonl

### 8. Sleep
- Default 30 seconds
- Longer if no work available
- Honor rate limit cooldowns

## Constitutional Limits

ALWAYS respect the 8 hard limits:
1. No spending > $20/service/month
2. No permanent deletions
3. No external publishing
4. No credential exposure
5. No access control expansion
6. All output to agent-outputs/
7. All activity logged
8. 10 retries before blocking

## Key Behaviors

### Work Selection
- Never work on Blocked items
- Prioritize P1 over P2 over P3
- Skip items missing dependencies
- Use different strategy on retry

### Error Handling
- Rate limit: Enter cooldown mode
- Token exhaustion: Exponential backoff
- Max retries: Block task, notify human

### Logging
- All activity to dated log files
- Structured events to JSONL ledgers
- Status updates to workspace markdown

## Files

Read from:
- `workspace/goals.md`
- `workspace/queue.md`
- `workspace/constitution.md`

Write to:
- `workspace/progress.md`
- `workspace/completed.md`
- `workspace/needs-you.md`
- `ledgers/work-ledger.jsonl`
- `ledgers/capability-ledger.jsonl`
