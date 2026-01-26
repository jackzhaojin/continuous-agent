---
name: contract-creation
description: Creates a complete task contract from raw input. Includes interpreted goal, chosen approach, scope, risk, DoD, and logging obligations.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: RAW_INPUT
    type: string
    required: true
  - name: INTENT_TYPE
    type: enum[outcome_only,what_only,what_and_how]
    required: true
  - name: PREFERENCES_CONTENT
    type: string
    required: false
  - name: PRIORITY
    type: enum[P1,P2,P3]
    required: true
---

# Create Task Contract

Create a complete task contract for execution.

## Input Details

**Title:** {{TASK_TITLE}}
**Priority:** {{PRIORITY}}
**Raw Input:** {{RAW_INPUT}}
**Intent Type:** {{INTENT_TYPE}}

## User Preferences

{{PREFERENCES_CONTENT}}

## Your Task

Generate a complete task contract in JSON format:

```json
{
  "id": "task-[8_char_hex]",
  "goal": "Clear, actionable goal statement",
  "interpreted_goal": "How you understand this task",
  "chosen_approach": "Specific implementation approach chosen",
  "scope": {
    "repos_allowed": ["agent-outputs"],
    "repos_forbidden": ["continuous-agent"],
    "systems_allowed": ["file", "git", "npm", "node"],
    "systems_forbidden": ["production_deploy", "external_publish"],
    "tools_allowed": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    "max_file_modifications": 50,
    "isolated_workspace": true
  },
  "risk_assessment": "low|medium|high - brief explanation",
  "definition_of_done": [
    "Criterion 1",
    "Criterion 2",
    "Criterion 3"
  ],
  "required_skills": [
    "capability.id.1",
    "capability.id.2"
  ],
  "logging_obligations": [
    "Log what changed",
    "Log verifier results",
    "Log any blockers"
  ],
  "max_turns": 250,
  "estimated_duration_minutes": 120,
  "phases": []
}
```

## Contract Guidelines

### ID Generation
- Format: `task-` + 8 random hex chars
- Example: `task-a7f3b9c1`

### Goal vs Interpreted Goal
- **goal:** User's original request (verbatim)
- **interpreted_goal:** Your understanding and expansion

### Chosen Approach
- Be specific about technology choices
- Reference patterns from preferences if applicable
- Example: "Use Next.js 14 App Router with TypeScript, API routes for CRUD, mock JSON database"

### Scope
- **repos_allowed:** Always `["agent-outputs"]`
- **repos_forbidden:** Always `["continuous-agent"]` (Constitution #6)
- **systems_allowed:** List specific systems needed (git, npm, docker, etc.)
- **systems_forbidden:** External/production systems without approval
- **tools_allowed:** Claude Code tools needed
- **max_file_modifications:** Estimate (10-100)
- **isolated_workspace:** Always `true`

### Risk Assessment
- **low:** Standard CRUD, no external dependencies
- **medium:** External APIs, complex logic, multiple systems
- **high:** Production deploy, data deletion, credential handling

### Definition of Done
- 3-7 verifiable criteria
- Each must be checkable (builds, tests pass, docs exist, etc.)
- Be specific and measurable

### Required Skills
- List capability IDs from registry
- Example: `nextjs.build.basic`, `git.branch_commit`

### Logging Obligations
- What must be logged for audit trail
- Standard: changes made, verifier results, blockers

### Max Turns
- Simple tasks: 50-100 turns
- Medium tasks: 100-250 turns
- Complex tasks: Break into phases (100 turns per phase)

### Estimated Duration
- Rough estimate in minutes
- Used for complexity assessment and breakdown decisions
