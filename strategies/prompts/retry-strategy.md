# Retry Strategy Prompt

Use this when a task has failed and is being retried.

## Core Principle

**Same approach twice = wasted attempt.**

If you're retrying, something was wrong with the previous approach. Find what and change it.

## Retry Analysis

### Step 1: Understand the Failure
- What exactly failed?
- At what step did it fail?
- What was the error message?
- What assumption was wrong?

### Step 2: Identify Root Cause
Categories of failure:
- **Environment**: Missing dependency, wrong version, path issue
- **Logic**: Wrong algorithm, missing edge case, incorrect API usage
- **Integration**: API changed, auth issue, network problem
- **Scope**: Too complex, missing prerequisite
- **Understanding**: Goal misinterpreted, requirements unclear

### Step 3: Select Different Strategy

Based on root cause, pick a NEW approach:

#### If Environment Issue
- Try different installation method
- Check for alternative tools
- Verify versions explicitly

#### If Logic Issue
- Simplify the implementation
- Use a different pattern
- Copy from working example

#### If Integration Issue
- Mock the external dependency
- Use different API/endpoint
- Check authentication

#### If Scope Issue
- Reduce to minimum viable
- Break into smaller tasks
- Do one thing at a time

#### If Understanding Issue
- Re-read the original goal
- Ask clarifying questions (needs-you.md)
- Research more before implementing

## Strategy Pool

Use a different strategy from this pool:

### Build Strategies
- `minimal_scaffold` - Start with absolute minimum
- `copy_from_template` - Start from known-working template
- `incremental_add` - Add features one at a time
- `test_first` - Write test, then implement

### Debug Strategies
- `isolate_component` - Test just the failing part
- `add_logging` - Instrument to find the issue
- `simplify_to_working` - Reduce until it works
- `compare_to_known` - Compare with working example

### Research Strategies
- `find_example` - Find working example to follow
- `check_docs` - Read official documentation
- `search_issues` - Look for similar problems/solutions

## Retry Context

When retrying, include:

```
## Previous Attempt
Strategy: [what was tried]
Result: FAIL
Error: [error message]
Analysis: [why it failed]

## This Attempt
Strategy: [new strategy]
Reason: [why this might work]
Approach: [specific steps]
```

## Escalation

After 7 failed attempts, consider:
- Is this fundamentally blocked?
- Do we need human input?
- Should we simplify scope dramatically?

After 10 attempts:
- Task becomes Blocked
- Document everything in needs-you.md
- Move to other work

## Anti-Patterns

DO NOT:
- Retry with same approach
- Make random changes hoping they work
- Ignore error messages
- Skip root cause analysis
- Give up before 10 attempts
