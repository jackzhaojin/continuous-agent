# V2.1.6 Goal: Executive Self-Triage & Recovery

**Status:** Planning (2026-04-06)

## Problem

When the executive loop hits a repeated failure, it diagnoses the problem (Phase 7), produces a root cause and suggested fix — then does nothing with it. The diagnosis output is a JSON blob that gets logged and forgotten. After 3 failures the system escalates to `needs-you.md` and blocks the goal, waiting for a human who may not be watching.

**What happened (2026-04-06 incident):**
Step 25 of a 32-step B2B checkout flow failed 3 times because the `git_status_clean` verifier rejected `.playwright-cli/` artifacts. The diagnosis correctly identified "git status not clean" but escalated to human instead of fixing the verifier's artifact filter. The fix was a 5-line change to `core-verifiers.ts` — well within the self-enhancer's capability. But no path connected diagnosis → self-enhancement → retry.

**The gap today:**
- Phase 7 diagnosis produces `{ rootCause, suggestedFix, shouldRetry, escalateToHuman }` — but `suggestedFix` is never executed
- The self-enhancer agent (`.claude/agents/self-enhancer.md`) can modify verifiers, skills, and config — but only via explicit `[SELF-ENHANCE]` goals created by humans
- `needs-you.md` escalation failed silently ("table format not matched") — so the human wasn't even notified
- The retry counter showed `0/10` on every attempt — retries weren't incrementing, so Phase 8's 10-retry block never triggered. Instead Phase 7's 3-consecutive-failure heuristic blocked the goal early

## Core Issue

The system has all the pieces for self-healing but they're disconnected. Diagnosis can identify verifier bugs. The self-enhancer can fix verifier code. But there's no router that says "this failure is an infrastructure problem — spawn a self-enhance task to fix it, then unblock the goal and retry."

## Architecture

Today's failure flow:
```
Worker fails → Verifier rejects → Retry (same problem) → Phase 7 diagnoses →
Escalate to needs-you.md → Human reads → Human fixes → Human unblocks
```

Target flow:
```
Worker fails → Verifier rejects → Retry (same problem) → Phase 7 diagnoses →
Classify: worker issue vs infrastructure issue →
  If worker: retry with enhanced context (existing behavior)
  If infrastructure: spawn self-triage task → fix → unblock → retry automatically
```

## Requirements

### R1: Failure Classification — Worker vs Infrastructure

Phase 7 diagnosis should classify the failure into one of:
- **worker** — the worker didn't complete the task correctly (code bugs, wrong approach, missing files). Action: retry with enhanced context.
- **infrastructure** — the agent framework itself has a bug (verifier too strict, skill missing instructions, path mismatch, port collision). Action: self-triage.
- **environment** — external system issue (auth expired, disk full, service down). Action: escalate to human.

**Implementation:** Add a `failure_class` field to the diagnosis response schema. The diagnosis skill already analyzes verifier results and worker logs — it just needs to distinguish "worker didn't commit" (worker issue) from "verifier doesn't filter playwright artifacts" (infrastructure issue).

