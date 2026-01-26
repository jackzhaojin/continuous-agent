---
name: capability-assessment
description: Assesses required capabilities for a task and checks if agent has sufficient confidence to proceed.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: TASK_DESCRIPTION
    type: string
    required: false
  - name: CAPABILITY_REGISTRY
    type: string
    required: true
  - name: CONFIDENCE_THRESHOLD
    type: number
    required: true
---

# Capability Assessment

Assess what capabilities are required for this task and whether the agent has sufficient confidence.

## Task Details

**Title:** {{TASK_TITLE}}
**Description:** {{TASK_DESCRIPTION}}

## Available Capabilities

{{CAPABILITY_REGISTRY}}

## Confidence Threshold

Tasks require capabilities with confidence ≥ {{CONFIDENCE_THRESHOLD}}% to proceed without blocking.

## Your Task

Analyze the task and provide a JSON response:

```json
{
  "required_capabilities": [
    {
      "capability_id": "nextjs.build.basic",
      "current_confidence": 85,
      "required": true,
      "meets_threshold": true
    },
    {
      "capability_id": "git.branch_commit",
      "current_confidence": 95,
      "required": true,
      "meets_threshold": true
    }
  ],
  "overall_assessment": "ready" | "needs_practice" | "blocked",
  "blockers": [
    {
      "capability_id": "notion.mcp.pages",
      "issue": "Confidence too low (20% < 70%)",
      "recommendation": "Run calibration project first"
    }
  ],
  "recommendations": [
    "Practice X capability before attempting",
    "Break task into smaller pieces"
  ]
}
```

## Assessment Guidelines

- **Technical capabilities:** Tool operations (git.*, npm.*, nextjs.*)
- **Delivery capabilities:** End-to-end outcomes (deliver.nextjs.app, deliver.eds.site)
- **Functional capabilities:** Reasoning abilities (reason.debugging, exec.strategy_switching)

- **Overall assessment:**
  - `ready`: All required capabilities meet threshold
  - `needs_practice`: Some capabilities below threshold but task could work
  - `blocked`: Critical capabilities missing or too low confidence
