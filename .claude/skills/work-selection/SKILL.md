---
name: Work Selection
description: |
  Select the next work item from goals queue. Use at the beginning of each executive loop iteration, when evaluating priority order (P1 > P2 > P3), filtering by status and dependencies, handling retry logic with different strategies, or determining when to idle or run practice tasks.
---

# Work Selection

Select the next eligible work item from goals.md.

## Priority Order

1. **P1** - Critical / Revenue / Blocking
2. **P2** - Important / Value-adding
3. **P3** - Nice-to-have / Enhancement

## Selection Algorithm

```
1. Parse goals.md for all work items
2. Filter: status = "Not Started" OR "In Progress"
3. Sort by priority (P1 first)
4. For each candidate:
   - Check dependencies met
   - Check retry state (max 10 retries)
   - Ensure new strategy available if retrying
5. Return first eligible item, or null (idle)
```

## Status Filters

Select: `Not Started`, `In Progress`
Skip: `Complete`, `Blocked`

## Retry Handling

- Track attempts per task (max 10)
- Each retry MUST use different strategy
- Strategies: `minimal_scaffold`, `break_into_steps`, `simplify_scope`, `find_example`
- If all strategies exhausted, mark Blocked

## No Work Available

When all items Complete or Blocked:
1. Check for practice tasks (skill gaps)
2. Run calibration if skills unproven
3. Sleep longer (reduced polling)
