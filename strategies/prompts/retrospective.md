# Weekly Retrospective Analysis

Per PRD Part 13: Retrospective Process

## Input Context

- capability-ledger.jsonl (last 7 days)
- All skill files (current state)
- Validation reports (last 7 days)
- needs-you.md (current blockers)
- Human feedback received (if any)

## Analysis Questions

### 1. Skill Performance

- Which skills had verifier PASS consistently?
- Which skills had FAIL or required multiple attempts?
- Any confidence levels that seem miscalibrated?
- Should any maturity levels change?

### 2. Gaps Discovered

- What new gaps surfaced this week?
- Are any gaps blocking multiple goals?
- Which gaps should become practice tasks?

### 3. Verification Quality

- Did verifiers catch real issues?
- Any false positives (FAIL but actually fine)?
- Any false negatives (PASS but had issues)?
- Verifiers to add or modify?

### 4. Context Effectiveness

- What context was present in successful tasks?
- What context was missing in failures?
- Should context-rules.yaml be updated?

### 5. Pattern Recognition

- What approaches worked for what task types?
- Any anti-patterns to document?
- New strategies to capture?

## Outputs

### 1. Update skill files:

- Confidence adjustments with rationale
- New gaps documented
- Maturity level changes
- common_failure_modes updated

### 2. Update evolution-log.jsonl:

- All changes with evidence references

### 3. Update needs-you.md if:

- Gap requires human input (auth, decision)
- Skill documentation needs review
- Uncalibrated confidence detected

### 4. Create retrospective summary:

- Key findings
- Changes made
- Recommendations

## Output Format

```markdown
# Retrospective: Week of YYYY-MM-DD

## Summary
[Executive summary of the week's learnings]

## Skill Performance
| Skill | Attempts | PASS | FAIL | Confidence Change | Notes |
|-------|----------|------|------|-------------------|-------|
| ... | ... | ... | ... | ... | ... |

## Gaps Discovered
- [Gap 1]: [Impact] - [Action]
- [Gap 2]: [Impact] - [Action]

## Verification Quality
- False positives: [count]
- False negatives: [count]
- Recommended changes: [list]

## Pattern Recognition
### What Worked
- [Pattern 1]
- [Pattern 2]

### Anti-Patterns
- [Avoid this approach because...]

## Changes Made This Retrospective
| File | Change | Evidence |
|------|--------|----------|
| ... | ... | ... |

## Recommendations for Next Week
1. [Priority action 1]
2. [Priority action 2]
3. [Practice focus area]
```

## Trigger Schedule

- **Weekly:** Every Sunday (automated)
- **Threshold:** After 10+ new outcomes in capability-ledger
- **On-demand:** Human request "Analyze my recent work"
- **Post-calibration:** After any calibration project completes
