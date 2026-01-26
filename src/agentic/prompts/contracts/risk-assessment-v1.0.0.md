---
name: risk-assessment
description: Assesses risk level (low/medium/high) for a task based on scope, external dependencies, and constitutional limits.
version: 1.0.0
variables:
  - name: TASK_DESCRIPTION
    type: string
    required: true
  - name: SCOPE
    type: string
    required: true
  - name: CAPABILITIES_REQUIRED
    type: string
    required: true
---

# Risk Assessment

Assess the risk level for this task.

## Task Description

{{TASK_DESCRIPTION}}

## Scope

{{SCOPE}}

## Capabilities Required

{{CAPABILITIES_REQUIRED}}

## Your Task

Provide a JSON response:

```json
{
  "risk_level": "low" | "medium" | "high",
  "risk_factors": [
    "Factor 1: explanation",
    "Factor 2: explanation"
  ],
  "mitigation_strategies": [
    "Strategy 1",
    "Strategy 2"
  ],
  "constitutional_concerns": [
    "Limit #1: concern"
  ]
}
```

## Risk Level Guidelines

### LOW RISK
- Standard CRUD operations
- Well-tested patterns
- No external dependencies
- Local file operations only
- All capabilities have high confidence (>80%)

### MEDIUM RISK
- External API integration
- Complex business logic
- Multiple system interactions
- Some capabilities untested (<70% confidence)
- Modifications to shared code

### HIGH RISK
- Production deployments
- Data deletion (even soft-delete)
- Financial transactions
- Security-sensitive operations
- Publishing to external registries
- Access control modifications
- Operations near constitutional limits

## Common Risk Factors

- **External dependencies:** APIs, databases, third-party services
- **Unproven capabilities:** Low confidence capabilities (<50%)
- **Scope creep:** Ill-defined requirements
- **Data sensitivity:** PII, credentials, financial data
- **Irreversibility:** Hard to undo operations
- **Cost:** Operations with spending implications
- **Complexity:** >200 estimated turns

## Mitigation Strategies

- Break into smaller tasks
- Test in isolation first
- Use mocks before real integrations
- Implement soft-delete instead of hard-delete
- Add extra verifiers
- Request human approval for high-risk steps
- Create rollback plan
