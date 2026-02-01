---
name: task-contract
description: |
  Create valid task contracts between Executive and Worker. Use when preparing work for execution, classifying intent (outcome_only, what_only, what_and_how), defining verifiable Definition of Done criteria, assessing risk levels, or scoping allowed operations. Rule: No work without a valid task contract.
---

# Task Contract

Agreement between Executive and Worker defining what needs to be done and how success is measured.

**No work without a valid task contract.**

## Contract Schema

```yaml
task_contract:
  id: "contract-YYYY-MM-DD-NNN"
  source_goal: "Title from goal bundle PROMPT.md"
  priority: "P0|P1|P2|P3|P4"
  intent_type: "outcome_only|what_only|what_and_how"
  research_required: true|false
  goal: "Clear description of what to accomplish"
  chosen_approach: "Specific approach after research"
  definition_of_done:
    - "Each criterion must be verifiable"
  scope:
    repos_allowed: ["~/dev/agent-outputs"]
    tools_allowed: ["Read", "Write", "Edit", "Bash"]
    max_turns: 50
  risk_level: "low|medium|high"
  skills_required: ["skill.id"]
```

## Creation Steps

1. **Classify intent** - outcome_only/what_only require research first
2. **Research** (if needed) - Investigate options, check preferences.md
3. **Define DoD** - Specific, verifiable, complete, ordered
4. **Assess risk** - Low (reversible), Medium (external deps), High (cost/production)
5. **Scope limits** - Where worker CAN and MUST NOT operate

## Validation Checklist

- [ ] Goal is clear and actionable
- [ ] DoD items are specific and verifiable
- [ ] Scope is defined
- [ ] Intent is classified
- [ ] Research done if required
