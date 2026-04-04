---
name: retry-context
description: Retry and persistence context for failed attempts. Provides previous attempt history and encourages different strategies.
version: 1.0.0
variables:
  - name: CURRENT_ATTEMPT
    type: number
    required: true
  - name: MAX_RETRIES
    type: number
    required: true
  - name: REMAINING_ATTEMPTS
    type: number
    required: true
  - name: STRATEGIES_TRIED
    type: string
    required: false
  - name: LAST_ERROR
    type: string
    required: false
  - name: IS_FINAL_ATTEMPTS
    type: boolean
    required: true
---

## PERSISTENCE STATUS

**Attempt {{CURRENT_ATTEMPT}} of {{MAX_RETRIES}}**
{{REMAINING_ATTEMPTS}} attempts remaining before this task is blocked.

### Previous Attempts Failed

Strategies tried: {{STRATEGIES_TRIED}}

Last error: {{LAST_ERROR}}

**This attempt MUST be different.** Consider:
- What assumption was wrong?
- What's a simpler version of this problem?
- What approach haven't you tried?
- Can you prove a smaller piece works first?

{{FINAL_ATTEMPTS_WARNING}}

## PERSISTENCE GUIDELINES

**AI is smart. Think, research, try, try again.**

- If something fails, understand WHY before retrying
- Try a DIFFERENT approach, not the same thing again
- Break complex problems into smaller pieces
- If stuck, simplify the scope to the minimum viable version
- Document what you learn for future attempts
