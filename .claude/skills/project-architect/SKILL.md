---
name: project-architect
description: Create comprehensive architectural documentation for complex features or projects requiring multiple components, clear API design, and phase-based implementation. Use when starting complex features (3+ days work) that need system design, component specifications, or multi-phase planning. Creates architecture docs in ai-docs/architect/ defining system components, data flow, API contracts, and implementation phases. Triggers on "design the architecture for...", "create system design for...", or complex feature requests after PRD exists.
---

# Project Architect

Create architectural documentation that defines HOW a system will be built at a high level.

## When to Use

Use this skill when:
- PRD exists and is approved
- Feature requires multiple components or systems
- Clear API design is needed
- Phase-based implementation is required
- Architectural decisions need documentation

Do NOT use for:
- Simple bug fixes or small features (< 1 day)
- When no PRD exists (use prd-writer first)
- Detailed task-level instructions (use task-breakdown)

## Workflow

### 1. Read the PRD

Start by reading the PRD to understand requirements, constraints, and success criteria.

### 2. Gather Technical Context

Ask clarifying questions:
- **Existing Patterns**: What similar features exist in the codebase?
- **Technology Choices**: Any required tech stack or frameworks?
- **Performance Needs**: Response time, scalability targets?
- **Integration Points**: What external systems are involved?

### 3. Design the Architecture

Create `ai-docs/architect/{feature-name}-architecture.md` using template from `references/architecture-template.md`.

**Key sections**:
- **Overview**: Purpose, goals, scope
- **System Architecture**: Components, data flow, integration points
- **Technical Design**: Tech stack, API design, component specs
- **Security & Performance**: Key considerations
- **Implementation Phases**: Logical order for building

### 4. Validate

Review with user before proceeding to task breakdown.

## Best Practices

- **Start with WHY**: Reference the PRD's business value
- **Be Specific**: File paths, function names, data structures
- **Show Trade-offs**: Document alternatives and why they were rejected
- **Think in Phases**: Break complex features into stages
- **Reference Examples**: Point to similar existing patterns
- **Component-First**: Define clear boundaries and interfaces

## Example

User: "Design the architecture for a real-time collaboration feature"

You: [Asks about existing patterns, tech preferences, performance needs]

Then creates: `ai-docs/architect/realtime-collaboration-architecture.md` with WebSocket design, state management, conflict resolution, and 3-phase implementation plan.

## Resources

- `references/architecture-template.md` - Full template with all sections

# Project Architect

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" → "Reading" → "Creating" → "Editing"
- Structure: ## Overview → ## Workflow Decision Tree → ## Step 1 → ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" → "Merge PDFs" → "Split PDFs" → "Extract Text"
- Structure: ## Overview → ## Quick Start → ## Task Category 1 → ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" → "Colors" → "Typography" → "Features"
- Structure: ## Overview → ## Guidelines → ## Specifications → ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" → numbered capability list
- Structure: ## Overview → ## Core Capabilities → ### 1. Feature → ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources

This skill includes example resource directories that demonstrate how to organize different types of bundled resources:

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: `fill_fillable_fields.py`, `extract_form_field_info.py` - utilities for PDF manipulation
- DOCX skill: `document.py`, `utilities.py` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Claude for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Claude's process and thinking.

**Examples from other skills:**
- Product management: `communication.md`, `context_building.md` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Claude should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Claude produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Any unneeded directories can be deleted.** Not every skill requires all three types of resources.