**Key signals for infrastructure classification:**
- Same verifier fails across multiple retries with identical evidence
- Worker reports SUCCESS but verifier rejects (worker thinks it's done, framework disagrees)
- Failure pattern matches a known class (e.g., git status dirty with only framework artifacts)
- Error is in framework code paths, not worker output

### R2: Self-Triage Skill

New executive skill: `.claude/skills/self-triage/SKILL.md`

When Phase 7 classifies a failure as `infrastructure`, the executive loop spawns a self-triage task that:

1. **Reads the diagnosis** — root cause, suggested fix, verifier evidence, worker logs
2. **Locates the relevant code** — maps the failing verifier/skill/module to its source file
3. **Proposes a fix** — generates a specific code change (not a vague suggestion)
4. **Applies the fix on a branch** — uses the self-enhancer agent pattern (branch, modify, build, test)
5. **Validates the fix** — re-runs the failing verifier with the same evidence to confirm it would now pass
6. **Merges and rebuilds** — if validation passes, merge to main and `npm run build`
7. **Unblocks the goal** — reset step status to pending, clear retry counter, resume

**Scope limits (constitutional):**
- Can only modify files in the self-enhancer's allowed list (verifiers, skills, config — not constitution.md)
- Fix must pass `npm run typecheck` and `npm run build`
- Maximum 1 self-triage per goal per failure pattern (prevent infinite self-modification loops)
- If self-triage fails, escalate to human (don't retry self-triage)

### R3: Automatic Recovery Pipeline

Wire the classification into the executive loop:

```typescript
// In Phase 7 handler (executive-loop.ts)
if (diagnosis.failure_class === 'infrastructure' && !selfTriageAttempted) {
  // Spawn self-triage as inline task (not a goal — immediate, blocking)
  const triageResult = await runSelfTriage(diagnosis, failingStep);
  if (triageResult.fixed) {
    await rebuildAndReload();
    await unblockStep(step);
    continue; // Back to Phase 3, re-select work
  }
  // Self-triage failed — fall through to human escalation
}
```

**Guard rails:**
- `selfTriageAttempted` flag per step per failure pattern — prevents loops
- Self-triage has a 5-minute timeout (it's a focused fix, not a research project)
- All self-triage actions logged to `ledgers/self-triage-ledger.jsonl`
- Discord notification when self-triage runs (visibility)

### R4: Fix needs-you.md Escalation

The current escalation silently fails when the markdown table format doesn't match. This is a separate bug but critical — if self-triage can't fix something, the human fallback must work.

**Fixes:**
- Make `needs-you.md` writer robust to table format variations (regex-based insertion, not exact string match)
- Add a fallback: if table insertion fails, append to the end of the file as a freeform section
- Log a warning AND send Discord notification when escalation fails

### R5: Fix Retry Counter Persistence

The retry counter showed `0/10` on every attempt, meaning retries aren't persisting between iterations. Phase 8's 10-retry block depends on this counter.

**Investigation needed:**
- Check if `retry_count` in STEPS.json is being read at step selection time
- Check if the in-memory retry counter resets between loop iterations
- The SIGUSR2 hot-reload may be resetting in-memory state — verify retry_count survives reload

### R6: Known Infrastructure Failure Patterns

Seed the self-triage skill with known patterns from operational experience:

| Pattern | Signal | Fix Location |
|---------|--------|-------------|
| Playwright artifacts dirty | `git_status_clean` fails, evidence shows `.playwright-cli/` or `.playwright-mcp/` paths only | `core-verifiers.ts` ARTIFACT_DIR_PREFIXES |
| Framework artifacts dirty | `git_status_clean` fails, evidence shows only STEP-*.md, RESEARCH.md, etc. | `core-verifiers.ts` FRAMEWORK_ARTIFACT_PATTERNS |
| Port collision | `web-testing` skill fails on `localhost:3000` but app is on another port | `web-testing/SKILL.md` port detection |
| Build error from prior step | `node_build` fails with errors in files the current worker didn't touch | Clear `.next/` cache, retry |
| Step ID mismatch | Step repeats infinitely, STEPS.json never updates | `state-handler.ts` step ID resolution |

These patterns let the self-triage skill match against known issues before attempting novel fixes, making recovery faster and more predictable.

## Lessons Learned (2026-04-06 Incident)

1. **Diagnosis without action is theater** — the system correctly identified the root cause ("git status not clean with playwright artifacts") but couldn't do anything about it. A human had to add 5 lines to `core-verifiers.ts`.
2. **needs-you.md is fragile** — the table format parser failed silently, so the human escalation path was broken. Two safety nets failed simultaneously.
3. **Retry counter bug amplified the problem** — instead of getting 10 retries to potentially work around the issue, the system blocked after 3 via the Phase 7 consecutive failure heuristic.
4. **The self-enhancer is capable but unreachable** — it already has write access to verifiers and skills. The missing piece is a trigger from the failure loop, not new capabilities.
5. **Infrastructure failures are predictable** — the `.playwright-cli/` artifact pattern is a category, not a one-off. New tools will create new artifact directories. The fix should be extensible.

## Success Criteria

- [ ] Phase 7 diagnosis classifies failures as worker/infrastructure/environment
- [ ] Infrastructure failures trigger self-triage skill automatically
- [ ] Self-triage can modify verifiers, skills, and config (within self-enhancer scope)
- [ ] Self-triage validates its fix before applying (re-run failing check)
- [ ] Fixed goal is automatically unblocked and resumed
- [ ] Guard rails prevent self-triage loops (1 attempt per pattern per step)
- [ ] needs-you.md escalation works reliably (no silent failures)
- [ ] Retry counter persists correctly across iterations
- [ ] All self-triage actions logged to dedicated ledger
- [ ] End-to-end: a verifier artifact bug triggers self-triage → fix → rebuild → resume without human intervention
