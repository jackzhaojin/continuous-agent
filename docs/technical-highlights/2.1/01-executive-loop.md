# Technical Highlight 1: The Executive Loop

**File:** [`src/core/executive-loop.ts`](../../../src/core/executive-loop.ts)

## What It Does

The executive loop is the heartbeat of the coding agent. It runs continuously via PM2, executing an 8-phase cycle that finds work, executes it, validates results, and moves on -- all without human prompting.

```
Phase 0.5  Check Inbox (Gmail, opt-in)
Phase 1    Health Check (auth, disk, dependencies)
Phase 2    Process Human Inputs (needs-you.md, queue.md)
Phase 3    Select Work (priority scan: P0 > P1 > P2 > P3 > P4)
Phase 3b   Auto-Breakdown (complex goals -> 2-5 steps via LLM)
Phase 4    Execute (spawn worker agent with contract)
Phase 5    Validate (run verifiers on worker output)
Phase 6    Update State (bundles, ledgers, Notion, Discord)
Phase 7    Agentic Diagnosis (after 3+ failures)
Phase 8    Block & Escalate (after 10 failures -> needs-you.md)
```

## Key Design Decisions

- **Force-march structure**: The loop never stops looking for work. It sleeps only when the queue is empty (30s) or the system is unhealthy (60s).
- **Agentic vs Deterministic split**: Every import in this file is tagged. AI decisions (work selection, strategy, diagnosis) come from `src/agentic/`. Mechanical ops (file I/O, health checks) come from `src/deterministic/`. This separation makes it clear where intelligence lives.
- **Hot reload**: You rebuild with `npm run build` and changes take effect on the next iteration. The current worker continues uninterrupted.

## Talk Points

- The executive never writes code itself -- it's purely an orchestrator
- Each iteration is self-contained: select, execute, validate, update
- The loop is where all the layers (agentic, deterministic, identity, vendor) converge
