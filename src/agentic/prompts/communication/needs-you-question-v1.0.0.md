---
name: needs-you-question
description: Creates needs-you.md entry when agent needs clarification or decision from human on ambiguous requirements.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: QUESTION
    type: string
    required: true
  - name: CONTEXT
    type: string
    required: true
  - name: OPTIONS
    type: string
    required: false
  - name: DEFAULT_RECOMMENDATION
    type: string
    required: false
---

# Create needs-you.md Question Entry

Task "{{TASK_TITLE}}" requires human decision on an ambiguous requirement.

## Question

{{QUESTION}}

## Context

{{CONTEXT}}

## Options (if applicable)

{{OPTIONS}}

## Recommended Default

{{DEFAULT_RECOMMENDATION}}

## Your Task

Generate a needs-you.md table entry:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| [DECISION_NEEDED] | [QUESTION_WITH_OPTIONS] | | | [DATE] |
```

### Guidelines:

**Action:** Frame as a decision to be made
- ✅ "Decide: Use PostgreSQL or MongoDB for database?"
- ✅ "Clarify: Should admin users see all posts or only their own?"
- ❌ "Answer my question"

**Why Agent Can't Do It:**
- State the question clearly
- List options if there are specific choices
- Mention default if you have a recommendation
- ✅ "Need DB choice. Options: PostgreSQL (relational, complex queries) or MongoDB (flexible schema, simpler). Recommend PostgreSQL for this use case."
- Keep under 200 chars

**Response:** ALWAYS LEAVE EMPTY

**Blocking:** Leave EMPTY for questions (not blocking, agent can work on other tasks)

**Since:** Current date in YYYY-MM-DD format

### Example Output:

```markdown
| Decide: PostgreSQL or MongoDB? | Need DB choice for user data. Options: PostgreSQL (better for relational) or MongoDB (simpler). Recommend PostgreSQL for structured user data. | | | 2026-01-25 |
```

## Provide ONLY the table row, no additional text.
