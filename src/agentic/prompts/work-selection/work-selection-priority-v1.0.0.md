---
name: work-selection-priority
description: Selects highest priority unblocked work from goals.md. Priority order: P1 > P2 > P3, with dependency and status checks.
version: 1.0.0
variables:
  - name: GOALS_CONTENT
    type: string
    required: true
  - name: QUEUE_CONTENT
    type: string
    required: false
  - name: CAPABILITY_REGISTRY
    type: string
    required: true
  - name: RETRY_TRACKER
    type: string
    required: false
---

# Work Selection

Select the highest priority unblocked work item to execute next.

## Goals Content

{{GOALS_CONTENT}}

## Queue Content

{{QUEUE_CONTENT}}

## Capability Registry

{{CAPABILITY_REGISTRY}}

## Current Retry Tracker

{{RETRY_TRACKER}}

## Your Task

Analyze all available work and select the next item to execute.

Provide a JSON response:

```json
{
  "selected_work": {
    "title": "Task title",
    "priority": "P1" | "P2" | "P3",
    "status": "current status",
    "current_step": "Step title if multi-step",
    "step_number": 1,
    "total_steps": 3
  },
  "reasoning": "Why this item was selected",
  "alternatives_considered": [
    {
      "title": "Other task",
      "why_not_selected": "Reason"
    }
  ],
  "blockers_noted": [
    {
      "title": "Blocked task",
      "blocker": "What's blocking it"
    }
  ]
}
```

## Selection Rules

### Priority Order
1. **P1 tasks:** Highest priority, always work on these first
2. **P2 tasks:** Medium priority, work when no P1 available
3. **P3 tasks:** Low priority, work when no P1/P2 available

### Status Filter
- **Pending:** Eligible for selection
- **In Progress:** Resume if this was last selected
- **Blocked:** Skip (waiting for human response)
- **Complete:** Skip

### Dependency Check
- Only select tasks where all dependencies are complete
- Check `depends_on` field
- If dependency is blocked, this task cannot proceed

### Step Awareness (Multi-Step Tasks)
- If task has steps, select the NEXT pending/in-progress step
- Check step status: pending, in-progress, complete, blocked
- Only select if previous steps are complete

### Retry Consideration
- Check retry tracker for tasks with previous attempts
- Note retry count and strategies tried
- Select anyway (retry system will provide context)

### Capability Readiness
- Prefer tasks where required capabilities have high confidence (>70%)
- Can select tasks with lower confidence (will trigger practice/calibration)
- Note if task requires unproven capabilities

## Selection Process

1. **Filter by status:** Only pending/in-progress tasks
2. **Check dependencies:** Only unblocked tasks
3. **Sort by priority:** P1 first, then P2, then P3
4. **Within priority:** Sort by position in goals.md (top first)
5. **Step awareness:** If multi-step, select correct step
6. **Return first match:** Highest priority unblocked task

## No Work Available

If no work is available:

```json
{
  "selected_work": null,
  "reasoning": "All tasks are blocked or complete",
  "blockers_noted": [...]
}
```

This triggers idle mode (practice tasks or sleep).
