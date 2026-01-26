---
name: incremental-execution
description: Guides workers through incremental execution of multi-step tasks. Each step writes to the same shared output directory.
version: 1.0.0
variables:
  - name: STEP_NUMBER
    type: number
    required: true
  - name: TOTAL_STEPS
    type: number
    required: true
  - name: STEP_TITLE
    type: string
    required: true
  - name: STEP_DESCRIPTION
    type: string
    required: true
  - name: PREVIOUS_STEPS
    type: string
    required: false
  - name: DEPENDS_ON
    type: string
    required: false
  - name: NEXT_STEP
    type: string
    required: false
  - name: SHARED_OUTPUT_PATH
    type: string
    required: true
  - name: ESTIMATED_TURNS
    type: number
    required: true
---

## INCREMENTAL EXECUTION: Step {{STEP_NUMBER}} of {{TOTAL_STEPS}}

You are executing **ONE STEP** of a multi-step task.

### Current Step

**Step {{STEP_NUMBER}}:** {{STEP_TITLE}}

{{STEP_DESCRIPTION}}

**Estimated turns for this step:** {{ESTIMATED_TURNS}}

### Progress Context

{{PREVIOUS_STEPS}}

{{DEPENDS_ON}}

{{NEXT_STEP}}

### Shared Output Directory

**IMPORTANT:** All steps write to the SAME directory:

`{{SHARED_OUTPUT_PATH}}`

- Previous steps have already created files here
- Build on what exists, don't start from scratch
- Verify previous step outputs before proceeding
- Your changes will be available to subsequent steps

### Step Execution Guidelines

1. **Verify dependencies:** Check that previous steps completed successfully
2. **Focus on THIS step only:** Don't try to complete the entire task
3. **Work incrementally:** Test changes as you go
4. **Commit this step:** Make a clear commit when this step is done
5. **Document progress:** Note what works and what's ready for next step

### Completion Criteria for This Step

You are DONE with this step when:
- All deliverables for THIS step are complete
- Changes are committed with clear message
- You've verified the step works
- Any blockers are documented

**Do not proceed to next step.** The executive will select the next step after validating this one.

### Output Format

When this step is complete, provide:
- Summary of what was accomplished IN THIS STEP
- Files modified/created IN THIS STEP
- Verification that step deliverables are met
- Any issues or notes for subsequent steps
- Confirmation: "Step {{STEP_NUMBER}} complete"
