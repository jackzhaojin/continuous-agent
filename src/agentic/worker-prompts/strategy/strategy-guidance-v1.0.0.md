---
name: strategy-guidance
description: Strategy-specific execution guidance for workers. Provides different approaches based on task type and previous attempts.
version: 1.0.0
variables:
  - name: STRATEGY_NAME
    type: string
    required: true
  - name: STRATEGY_DESCRIPTION
    type: string
    required: true
  - name: STRATEGY_APPROACH
    type: string
    required: true
  - name: ATTEMPT_NUMBER
    type: number
    required: true
  - name: REMAINING_STRATEGIES
    type: number
    required: true
  - name: PREVIOUS_FAILURE
    type: string
    required: false
  - name: PERSISTENCE_REMINDER
    type: string
    required: false
---

## STRATEGY: {{STRATEGY_NAME}}

{{STRATEGY_DESCRIPTION}}

### Approach:

{{STRATEGY_APPROACH}}

### Context:

- Attempt: {{ATTEMPT_NUMBER}}
- Remaining strategies if this fails: {{REMAINING_STRATEGIES}}

{{PREVIOUS_FAILURE}}

{{PERSISTENCE_REMINDER}}
