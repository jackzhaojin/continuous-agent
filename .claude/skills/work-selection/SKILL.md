# Work Selection Skill

Instructions for selecting the next work item to execute.

## Priority Order

Work is selected in strict priority order:

### 1. Explicit Priority (P1 > P2 > P3)
```
P1 = Critical / Revenue / Blocking
P2 = Important / Value-adding
P3 = Nice-to-have / Enhancement
```

### 2. Status Filter
Only consider items with status:
- "Not Started" - Fresh work
- "In Progress" - Partially done

Never select:
- "Complete" - Already done
- "Blocked" - Needs human intervention

### 3. Dependency Check
Skip items where dependencies aren't met:
- Required skills not available
- Prerequisite tasks not complete
- External resources missing

### 4. Retry State
Items that failed previously:
- Can be retried up to 10 times
- Each retry MUST use different strategy
- Track which strategies have been tried

## Selection Algorithm

```
1. Parse goals.md for all work items
2. Filter: status = "Not Started" OR "In Progress"
3. Sort by priority (P1 first)
4. For each candidate:
   a. Check dependencies
   b. Check retry state
   c. If retriable, ensure new strategy available
5. Return first eligible item
6. If none: Return null (idle)
```

## Reading goals.md

Expected format:
```markdown
## P1 - Critical Goals

### Goal Title Here
- **Description:** What needs to be done
- **Status:** Not Started
- **DoD:** List of success criteria
```

Parse each goal section and extract:
- title
- priority (from section header)
- description
- status
- definition_of_done

## Strategy Selection for Retries

When retrying a failed item:

1. Check RetryState for tried strategies
2. Select next untried strategy from pool:
   - `nextjs.minimal_scaffold`
   - `nextjs.copy_from_template`
   - `general.break_into_steps`
   - `general.simplify_scope`
   - `research.find_example`
   - etc.
3. If all strategies exhausted, mark Blocked

## Output

Work item selected for execution:
```typescript
{
  id: "work-item-id",
  title: "Goal Title",
  priority: "P1",
  description: "What needs to be done",
  status: "Not Started",
  definition_of_done: [...]
}
```

Or null if no work available.

## When No Work Available

If all items are Complete or Blocked:
1. Log "No work available"
2. Check for practice tasks (skill gaps)
3. Run calibration if skills unproven
4. Sleep longer (reduced polling)

## Error Handling

If goals.md can't be parsed:
1. Log error
2. Don't crash the loop
3. Try again next iteration
4. After 3 failures, add to needs-you.md
