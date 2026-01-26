---
name: dod-creation
description: Creates Definition of Done criteria for a task. Criteria must be verifiable, specific, and aligned with available verifiers.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: APPROACH
    type: string
    required: true
  - name: VERIFIERS_AVAILABLE
    type: string
    required: true
---

# Create Definition of Done

Create verifiable Definition of Done criteria for this task.

## Task Details

**Title:** {{TASK_TITLE}}
**Approach:** {{APPROACH}}

## Available Verifiers

{{VERIFIERS_AVAILABLE}}

## Your Task

Provide a JSON response with 3-7 specific, verifiable criteria:

```json
{
  "definition_of_done": [
    "Criterion 1 (verifiable)",
    "Criterion 2 (verifiable)",
    "Criterion 3 (verifiable)"
  ],
  "verifier_mapping": {
    "Criterion 1": ["git-status-clean", "node-build"],
    "Criterion 2": ["node-test"],
    "Criterion 3": ["docs-complete"]
  }
}
```

## Guidelines

### GOOD Criteria (Verifiable)
- ✅ "Application builds successfully (npm run build passes)"
- ✅ "All tests pass (npm test returns 0)"
- ✅ "Git working directory is clean (no uncommitted changes)"
- ✅ "README.md exists with run instructions"
- ✅ "API endpoints return expected responses"

### BAD Criteria (Not Verifiable)
- ❌ "Code is clean and well-structured" (subjective)
- ❌ "Implementation follows best practices" (vague)
- ❌ "Works well" (not specific)
- ❌ "User will like it" (opinion)

### Criteria Categories

1. **Build/Compilation**
   - TypeScript compiles
   - No build errors
   - Dependencies install

2. **Testing**
   - Tests pass
   - Coverage meets threshold
   - No console errors

3. **Git/Version Control**
   - Changes committed
   - Working directory clean
   - Meaningful commit messages

4. **Documentation**
   - README exists
   - CLAUDE.md updated
   - Comments on complex logic

5. **Functionality**
   - Core features work
   - Edge cases handled
   - Errors handled gracefully

6. **Integration**
   - APIs respond correctly
   - External services connect
   - Data persists

### Align with Verifiers

Map each criterion to available verifiers:
- **git-status-clean:** Working directory has no uncommitted changes
- **node-build:** TypeScript compiles, build succeeds
- **node-test:** All tests pass
- **docs-complete:** README and essential docs exist
- **reference-integrity:** Reference registry is valid

### Quantity
- **Simple tasks:** 3-4 criteria
- **Medium tasks:** 4-6 criteria
- **Complex tasks:** 6-7 criteria

### Must Include
- At least one build/compilation criterion
- At least one git criterion
- Documentation criterion for new projects
