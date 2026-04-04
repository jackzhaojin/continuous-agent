---
name: research-phase
description: Research phase prompt for outcome_only and what_only tasks. Requires research before implementation.
version: 1.0.0
variables:
  - name: INTENT_TYPE
    type: enum[outcome_only,what_only,what_and_how]
    required: true
  - name: CONFIDENCE
    type: number
    required: true
  - name: REASONING
    type: string
    required: true
  - name: RESEARCH_QUESTIONS
    type: string
    required: true
---

## RESEARCH PHASE REQUIRED

This goal is classified as: **{{INTENT_TYPE}}** (confidence: {{CONFIDENCE}}%)
Reasoning: {{REASONING}}

**Before writing any code, you MUST research:**

{{RESEARCH_QUESTIONS}}

### Research Steps:

1. Read any existing related code/docs in the workspace
2. Search for patterns in similar projects
3. If needed, use WebSearch/WebFetch to find best practices
4. Document your findings and chosen approach
5. THEN proceed with implementation

**Do not skip research.** Vague goals that are executed without research fail repeatedly.

### Claude Code Skills Available

You have access to these Claude Code skills via the `Skill` tool:

**Project Documentation:**
- `/prd-writer` - Create Product Requirements Documents (WHY and WHAT)
- `/project-architect` - Design system architecture (WHAT and HOW at high level)
- `/task-breakdown` - Break features into detailed implementation steps (HOW and WHEN)
- `/project-analysis` - Analyze existing codebase patterns

**Use these skills BEFORE coding complex features to plan properly.**

For multi-day complex features, follow this progression:
1. PRD Writer (define problem and requirements)
2. Project Architect (design system)
3. Task Breakdown (detail implementation)
4. Implementation (execute tasks)
