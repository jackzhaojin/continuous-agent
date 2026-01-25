---
name: practice-loop
description: |
  Run practice tasks when idle to improve skill confidence. Use when no primary work items are available, waiting for human input, in rate limit cooldown, skills blocking P1 goals have low confidence, skills have maturity=Declared, or skills unused >30 days.
---

# Practice Loop

Run practice tasks when idle to improve skill confidence.

## When to Practice

- No work items available (all Complete or Blocked)
- Waiting for human input
- Rate limited / in cooldown

## Priority Order

1. Skills blocking P1 goals
2. Skills with confidence < 50%
3. Skills with maturity = Declared (never tested)
4. Skills with high failure rate
5. Skills unused > 30 days

## Workflow

1. **Identify target** - Scan goals.md for required skills, find lowest confidence skill needed by highest priority goal

2. **Create practice task** - Use safe location `~/dev/agent-outputs/practice/`

3. **Execute** - Run the practice task in isolation

4. **Validate** - Run applicable verifiers

5. **Update** - Adjust confidence: +10 PASS, -15 FAIL

6. **Log** - Record to capability-ledger.jsonl:
   ```json
   {"event": "PRACTICE_TASK_COMPLETE", "skill_id": "...", "result": "PASS"}
   ```

## Practice Task Examples

| Skill | Task |
|-------|------|
| git.branch_commit | Create branch, make 3 commits in test repo |
| nextjs.build.basic | Scaffold app, modify component, verify build |
| reason.debugging | Create broken code, debug systematically |

## Anti-Patterns

- Practice when real work is available
- Practice in production directories
- Skip validation after practice
- Practice skills already at 90%+
