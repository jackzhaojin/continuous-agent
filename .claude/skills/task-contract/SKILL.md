# Task Contract Skill

Instructions for creating valid task contracts.

## What is a Task Contract?

A Task Contract is the agreement between Executive and Worker that defines:
- What needs to be done
- How success is measured
- What constraints apply
- What resources are available

**No work without a valid task contract.**

## Contract Schema

```yaml
task_contract:
  # Identity
  id: "task-YYYY-MM-DD-NNN"
  created_at: "ISO8601"

  # Source
  source_goal: "Title from goals.md"
  priority: "P1|P2|P3"

  # Intent Classification
  intent_type: "outcome_only|what_only|what_and_how"
  research_required: true|false

  # Goal
  goal: |
    Clear description of what needs to be accomplished.
    Include context and acceptance criteria.

  # Chosen Approach (after research if needed)
  chosen_approach: |
    The specific approach selected.
    Technologies, patterns, methods.

  # Success Criteria
  definition_of_done:
    - "First criterion"
    - "Second criterion"
    - "Each must be verifiable"

  # Scope
  scope:
    repos_allowed:
      - "~/dev/agent-outputs"
    repos_forbidden:
      - "~/dev/continuous-agent/src"  # Don't modify agent code
    tools_allowed:
      - "Read"
      - "Write"
      - "Edit"
      - "Bash"
      - "Glob"
      - "Grep"
    max_turns: 50

  # Risk Assessment
  risk_level: "low|medium|high"
  risk_factors:
    - "Factor 1"
  risk_notes: |
    Informational notes about risks.
    NOT blocking - just awareness.

  # Skills Required
  skills_required:
    technical:
      - "skill.id"
    functional:
      - "reason.decomposition"
```

## Creating Contracts

### Step 1: Classify Intent

Determine the goal type:
- **outcome_only**: "I want to be seen as thought leader" -> Research MANDATORY
- **what_only**: "Build a blog post" -> Research MANDATORY
- **what_and_how**: "Write post using outline in drafts/" -> Execute directly

### Step 2: Research (if needed)

For outcome_only or what_only:
1. Investigate implementation options
2. Check preferences.md
3. Consider API/infrastructure implications
4. Weigh tradeoffs
5. Document chosen approach

### Step 3: Define DoD

Definition of Done must be:
- **Specific**: Not "make it work" but "npm run build exits 0"
- **Verifiable**: Can be checked by a verifier
- **Complete**: All success criteria covered
- **Ordered**: First items are most critical

### Step 4: Assess Risk

Risk levels:
- **Low**: Standard operations, reversible
- **Medium**: New patterns, external dependencies
- **High**: Cost, production, irreversible

High risk doesn't block - it informs. Log prominently.

### Step 5: Scope Limits

Always specify:
- Where worker CAN operate
- Where worker MUST NOT operate
- Which tools are allowed
- Maximum turns

## Contract Validation

Before execution, verify:
- [ ] goal is clear and actionable
- [ ] DoD items are specific and verifiable
- [ ] scope is defined
- [ ] intent is classified
- [ ] research done if required
- [ ] skills required are identified
- [ ] contract logged to ledger

## Example Contract

```yaml
id: "task-2026-01-25-001"
created_at: "2026-01-25T10:00:00Z"

source_goal: "Build Next.js transactional app"
priority: "P1"

intent_type: "what_only"
research_required: true

goal: |
  Build a full-stack CRUD app demonstrating data management
  with Next.js App Router + API routes + mock database.

chosen_approach: |
  Next.js 14+ with App Router
  API Routes for CRUD
  JSON file mock database
  Server Actions for forms
  Tailwind for styling

definition_of_done:
  - "App scaffolded with create-next-app"
  - "CRUD API routes implemented"
  - "Mock database working"
  - "UI displays data, allows CRUD"
  - "npm run build passes"
  - "README with run instructions"

scope:
  repos_allowed:
    - "~/dev/agent-outputs/projects/"
  tools_allowed:
    - "Read"
    - "Write"
    - "Edit"
    - "Bash"
  max_turns: 100

risk_level: "low"
risk_factors:
  - "New project from scratch"

skills_required:
  technical:
    - "nextjs.build.basic"
    - "node.npm.install"
    - "git.branch_commit"
  functional:
    - "reason.decomposition"
    - "comm.documentation"
```
