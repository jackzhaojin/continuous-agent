---
paths:
  - "src/deterministic/verifiers/**"
  - "src/deterministic/validation-handler.ts"
  - "verifiers/**"
---

# Verifier System

**Philosophy:** Deterministically triggered, agentically evaluated.

**CRITICAL:** Verifiers run in the **worker's output directory** (`result.output_path`), NOT the agent infrastructure directory (`process.cwd()`). This was a past bug -- always verify the check target.

Verifiers return structured evidence:

```typescript
{
  verifier_id: 'git-clean',
  result: 'PASS' | 'FAIL',
  message: 'No uncommitted changes',
  evidence: { /* structured data */ }
}
```

**Core verifiers:**
- `git_status_clean` -- No uncommitted changes in worker's project
- `node_build` -- TypeScript compiles, tests pass
- `docs_checklist` -- README/CLAUDE.md present
- `reference_integrity` -- Reference registry valid

Verifier results update capability confidence: +10 on PASS, -15 on FAIL.

**Verifier definitions:** `verifiers/definitions/*.yml`
**Shell runner:** `verifiers/run-verifier.sh`
