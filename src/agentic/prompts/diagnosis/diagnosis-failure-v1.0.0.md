---
name: diagnosis-failure
description: Diagnostic investigation prompt for task failures after 3+ attempts. Identifies root cause and suggests corrective actions.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: ERROR_MESSAGE
    type: string
    required: true
  - name: ATTEMPTS
    type: number
    required: true
  - name: STRATEGIES_TRIED
    type: string
    required: true
  - name: OUTPUT_PATH
    type: string
    required: true
---

# Failure Diagnosis

After {{ATTEMPTS}} failed attempts, diagnose root cause for: **{{TASK_TITLE}}**

## Failure Details

**Error Message:** {{ERROR_MESSAGE}}

**Strategies Tried:** {{STRATEGIES_TRIED}}

**Output Directory:** {{OUTPUT_PATH}}

## Your Task

Investigate the failure and provide diagnostic analysis.

**Available Tools:** Read, Glob, Grep, Bash (read-only commands)

Provide a JSON response:

```json
{
  "root_cause": {
    "category": "auth" | "dependency" | "configuration" | "logic_error" | "resource" | "external" | "unclear_requirement",
    "diagnosis": "Specific explanation of what's wrong",
    "confidence": 0-100
  },
  "evidence": [
    "Evidence 1 from logs/files",
    "Evidence 2 supporting diagnosis"
  ],
  "why_strategies_failed": {
    "strategy1": "Why this approach didn't work",
    "strategy2": "Why this approach didn't work"
  },
  "recommended_actions": [
    {
      "action": "Specific action to take",
      "type": "agent_can_do" | "needs_human" | "needs_research",
      "rationale": "Why this would help"
    }
  ],
  "alternative_approaches": [
    "Approach 1 not yet tried",
    "Approach 2 not yet tried"
  ]
}
```

## Diagnosis Process

### 1. Read Output Directory
- Check what files exist
- Read relevant logs/error output
- Look for patterns in failures

### 2. Check Error Messages
- Parse the error message
- Identify error type (auth, network, logic, etc.)
- Note any stack traces or error codes

### 3. Review Strategies Tried
- Did strategies actually try different approaches?
- Were strategies appropriate for the error type?
- Did each attempt learn from previous ones?

### 4. Identify Root Cause
- **auth:** Missing credentials, invalid tokens
- **dependency:** Missing packages, wrong versions
- **configuration:** Wrong config files, env vars
- **logic_error:** Bug in implementation
- **resource:** Out of memory, disk space, rate limits
- **external:** Third-party service down/changed
- **unclear_requirement:** Task requirements ambiguous

### 5. Recommend Actions

**Agent Can Do:**
- Try a different approach
- Simplify scope
- Add debugging/logging
- Research alternative patterns

**Needs Human:**
- Provide credentials
- Clarify requirements
- Grant access/permissions
- Make decisions on trade-offs

**Needs Research:**
- Learn about new API/tool
- Find working examples
- Understand patterns better

## Investigation Guidelines

### Check Typical Issues

1. **Authentication:**
   - Missing API keys in .env.executive or .env.worker
   - Invalid credentials
   - Expired tokens
   - Wrong authentication method

2. **Dependencies:**
   - Missing packages in package.json
   - Version conflicts
   - Wrong Node/npm version
   - Platform-specific issues

3. **Configuration:**
   - Missing config files
   - Wrong paths/URLs
   - Environment-specific settings

4. **Code Issues:**
   - Syntax errors
   - Logic bugs
   - Async/await problems
   - Type errors

5. **External Services:**
   - API rate limits
   - Service downtime
   - Changed API contracts
   - Network issues

### Gather Evidence

- Read error logs
- Check file contents
- Review git history
- Examine package.json
- Check environment setup

### Be Specific

- ❌ "Something is wrong with auth"
- ✅ "Missing NOTION_API_KEY in .env.executive, causing 401 errors. Tried with invalid token format, then with no token."

### Actionable Recommendations

- Provide specific next steps
- Explain why each would help
- Prioritize by likely success
- Note which actions need human involvement
