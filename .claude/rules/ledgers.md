---
paths:
  - "ledgers/**"
  - "src/deterministic/inputs-log.ts"
  - "src/agentic/learning/**"
---

# Ledger System

All ledgers are **append-only JSONL**. Never truncate or modify existing entries.

## Files

- `ledgers/work-ledger.jsonl` -- Goal events: GOAL_STARTED, GOAL_COMPLETED, GOAL_BLOCKED, STEP_STARTED, STEP_COMPLETED, GOAL_PROMOTED. Each entry includes `contract_id`.
- `ledgers/capability-ledger.jsonl` -- Capability attempts and results with `contract_id`.
- `ledgers/inputs-log.jsonl` -- Human input audit trail (legacy).
- `ledgers/executive-{date}.log` -- Daily executive loop logs.
- `ledgers/{yyyy-mm-dd}/worker-{contract_id}.log` -- Worker execution logs by date.

## Tracing Goals to Worker Logs

```bash
grep "Goal Name" ledgers/work-ledger.jsonl | jq -r '.contract_id'
cat ledgers/2026-01-25/worker-contract-<id>.log
```

The `ledgers/` directory is version controlled for full audit traceability.
