---
name: needs-you-blocker
description: Creates needs-you.md entry for a blocked task after 10 retries. Explains what was tried and what's needed.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: BLOCKER_TYPE
    type: enum[auth,api_key,permission,unclear_requirement,technical_limitation,external_dependency]
    required: true
  - name: ERROR_DETAILS
    type: string
    required: true
  - name: ATTEMPTS
    type: number
    required: true
  - name: STRATEGIES_TRIED
    type: string
    required: true
  - name: WHAT_WOULD_UNBLOCK
    type: string
    required: true
---

# Create needs-you.md Blocker Entry

Task "{{TASK_TITLE}}" has been blocked after {{ATTEMPTS}} attempts. Create a clear needs-you.md entry.

## Blocker Details

**Type:** {{BLOCKER_TYPE}}
**Error:** {{ERROR_DETAILS}}
**Strategies Tried:** {{STRATEGIES_TRIED}}

## What Would Unblock

{{WHAT_WOULD_UNBLOCK}}

## Your Task

Generate a needs-you.md table entry in this exact format:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| [ACTION_NEEDED] | [CLEAR_EXPLANATION] | | BLOCKING | [DATE] |
```

### Guidelines for Each Column:

**Action:** Clear, specific action requested (50-100 chars)
- ✅ "Get Notion API integration token"
- ✅ "Clarify: should users be able to delete posts?"
- ❌ "Help needed" (too vague)
- ❌ "Fix the authentication system" (too broad)

**Why Agent Can't Do It:** Brief explanation with error/attempts (100-200 chars)
- Include key error message
- Mention number of attempts
- Explain constitutional limit if applicable
- ✅ "401 Unauthorized after 10 attempts. Need API credentials. (Constitution: no credential generation)"
- ❌ Long stack traces or verbose explanations

**Response:** ALWAYS LEAVE EMPTY (human fills this)

**Blocking:** ALWAYS "BLOCKING" for blocked tasks

**Since:** Current date in YYYY-MM-DD format

### Example Output:

```markdown
| Get Notion API token | 401 Unauthorized after 10 attempts with Notion MCP. Need integration token with pages:write scope. (Constitution: can't generate credentials) | | BLOCKING | 2026-01-25 |
```

## Provide ONLY the table row, no additional text.
