---
name: intent-classification
description: Classifies task intent as outcome_only, what_only, or what_and_how. Determines if research phase is required.
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: TASK_DESCRIPTION
    type: string
    required: false
  - name: TASK_PRIORITY
    type: enum[P1,P2,P3]
    required: true
---

# Intent Classification Task

Analyze the following task and classify its intent level:

## Task Details

**Title:** {{TASK_TITLE}}
**Priority:** {{TASK_PRIORITY}}
**Description:** {{TASK_DESCRIPTION}}

## Classification Types

### outcome_only
- User expresses a **desired outcome** but no implementation details
- Example: "I want to be seen as a thought leader in AI"
- **Research required:** YES - need to explore HOW to achieve the outcome

### what_only
- User specifies **WHAT to build** but not HOW
- Example: "Build a blog post about continuous agents"
- **Research required:** YES - need to investigate approach and patterns

### what_and_how
- User provides **WHAT to build AND HOW to build it**
- Example: "Write a post using the outline in drafts/ and publish to /blog"
- **Research required:** NO - implementation path is clear

## Your Task

Provide a JSON response with:

```json
{
  "type": "outcome_only" | "what_only" | "what_and_how",
  "confidence": 0-100,
  "reasoning": "Why you classified it this way",
  "research_required": true | false,
  "suggested_research_questions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}
```

### Research Questions Guidelines

If research is required, suggest 3-5 specific questions that should be answered before implementation:
- What existing patterns/tools exist for this?
- What are best practices in this domain?
- What are common pitfalls to avoid?
- What dependencies or integrations are needed?
- What similar projects can we learn from?
