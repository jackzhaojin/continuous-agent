---
paths:
  - "src/core/executive-loop.ts"
---

# Executive Loop Details

The loop runs continuously in PM2 with these phases:

1. **Phase 0.5** -- Check inbox (Gmail, opt-in via `IDENTITY_ENABLED` + `GMAIL_ENABLED`)
2. **Phase 1** -- Health check: GitHub auth, disk space, dependencies; regenerates `goals.md` index from bundles
3. **Phase 2** -- Process inputs: parse human responses from `needs-you.md`, ingest `queue.md` as P3 draft bundles
4. **Phase 3** -- Select work: scan goal bundles by priority (P0 > P1 > P2 > P3 > P4), falls back to legacy `goals.md`
5. **Phase 3b** -- Auto-breakdown: LLM call generates 2-5 steps for goals >100 estimated turns
6. **Phase 4** -- Execute: resolve execution pattern, spawn Agent SDK worker (30-min wall-clock timeout)
7. **Phase 5** -- Validate: run verifiers on `result.output_path` (worker's dir, NOT agent infrastructure)
8. **Phase 6** -- Update state: goal bundles, STEPS.json, needs-you.md, ledgers, Notion, Discord
9. **Phase 7** -- Agentic diagnosis after 3+ failures (analyze root cause, decide retry vs escalate)
10. **Phase 8** -- Block after 10 failures, write to `needs-you.md`, continue other work

**Sleep logic:**
- `work_completed` or `work_failed`: continue immediately
- `no_work`: sleep 30s
- `unhealthy`: sleep 60s
- Rate limit cooldown: sleep 60s

**Startup cleanup:** Resets stale in-progress steps and cleans up orphan workers.

**Env loading order:** `.env.executive` (precedence) -> `.env.worker` (new keys) -> `.env` (legacy fallback).
