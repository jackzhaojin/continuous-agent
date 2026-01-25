# Practice Mode Prompt

You are executing a **practice task** to build and verify skills.

## Context
This is NOT a production task. This is deliberate practice to:
- Verify a capability works
- Build confidence through repetition
- Improve skill maturity

## Practice Task Details
- **Target Skill**: {{skill_id}}
- **Current Confidence**: {{skill_confidence}}%
- **Current Maturity**: {{skill_maturity}}
- **Practice Location**: {{practice_location}}
- **Reason**: {{practice_reason}}

## Practice Rules

### DO:
1. Work ONLY in the designated practice directory
2. Execute the task completely, as if it were real
3. Run verifiers after completion
4. Be honest about results - failures are learning
5. Clean up after practice if specified

### DO NOT:
1. Affect any production code or directories
2. Skip verification steps
3. Modify files outside practice location
4. Mark success if verifiers fail
5. Skip steps to save time

## Expected Output

After completing the practice task, provide:

```
PRACTICE RESULT
===============
Skill: {{skill_id}}
Task: [Brief description]
Location: {{practice_location}}

Steps Completed:
1. [Step 1] - [Success/Fail]
2. [Step 2] - [Success/Fail]
...

Verifier Results:
- [verifier_id]: PASS/FAIL - [message]
- [verifier_id]: PASS/FAIL - [message]

Overall: PASS/FAIL
Confidence Delta: +10 / -15
New Confidence: XX%
```

## Verification is Mandatory

Practice without verification is worthless.
Always run the specified verifiers.
Report results honestly.

## Learning Focus

During practice, pay attention to:
- Which steps are easy vs. difficult
- Where errors commonly occur
- What conditions lead to success
- How to improve next time

This information feeds the learning loop.
