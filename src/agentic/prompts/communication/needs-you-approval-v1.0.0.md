---
name: needs-you-approval
description: Creates needs-you.md entry when agent hits a constitutional limit and needs explicit approval.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: ACTION
    type: string
    required: true
  - name: CONSTITUTIONAL_LIMIT
    type: enum[spending,deletion,publishing,credentials,access_control,agent_codebase,logging,retries]
    required: true
  - name: JUSTIFICATION
    type: string
    required: true
  - name: ALTERNATIVES_TRIED
    type: string
    required: false
---

# Create needs-you.md Approval Entry

Task "{{TASK_TITLE}}" requires action that hits constitutional limit #{{CONSTITUTIONAL_LIMIT}}.

## Action Requiring Approval

{{ACTION}}

## Constitutional Limit Hit

{{CONSTITUTIONAL_LIMIT}}

## Justification

{{JUSTIFICATION}}

## Alternatives Tried

{{ALTERNATIVES_TRIED}}

## Your Task

Generate a needs-you.md table entry:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| [APPROVAL: ACTION] | [CONSTITUTIONAL_LIMIT_EXPLANATION] | | BLOCKING | [DATE] |
```

### Guidelines:

**Action:** Prefix with "APPROVAL:" to indicate permission needed
- ✅ "APPROVAL: Deploy to production (cost: $5/month)"
- ✅ "APPROVAL: Publish npm package @org/package-name"
- ✅ "APPROVAL: Delete old database backups (permanent)"
- ❌ "Need approval" (not specific enough)

**Why Agent Can't Do It:**
- State which constitutional limit (#1-8)
- Explain why it's needed
- Mention cost if applicable
- Note alternatives tried
- ✅ "Constitution limit #1 (spending). Vercel deployment costs $5/mo. Free tier insufficient. Tried Netlify (also requires paid plan)."
- Keep under 250 chars

**Response:** ALWAYS LEAVE EMPTY

**Blocking:** ALWAYS "BLOCKING" for constitutional limits

**Since:** Current date in YYYY-MM-DD format

### Constitutional Limits Reference:

1. **Spending:** $20/month per service limit
2. **Deletion:** No permanent deletions (archive only)
3. **Publishing:** No external publishing without approval
4. **Credentials:** No credential exposure
5. **Access Control:** No making private things public
6. **Agent Codebase:** No output in agent codebase
7. **Logging:** All activity must be logged
8. **Retries:** 10 retries minimum before blocking

### Example Output:

```markdown
| APPROVAL: Deploy to Vercel ($5/mo) | Constitution #1 (spending). App needs edge functions for real-time features. Free tier limits deployment. Tried Netlify (same cost), Railway (no edge support). | | BLOCKING | 2026-01-25 |
```

## Provide ONLY the table row, no additional text.
