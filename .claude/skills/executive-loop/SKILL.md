---
name: Executive Loop
description: |
  Central orchestrator running continuously via PM2 to select and delegate work. Use when operating as the main executive agent, running the 8-phase loop (health, inputs, selection, contract, execute, validate, update, sleep), delegating tasks to workers, managing retry logic, or enforcing constitutional limits. Entry point for continuous agent operation.
---

# Executive Loop

Central orchestrator that runs continuously, selecting and delegating work to workers.

## Loop Phases

1. **Health check** - Verify GitHub API, disk space, tools (node, npm, git)
2. **Check inputs** - Read goals.md and queue.md for work items
3. **Select work** - Pick highest priority eligible item (P1 > P2 > P3)
4. **Create contract** - Build task contract with goal, DoD, scope, max_turns
5. **Execute/delegate** - Small tasks: execute directly. Large: spawn worker
6. **Validate** - Run verifiers, check DoD, produce validation report
7. **Update state** - Mark Complete or track retry. Block after 10 retries
8. **Sleep** - Default 30s. Honor rate limit cooldowns

## Constitutional Limits

Always respect the 8 hard limits from `workspace/constitution.md`:
1. No spending > $20/service/month
2. No permanent deletions
3. No external publishing
4. No credential exposure
5. No access control expansion
6. All output to agent-outputs/
7. All activity logged
8. 10 retries before blocking

## Key Files

Read: `workspace/goals.md`, `workspace/queue.md`, `workspace/constitution.md`
Write: `workspace/progress.md`, `workspace/needs-you.md`, `ledgers/*.jsonl`
