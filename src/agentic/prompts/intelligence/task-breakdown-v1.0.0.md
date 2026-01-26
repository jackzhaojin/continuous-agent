---
name: task-breakdown
description: Breaks complex tasks into steps when estimated complexity exceeds threshold (>100 turns). Creates 2-4 implementable steps with dependencies.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: TASK_DESCRIPTION
    type: string
    required: false
  - name: COMPLEXITY_ESTIMATE
    type: number
    required: true
  - name: BREAKDOWN_THRESHOLD
    type: number
    required: true
---

# Task Breakdown

The following task exceeds the complexity threshold and needs to be broken down into steps.

## Task Details

**Title:** {{TASK_TITLE}}
**Description:** {{TASK_DESCRIPTION}}
**Estimated Complexity:** {{COMPLEXITY_ESTIMATE}} turns
**Breakdown Threshold:** {{BREAKDOWN_THRESHOLD}} turns

Since the estimated complexity ({{COMPLEXITY_ESTIMATE}} turns) exceeds the threshold ({{BREAKDOWN_THRESHOLD}} turns), this task must be broken into smaller steps.

## Your Task

Break this task into **2-4 steps** where each step:
- Is independently executable
- Has clear completion criteria
- Takes roughly 50-100 turns to complete
- Has explicit dependencies on other steps

Provide a JSON response with:

```json
{
  "steps": [
    {
      "title": "Step 1: Research and planning",
      "description": "Detailed description of what this step involves",
      "estimated_turns": 80,
      "depends_on": [],
      "deliverables": ["List", "of", "concrete", "outputs"]
    },
    {
      "title": "Step 2: Core implementation",
      "description": "Detailed description",
      "estimated_turns": 100,
      "depends_on": ["Step 1"],
      "deliverables": ["Specific", "outputs"]
    }
  ],
  "rationale": "Why you broke it down this way",
  "shared_output_path": true
}
```

## Guidelines

- **Step granularity:** Target 50-100 turns per step (roughly 10-60 minutes)
- **Dependencies:** Be explicit about which steps must complete before others
- **Shared output:** All steps write to the SAME project directory
- **Deliverables:** List concrete, verifiable outputs for each step
- **Testing:** Each step should include its own verification/testing
- **Order:** Steps should follow logical progression (research → implement → test → document)
