---
name: retrospective
description: Periodic retrospective analysis to identify patterns, learnings, and improvement opportunities. Run weekly or after significant events.
version: 1.0.0
variables:
  - name: TIME_PERIOD
    type: string
    required: true
  - name: WORK_LEDGER_SUMMARY
    type: string
    required: true
  - name: CAPABILITY_CHANGES
    type: string
    required: true
  - name: BLOCKERS_ENCOUNTERED
    type: string
    required: false
  - name: COMPLETED_TASKS
    type: string
    required: true
---

# Retrospective Analysis

Analyze recent agent performance and identify improvements.

## Time Period

{{TIME_PERIOD}}

## Work Summary

{{WORK_LEDGER_SUMMARY}}

## Capability Changes

{{CAPABILITY_CHANGES}}

## Blockers Encountered

{{BLOCKERS_ENCOUNTERED}}

## Completed Tasks

{{COMPLETED_TASKS}}

## Your Task

Provide a comprehensive retrospective analysis:

```json
{
  "summary": {
    "tasks_completed": 5,
    "tasks_blocked": 2,
    "average_attempts_to_complete": 2.3,
    "total_turns_used": 1250,
    "success_rate": "71%"
  },
  "capability_insights": [
    {
      "capability": "nextjs.build.basic",
      "confidence_change": "+15 (70% → 85%)",
      "conclusion": "Capability proven, now reliable"
    },
    {
      "capability": "notion.mcp.pages",
      "confidence_change": "-10 (30% → 20%)",
      "conclusion": "Needs calibration before production use"
    }
  ],
  "patterns_observed": [
    {
      "pattern": "Tasks with research phase succeed more often",
      "evidence": "4/5 research tasks completed vs 1/3 non-research",
      "recommendation": "Enforce research for outcome_only tasks"
    }
  ],
  "failure_analysis": [
    {
      "task": "Build Notion integration",
      "attempts": 10,
      "reason": "Missing API credentials",
      "learning": "Check auth requirements in research phase"
    }
  ],
  "improvements_to_make": [
    {
      "area": "Prompt system",
      "issue": "Retry prompts not emphasizing strategy diversity enough",
      "action": "Update retry-context prompt to be more forceful"
    },
    {
      "area": "Work selection",
      "issue": "Not checking capability confidence before selection",
      "action": "Add capability check to work-selector"
    }
  ],
  "wins": [
    "Successfully completed complex Next.js app in 3 steps",
    "Zero constitutional violations this period",
    "Improved git.branch_commit confidence by 25%"
  ]
}
```

## Analysis Guidelines

### Patterns to Look For
- **Success patterns:** What leads to completed tasks?
- **Failure patterns:** What causes blockers/failures?
- **Capability trends:** Which capabilities are improving/declining?
- **Strategy effectiveness:** Which retry strategies work best?
- **Time patterns:** Are certain task types faster/slower than estimated?

### Capability Analysis
- Identify capabilities that improved significantly
- Identify capabilities that declined (need attention)
- Note capabilities that remain "Declared" (need calibration)
- Check for capabilities unused >30 days (may be stale)

### Failure Analysis
- Why did tasks block?
- Could failures be prevented with better research?
- Are retries using different strategies?
- Are constitutional limits being hit appropriately?

### Actionable Improvements
- **Prompt updates:** Which prompts need clarification?
- **Verifier additions:** What checks are missing?
- **Capability targets:** Which capabilities need practice?
- **Process improvements:** What workflow changes would help?

### Wins and Learnings
- Celebrate successes
- Document what worked well
- Share learnings for future tasks

## Output Format

Save retrospective to `learning/retrospectives/YYYY-MM-DD.md`

Include:
- Summary statistics
- Capability insights
- Pattern analysis
- Failure learnings
- Actionable improvements
- Wins and highlights
