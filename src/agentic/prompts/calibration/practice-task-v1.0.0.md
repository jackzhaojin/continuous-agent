---
name: practice-task
description: Generates practice tasks for idle time. Focuses on capabilities needed by P1 goals that have low confidence or are unproven.
version: 1.0.0
variables:
  - name: CAPABILITY_GAPS
    type: string
    required: true
  - name: P1_GOALS
    type: string
    required: true
  - name: SAFE_SCOPE
    type: string
    required: true
---

# Generate Practice Task

The agent is idle. Generate a practice task to fill capability gaps.

## Capability Gaps

{{CAPABILITY_GAPS}}

## P1 Goals Waiting

{{P1_GOALS}}

## Safe Scope for Practice

{{SAFE_SCOPE}}

## Your Task

Design a safe practice task that improves a needed capability.

Provide a JSON response:

```json
{
  "task": {
    "title": "Practice: [capability]",
    "description": "Safe task to practice this capability",
    "capability_targeted": "capability.id",
    "success_criteria": [
      "Criterion 1",
      "Criterion 2"
    ],
    "estimated_turns": 30,
    "project_path": "agent-outputs/practice-[capability]-[date]",
    "risk_level": "low"
  },
  "learning_goals": [
    "Learn X",
    "Understand Y",
    "Practice Z"
  ],
  "rationale": "Why this practice helps with P1 goals"
}
```

## Practice Task Guidelines

### Selection Priority
1. **P1-blocking capabilities:** Capabilities needed for P1 goals with confidence <70%
2. **Declared capabilities:** Capabilities at "Declared" maturity (never tested)
3. **Stale capabilities:** Capabilities unused >30 days
4. **Low confidence:** Any capability <50% confidence

### Task Characteristics
- **Quick:** 30-60 turns maximum
- **Safe:** No production impact, isolated workspace
- **Educational:** Teaches specific skill
- **Relevant:** Directly helps with pending P1 work
- **Low risk:** Can't break anything

### Example Practice Tasks

**Need: PostgreSQL integration (confidence: 0%)**
```
Title: "Practice: PostgreSQL connection"
- Install pg library
- Connect to local PostgreSQL
- Run basic queries (SELECT, INSERT)
- Handle connection errors
Purpose: Prepares for P1 task needing database
```

**Need: Playwright testing (confidence: 30%)**
```
Title: "Practice: Playwright basics"
- Install Playwright
- Write simple test (navigate, click, assert)
- Run test and verify passes
Purpose: Improves testing capability for P1 app
```

### Learning Goals
- Specific skills to acquire
- Knowledge to gain
- Patterns to practice

### Rationale
- Connect practice to pending P1 work
- Explain how this unblocks future tasks
- Estimate confidence gain (+10 to +20)

### Safety Requirements
- **No external APIs** (unless using mock/sandbox)
- **No production systems**
- **No spending** (stay within free tiers)
- **Isolated workspace** (own directory in agent-outputs)
- **No credentials** (unless test credentials)

## If No Gaps

If all P1-needed capabilities are proven:

```json
{
  "task": null,
  "reasoning": "All P1-needed capabilities are proven (>70% confidence)",
  "recommendation": "Agent can idle or work on P2/P3 tasks"
}
```
