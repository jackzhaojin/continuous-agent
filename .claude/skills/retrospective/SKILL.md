---
name: retrospective
description: |
  Run periodic retrospective analysis to improve agent performance. Use weekly (every Sunday), after 10+ new outcomes in ledgers, when user requests performance review, after calibration projects complete, or when identifying skill gaps and calibration adjustments.
---

# Retrospective

Periodic analysis connecting outcomes to improvements.

## When to Run

- Weekly (every Sunday)
- After 10+ new outcomes
- On-demand: "analyze my recent work"
- Post-calibration

## Input Context

Gather before analysis:
- `ledgers/capability-ledger.jsonl` (last 7 days)
- `skills/*.yml` (current state)
- `reports/validation/*.yaml` (recent reports)
- `workspace/needs-you.md` (current blockers)

## Analysis Framework

### 1. Skill Performance
- Which skills had consistent PASS?
- Which skills had FAIL or multiple attempts?
- Any miscalibrated confidence levels?

### 2. Gaps Discovered
- New gaps this week?
- Gaps blocking multiple goals?
- Which gaps become practice tasks?

### 3. Verification Quality
- False positives (FAIL but fine)?
- False negatives (PASS but issues)?
- Verifiers to add/modify?

### 4. Pattern Recognition
- What approaches worked?
- Anti-patterns to document?
- New strategies to capture?

## Outputs

1. **Update skill files** - Confidence adjustments, new gaps, maturity changes
2. **Update evolution-log.jsonl** - All changes with evidence
3. **Update needs-you.md** - If gap requires human input
4. **Create summary** - Save to `learning/retrospectives/retro-{date}.md`

## Summary Template

```markdown
# Retrospective: Week of YYYY-MM-DD

## Summary
- Tasks completed: X
- Tasks failed: Y
- Skills improved: Z

## Key Findings
1. ...

## Changes Made
- Updated skill.id confidence: 60 -> 70

## Action Items
- [ ] Practice: skill.to.practice
```
