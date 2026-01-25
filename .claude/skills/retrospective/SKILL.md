# Retrospective Skill

Instructions for running periodic retrospective analysis.

## When to Run

- **Weekly**: Every Sunday (scheduled)
- **Threshold**: After 10+ new outcomes
- **On-demand**: "Analyze my recent work"
- **Post-calibration**: After calibration projects complete

## Input Context

Gather before analysis:
- `ledgers/capability-ledger.jsonl` (last 7 days)
- `skills/*.yml` (current state)
- `reports/validation/*.yaml` (recent reports)
- `workspace/needs-you.md` (current blockers)
- Any human feedback received

## Analysis Framework

### 1. Skill Performance

Questions to answer:
- Which skills had verifier PASS consistently?
- Which skills had FAIL or required multiple attempts?
- Any confidence levels that seem miscalibrated?
- Should any maturity levels change?

Output:
```markdown
## Skill Performance (Week of YYYY-MM-DD)

### High Performers (>80% success)
- git.branch_commit: 95% (10 attempts, 0 failures)
- node.npm.install: 92% (12 attempts, 1 failure)

### Struggling (<70% success)
- nextjs.routing.app_router: 40% (5 attempts, 3 failures)
- nextjs.build.basic: 60% (10 attempts, 4 failures)

### Calibration Adjustments
- [skill_id]: Confidence seems too high/low based on...
```

### 2. Gaps Discovered

Questions:
- What new gaps surfaced this week?
- Are any gaps blocking multiple goals?
- Which gaps should become practice tasks?

Output:
```markdown
## Gaps Discovered

### New Gaps
- nextjs.auth.integration: First attempt, no documentation
- azure.deploy: Missing credentials

### Blocking Gaps
- notion.api.access: Blocking P1 Notion integration goal

### Practice Priorities
1. nextjs.routing.app_router - Low confidence, needed for P1
2. reason.debugging - 2 failures due to poor debugging
```

### 3. Verification Quality

Questions:
- Did verifiers catch real issues?
- Any false positives (FAIL but actually fine)?
- Any false negatives (PASS but had issues)?
- Verifiers to add or modify?

Output:
```markdown
## Verification Quality

### Working Well
- node_build: Accurately caught all build failures
- git_status_clean: Reliable

### Needs Improvement
- docs_checklist: Too strict on README format
- node_test: Passes when no tests exist (intended?)

### Suggested Changes
- Add verifier for TypeScript types
- Loosen docs_checklist for MVP projects
```

### 4. Context Effectiveness

Questions:
- What context was present in successful tasks?
- What context was missing in failures?
- Should context-rules.yaml be updated?

Output:
```markdown
## Context Analysis

### Helpful Context
- Including constitution.md prevented violations
- Research phase improved success for vague goals

### Missing Context
- Failed tasks often lacked example code
- nextjs tasks need App Router docs

### Context Rule Updates
- Add: nextjs.routing.* → include App Router examples
- Add: All P1 tasks → include preferences.md
```

### 5. Pattern Recognition

Questions:
- What approaches worked for what task types?
- Any anti-patterns to document?
- New strategies to capture?

Output:
```markdown
## Patterns Observed

### Winning Patterns
- Starting with minimal scaffold, then adding features
- Running build after each change
- Reading existing code before modifying

### Anti-Patterns
- Modifying multiple files at once
- Skipping research for "obvious" tasks
- Not testing imports after adding dependencies

### New Strategies to Add
- "incremental_verify": Build/test after each step
- "example_first": Find working example before coding
```

## Outputs

### 1. Update Skill Files
- Confidence adjustments with rationale
- New gaps documented
- Maturity level changes
- common_failure_modes updated

### 2. Update Evolution Log
All changes with evidence references.

### 3. Update needs-you.md if:
- Gap requires human input (auth, decision)
- Skill documentation needs review
- Uncalibrated confidence detected

### 4. Create Retrospective Summary
Save to `learning/retrospectives/retro-{date}.md`:

```markdown
# Retrospective: Week of YYYY-MM-DD

## Summary
- Tasks completed: X
- Tasks failed: Y
- Skills improved: Z

## Key Findings
1. Finding 1
2. Finding 2

## Changes Made
- Updated skill.id confidence: 60 → 70
- Added gap: skill.new.gap
- Updated context rule: ...

## Recommendations
1. Recommendation 1
2. Recommendation 2

## Action Items
- [ ] Practice: skill.to.practice
- [ ] Document: pattern.to.document
- [ ] Fix: issue.to.fix
```

## Retrospective Checklist

Before finishing:
- [ ] Reviewed all ledger events
- [ ] Checked each skill's success/failure rate
- [ ] Identified top 3 improvement areas
- [ ] Updated skill files with new evidence
- [ ] Logged changes to evolution log
- [ ] Created retrospective summary
- [ ] Identified practice priorities
