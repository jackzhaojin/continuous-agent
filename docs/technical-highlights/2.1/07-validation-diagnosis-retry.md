# Technical Highlight 7: Validation, Diagnosis & Retry Loop

**Files:** [`src/deterministic/validation-handler.ts`](../../../src/deterministic/validation-handler.ts), [`src/agentic/diagnosis/agentic-diagnosis.ts`](../../../src/agentic/diagnosis/agentic-diagnosis.ts), [`src/agentic/intelligence/strategy-selector.ts`](../../../src/agentic/intelligence/strategy-selector.ts)

## What It Does

After a worker finishes coding, the agent doesn't just mark it done -- it validates the output, diagnoses failures with an LLM, and retries with a different strategy. This is the self-correcting feedback loop that makes autonomous coding viable.

```
Worker completes
      │
      ▼
┌─────────────┐    PASS    ┌──────────┐
│  Validation  │──────────>│ Complete  │
│  (Phase 5)   │           └──────────┘
└──────┬──────┘
       │ FAIL
       ▼
┌─────────────┐  retry     ┌──────────────┐
│  Strategy    │──────────>│ Re-execute    │
│  Selector    │           │ (new approach)│
└──────┬──────┘           └──────────────┘
       │ 3+ failures
       ▼
┌─────────────┐  retry     ┌──────────────┐
│  Agentic     │──────────>│ Re-execute    │
│  Diagnosis   │           │ (with fix)    │
└──────┬──────┘           └──────────────┘
       │ 10 failures (constitutional limit)
       ▼
┌─────────────┐
│  Block &     │  -> writes to needs-you.md
│  Escalate    │  -> moves to next goal
└─────────────┘
```

## Validation (Deterministic)

Verifiers run against `result.output_path` (the worker's project directory, NOT the agent codebase). They check:
- Build success (does it compile/run?)
- Definition of Done items from PROMPT.md
- File existence and structure

## Diagnosis (Agentic)

After 3+ failures, the agent spawns an LLM-powered diagnostic call that reads:
- The last few validation reports
- Worker logs from failed attempts
- The original task definition

It returns a structured `DiagnosisResult`: root cause, suggested fix, and whether to retry or escalate.

## Strategy Selection (Agentic)

Each retry uses a *different* approach. The strategy selector avoids repeating what already failed:
- Simplify scope
- Research first, then build
- Break into smaller subtasks
- Try different tools or frameworks

## Talk Points

- The Constitution mandates 10 retries minimum -- the agent can't give up early
- Diagnosis is an LLM call, not a hardcoded decision tree -- it *reasons* about why code failed
- Strategy diversity prevents the "doing the same thing and expecting different results" anti-pattern
- Only truly blocked goals reach a human via `needs-you.md`
