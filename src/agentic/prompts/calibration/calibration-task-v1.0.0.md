---
name: calibration-task
description: Generates calibration tasks to validate specific capabilities with evidence. Used before trusting a capability for real work.
version: 1.0.0
variables:
  - name: CAPABILITY_ID
    type: string
    required: true
  - name: CAPABILITY_DESCRIPTION
    type: string
    required: true
  - name: CURRENT_CONFIDENCE
    type: number
    required: true
  - name: TARGET_CONFIDENCE
    type: number
    required: true
---

# Generate Calibration Task

Create a calibration task to validate capability: **{{CAPABILITY_ID}}**

## Capability Details

**ID:** {{CAPABILITY_ID}}
**Description:** {{CAPABILITY_DESCRIPTION}}
**Current Confidence:** {{CURRENT_CONFIDENCE}}%
**Target Confidence:** {{TARGET_CONFIDENCE}}%

## Your Task

Design a calibration task that proves this capability works.

Provide a JSON response:

```json
{
  "task": {
    "title": "Calibration: [capability]",
    "description": "Specific task to test this capability",
    "success_criteria": [
      "Criterion 1",
      "Criterion 2"
    ],
    "estimated_turns": 50,
    "project_path": "ai-sandbox/calibration-[capability]-[date]"
  },
  "evidence_collection": {
    "verifiers_to_run": ["git-clean", "node-build"],
    "manual_checks": ["Check X", "Verify Y"],
    "confidence_update": {
      "on_success": "+20",
      "on_failure": "-10"
    }
  },
  "rationale": "Why this task proves the capability"
}
```

## Calibration Task Guidelines

### Task Characteristics
- **Small scope:** Can be completed in 50-100 turns
- **Clear success:** Binary pass/fail outcome
- **Isolated:** Doesn't depend on other systems
- **Safe:** Can't break anything important
- **Verifiable:** Has clear pass/fail criteria

### Example Calibration Tasks

**nextjs.build.basic:**
```
Title: "Calibration: Next.js hello world"
- Create new Next.js app with create-next-app
- Add one custom page
- Verify build and dev server work
- Commit with clean git status
```

**git.branch_commit:**
```
Title: "Calibration: Git workflow"
- Create new branch
- Make file changes
- Commit with proper message
- Verify git status clean
```

**notion.mcp.pages:**
```
Title: "Calibration: Notion page creation"
- Connect to Notion via MCP
- Create test page with content
- Verify page exists in Notion
- Delete test page
```

### Success Criteria
- Must be verifiable by automated verifiers where possible
- Should include manual verification steps if needed
- Must prove the capability works end-to-end

### Confidence Updates
- **Success:** +15 to +25 (based on difficulty)
- **Failure:** -10 to -20 (based on failure type)
- Higher updates for more comprehensive tests

### Project Naming
- Format: `calibration-[capability]-[date]`
- Example: `calibration-nextjs-2026-01-25`
- Keeps calibration projects organized and dated
