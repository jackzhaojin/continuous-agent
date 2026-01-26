---
name: validation-interpret
description: Interprets verifier results, determines overall success/failure, and calculates capability confidence deltas.
version: 1.0.0
variables:
  - name: VERIFIER_RESULTS
    type: string
    required: true
  - name: DEFINITION_OF_DONE
    type: string
    required: true
  - name: CAPABILITIES_EXERCISED
    type: string
    required: true
---

# Validation Interpretation

Analyze verifier results and determine if the task was successful.

## Verifier Results

{{VERIFIER_RESULTS}}

## Definition of Done

{{DEFINITION_OF_DONE}}

## Capabilities Exercised

{{CAPABILITIES_EXERCISED}}

## Your Task

Provide a JSON response with:

```json
{
  "overall_result": "PASS" | "PARTIAL" | "FAIL",
  "reasoning": "Why you determined this result",
  "dod_completion": {
    "total_criteria": 5,
    "met_criteria": 4,
    "unmet_criteria": ["Specific criterion not met"]
  },
  "capability_updates": [
    {
      "capability_id": "nextjs.build.basic",
      "confidence_delta": 10,
      "reasoning": "Build verifier passed, demonstrating capability"
    },
    {
      "capability_id": "nextjs.testing",
      "confidence_delta": -15,
      "reasoning": "Test verifier failed, capability needs improvement"
    }
  ],
  "recommendations": [
    "Fix failing tests before proceeding",
    "Document known issues"
  ]
}
```

## Interpretation Guidelines

### Overall Result
- **PASS:** All critical verifiers pass AND all DoD criteria met
- **PARTIAL:** Some verifiers pass, task provides value but incomplete
- **FAIL:** Critical verifiers fail OR task does not meet core requirements

### Capability Confidence Deltas
- **+10:** Verifier PASS for this capability
- **-15:** Verifier FAIL for this capability
- **0:** Capability not exercised in this task

### Verifier Priority
- **Critical:** Must pass for PASS result (git-clean, node-build)
- **Important:** Should pass but not blocking (node-test, lint)
- **Optional:** Nice-to-have (docs-complete)
