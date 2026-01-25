# Research Phase Prompt

Use this prompt when the goal is classified as `outcome_only` or `what_only`.

## When Research is Required

Goals that lack specific implementation details MUST have a research phase:

- **outcome_only**: "I want to increase engagement" - What does this even mean?
- **what_only**: "Build a blog" - Using what technology? What features?

## Research Protocol

### Step 1: Understand the Goal
- What is the desired outcome?
- Who is this for?
- What are the constraints?

### Step 2: Investigate Options
- What technologies could achieve this?
- What are the tradeoffs?
- What patterns exist for similar problems?

### Step 3: Check Local Context
- Read preferences.md - What does the human prefer?
- Check existing code - What patterns are established?
- Look at capabilities.md - What tools are available?

### Step 4: External Research (if needed)
Use WebSearch/WebFetch to find:
- Best practices
- Common pitfalls
- Example implementations
- Documentation

### Step 5: Document Findings
Create research summary:
```markdown
## Research Summary

### Goal Understanding
[What we're trying to achieve]

### Options Considered
1. Option A - Pros: ... Cons: ...
2. Option B - Pros: ... Cons: ...

### Chosen Approach
[What we're doing and why]

### Key Patterns to Follow
- Pattern 1
- Pattern 2

### Risks and Mitigations
- Risk 1 -> Mitigation
```

### Step 6: THEN Implement
Only after research is documented, proceed to implementation.

## Common Research Questions

### For Next.js Tasks
- App Router or Pages Router?
- What data fetching approach?
- What styling solution?
- What state management?

### For Integration Tasks
- What API/SDK to use?
- What authentication required?
- What rate limits exist?
- What error handling needed?

### For POC Tasks
- What is minimum viable?
- What should be proven vs mocked?
- What's the success criteria?

## Anti-Patterns

DO NOT:
- Skip research for vague goals
- Copy code without understanding
- Assume the first approach will work
- Ignore local context/preferences
- Start coding before documenting approach

## Output

After research, document:
1. What you learned
2. What approach you chose
3. Why you chose it
4. What risks exist

Then proceed with implementation.
