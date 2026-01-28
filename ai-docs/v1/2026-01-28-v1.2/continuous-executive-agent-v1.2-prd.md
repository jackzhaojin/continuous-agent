# Continuous Executive Agent V1.2 - Product Requirements Document

**Version:** 1.2  
**Date:** 2026-01-27  
**Status:** Draft  
**Author:** Claude (with Jack Zhao Jin)

---

## TLDR: Feature Overview

### V1.0 → V1.1 → V1.2 Evolution

| Version | Theme | Key Capabilities |
|---------|-------|------------------|
| **V1.0** | Foundation | Executive loop, task contracts, worker spawning, constitution |
| **V1.1** | Execution | Multi-step tasks, step resumption, self-enhancement, project persistence |
| **V1.2** | Learning & Visibility | Goal maturation, multi-project access, Notion reporting, skill absorption |

### V1.2 Features at a Glance

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **Goal State Machine** | Folder-based pipeline: drafts → ondeck → in-progress → blocked → archive | Goals mature before execution; no more wasted retries on half-baked ideas |
| **Goal Bundles** | Each goal is a folder with PROMPT.md + references/assets (mirrors skill structure) | Space for specs to breathe; complex goals get proper scaffolding |
| **Multi-Project Access** | Copy-in → isolated work → approval → copy-back | Agent can enhance your existing projects safely |
| **Notion Reporting** | Beautiful dashboard of milestones, highlights, summaries | Rich visibility into agent activity without parsing logs |
| **Project-Based Skills** | Confidence anchored to actual built projects | Agent references real outputs, not abstract percentages |
| **Knowledge Absorption** | Agent learns from prompt logs, harnesses, spec-driven patterns | Executive agent inherits your battle-tested approaches |

---

## Version History Summary

### V1.0: The Foundation

**Core innovation:** Flip the human-agent paradigm—agent finds work, human responds asynchronously.

**What was built:**
- **Executive Loop** — 8-phase continuous cycle: health check → check inputs → select work → create contract → execute → validate → update state → continue/sleep
- **Two-Repository Architecture** — `continuous-agent/` for infrastructure, `agent-outputs/` for worker outputs
- **Task Contract System** — Every task declares scope, risk, Definition of Done before execution
- **Constitution** — 8 immutable hard limits (spending, deletions, publishing, credentials, access control, output isolation, logging, persistence)
- **Workspace Files** — Markdown-based state: goals.md, progress.md, needs-you.md, completed.md
- **Verifier System** — Deterministic validation after each task
- **Capability Tracking** — YAML registries for technical/delivery/functional capabilities

**Key outcome:** Agent runs continuously via PM2, finds work from goals.md, executes autonomously, blocks only when genuinely stuck.

---

### V1.1: Execution Maturity

**Core innovation:** Multi-step task execution with intelligent resumption.

**What was built:**
- **Incremental Execution** — Complex tasks auto-broken into steps (100+ turns each)
- **Step Resumption** — Agent resumes mid-task after PM2 restart or priority switch
- **Project Directory Persistence** — `output_path` tracked in goals.md; no more duplicate folders
- **Self-Enhancement Workflow** — Dedicated subagent modifies agent codebase on branches
- **Branch Tracking** — Goals track their working branch to prevent duplicates
- **POC Infrastructure** — `references/poc/` with validated Agent SDK patterns (skills, subagents)
- **needs-you.md Interaction** — Full async loop: agent blocks → human responds → agent detects → resumes

**Key outcome:** Agent can work on 50+ hour tasks across days, pause for priority switches, resume intelligently.

---

## V1.2: Learning & Visibility

### Vision

V1.2 transforms the agent from a task executor into a **learning system with rich visibility**. Goals mature through a structured pipeline. The agent works on your existing projects safely. Notion provides a beautiful window into agent activity. Past work informs future execution.

---

## Feature 1: Goal State Machine

### Problem

In v1.1, everything in goals.md is "ready to execute." Half-baked ideas go straight to P1, burning retries while the agent figures out what you meant.

### Solution

Folder-based state pipeline where goals mature before execution:

```
workspace/
├── drafts/              # Ideas baking
│   └── {goal-slug}/
│       ├── PROMPT.md    # Execution instructions (always required)
│       ├── references/  # Research, links, prior art
│       └── assets/      # Diagrams, mockups
│
├── ondeck/              # Ready, awaiting priority
│   └── {goal-slug}/
│
├── in-progress/         # Active work
│   ├── P1/
│   ├── P2/
│   └── P3/
│
├── blocked/             # Hard blocked on human
│   └── {goal-slug}/
│
└── archive/             # Completed
    └── 2026-01/         # Grouped by month
        └── {goal-slug}/
```

### State Flow

```
┌──────────┐    human     ┌──────────┐    human     ┌─────────────┐
│  DRAFTS  │ ──────────►  │  ONDECK  │ ──────────►  │ IN-PROGRESS │
│          │   "ready"    │          │  assigns P#  │   P1/P2/P3  │
└──────────┘              └──────────┘              └─────────────┘
     │                                                    │
     │ agent researches                          agent executes
     │ agent suggests "ready"                           │
     │                                                    ▼
     │                                              ┌──────────┐
     │                              10 retries      │ BLOCKED  │
     │                              exhausted ◄─────│          │
     │                                              └──────────┘
     │                                                    │
     │                                        human responds
     │                                                    ▼
     │                                              ┌──────────┐
     │                              DoD met         │ ARCHIVE  │
     └──────────────────────────────────────────►  │ /2026-01 │
                                                   └──────────┘
```

### Agent Behavior by State

| State | Agent Can | Agent Cannot |
|-------|-----------|--------------|
| **drafts** | Research, add findings, suggest "ready" | Execute |
| **ondeck** | Review, estimate, suggest priority | Execute without priority |
| **in-progress** | Full execution, spawn workers | Skip verification |
| **blocked** | Work on other goals, research alternatives | Retry without human input |
| **archive** | Reference for learning | Modify |

### Goal Bundle Structure

Every goal lives in a folder with PROMPT.md as the entry point (mirrors skill structure):

```
{goal-slug}/
├── PROMPT.md          # Required: execution instructions (agent reads this)
├── references/        # Optional: research, prior art
├── assets/            # Optional: diagrams, mockups
└── scripts/           # Optional: supporting automation
```

**PROMPT.md** (required) - Agent execution instructions:
- Title, status, priority, complexity
- Problem context and motivation
- Definition of Done (checkable criteria)
- Execution approach (what the agent should do)
- Open questions (for drafts)
- Agent notes (accumulated during work)

This mirrors the skill pattern where `SKILL.md` is the single entry point.

### Task Templates

Agent scaffolds based on complexity:

- **Simple** (< 2 hours): PROMPT.md only
- **Medium** (2-8 hours): PROMPT.md + references/
- **Complex** (> 8 hours): Full bundle with PROMPT.md + references/ + assets/ + steps breakdown

---

## Feature 2: Multi-Project Access

### Problem

V1.1 agent can only write to agent-outputs. Your existing projects (harnesses, blogs, tools) can't be enhanced without manual copy-paste.

### Solution

Copy-in → isolated work → approval → copy-back pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL PROJECT WORKFLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. COPY-IN                                                     │
│     ┌──────────────────┐         ┌─────────────────────────┐   │
│     │ /Users/jackjin/  │ ──────► │ agent-outputs/external/ │   │
│     │ dev/harness-eds  │  copy   │ harness-eds/            │   │
│     └──────────────────┘         └─────────────────────────┘   │
│                                         │                       │
│  2. ISOLATED WORK                       ▼                       │
│     Agent works in copied directory                             │
│     Original project untouched                                  │
│     All changes tracked in git                                  │
│                                         │                       │
│  3. APPROVAL REQUEST                    ▼                       │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ needs-you.md:                                        │    │
│     │ "Ready to apply changes to harness-eds"             │    │
│     │ Changes: +testimonial block, +responsive fix        │    │
│     └─────────────────────────────────────────────────────┘    │
│                                         │                       │
│  4. COPY-BACK (after human approval)    ▼                       │
│     ┌─────────────────────────────┐         ┌──────────────┐   │
│     │ agent-outputs/external/     │ ──────► │ Original     │   │
│     │ harness-eds/                │  apply  │ project      │   │
│     └─────────────────────────────┘         └──────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Copy-In/Copy-Back?

- **Repeatable** — If agent messes up, original is untouched
- **Auditable** — Full git history in isolated copy
- **Safe** — Constitution-compliant (no unexpected external changes)
- **Resumable** — Copy persists across PM2 restarts

### Project Registry

Agent maintains a registry of known external projects it can work on. Human adds projects to registry; agent can reference and copy-in when goals require.

---

## Feature 3: Notion Reporting

### Problem

Agent activity lives in local ledger files. Understanding what agent did requires parsing JSONl and log files. No beautiful visibility.

### Solution

Notion MCP integration for rich, visual reporting:

```
┌─────────────────────────────────────────────────────────────────┐
│                      NOTION DASHBOARD                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   MILESTONES    │  │   HIGHLIGHTS    │  │    SUMMARIES    │ │
│  │   (immediate)   │  │ (agent-curated) │  │ (daily/weekly)  │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │ • Task started  │  │ • Clever fix    │  │ • Tasks done: 5 │ │
│  │ • Task complete │  │ • New pattern   │  │ • Turns: 1,247  │ │
│  │ • Task failed   │  │ • Breakthrough  │  │ • Top win: X    │ │
│  │ • Task blocked  │  │ • Struggle won  │  │ • Blocker: Y    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  NOT included: Full audit trail, every turn, raw logs           │
│  (Those stay in local ledgers for debugging)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Report Types

| Report | When | Content |
|--------|------|---------|
| **Milestones** | On event | Task started, completed, failed, blocked |
| **Highlights** | Agent-curated | Notable achievements, interesting solutions, hard-won victories |
| **Daily Summary** | End of day | Tasks touched, progress, blockers, narrative |
| **Weekly Rollup** | End of week | Metrics, trends, accomplishments, learnings |

### What Goes to Notion vs Local

| Notion (Visibility) | Local Ledgers (Debugging) |
|---------------------|---------------------------|
| Milestones | Full event stream |
| Highlights | Every turn/action |
| Summaries | Raw worker logs |
| Key metrics | Retry details |
| Agent narrative | Error traces |

---

## Feature 4: Project-Based Skills

### Problem

V1.1 tracks capability confidence as abstract percentages in YAML. "NextJS: 75%" doesn't tell the agent what it actually knows how to do.

### Solution

Anchor skills to actual built projects:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROJECT-BASED SKILLS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Instead of:                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ nextjs:                                                  │   │
│  │   confidence: 75%                                        │   │
│  │   last_success: 2026-01-25                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Now:                                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ nextjs:                                                  │   │
│  │   projects_built:                                        │   │
│  │     - path: agent-outputs/projects/nextjs/2026-01-25/   │   │
│  │       name: transactional-app                           │   │
│  │       features: [auth, crud, deployment]                │   │
│  │       lessons: "JWT refresh needed custom middleware"   │   │
│  │     - path: agent-outputs/projects/nextjs/2026-01-20/   │   │
│  │       name: dashboard-poc                               │   │
│  │       features: [charts, real-time]                     │   │
│  │       lessons: "Recharts works better than Chart.js"   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Agent can now:                                                 │
│  • Reference actual code it wrote                              │
│  • Recall specific lessons learned                             │
│  • Pattern-match new tasks to past successes                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Benefits

- **Concrete** — "I built X" vs "I'm 75% confident"
- **Referenceable** — Agent can look at its own past code
- **Learning** — Lessons captured per project
- **Pattern matching** — New task similar to past success? Use same approach.

---

## Feature 5: Knowledge Absorption

### Problem

You have battle-tested approaches in prompt logs, harnesses, and spec-driven projects. Agent doesn't learn from your expertise.

### Solution

Agent absorbs patterns from your past work:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE ABSORPTION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sources:                                                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Prompt Logs   │  │   Harnesses   │  │  Spec-Driven  │       │
│  │ (ai-docs/)    │  │ (registered)  │  │   Projects    │       │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
│          │                  │                  │                │
│          └──────────────────┼──────────────────┘                │
│                             ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ Agent extracts: │                          │
│                    │ • Patterns      │                          │
│                    │ • Techniques    │                          │
│                    │ • Preferences   │                          │
│                    │ • Anti-patterns │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│                             ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ Applied when:   │                          │
│                    │ • Similar task  │                          │
│                    │ • Same domain   │                          │
│                    │ • Research phase│                          │
│                    └─────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Agent Learns

| Source | Absorbs |
|--------|---------|
| **Prompt logs** | Conversation patterns, how you think through problems |
| **Harnesses** | Execution patterns, tool chains, verification approaches |
| **Spec-driven projects** | Requirement gathering, iterative refinement, quality gates |

### Application

- **Research phase** — Check: "Have I (or Jack) solved something similar?"
- **Strategy selection** — Prefer approaches that worked before
- **Pattern matching** — New goal resembles past success? Start from that approach.

---

## Feature 6: Cloud Ledger Storage (Deferred to V1.3)

### Note

Cloud storage for ledgers (Airtable/Cosmos DB/Supabase) is **deferred to V1.3**. 

Rationale:
- Notion reporting provides the visibility you need now
- Local ledgers work fine for debugging
- Cloud migration is infrastructure work that doesn't change agent behavior
- V1.2 scope is already substantial

Local ledgers will be .gitignored in v1.2. Cloud migration happens when we need cross-device access or long-term analytics.

---

## Success Criteria

### V1.2 is complete when:

| Criterion | Measure |
|-----------|---------|
| **Goals mature** | Agent won't execute drafts; only in-progress/P{n} goals run |
| **Bundles work** | Complex goal with PROMPT.md + references successfully executes |
| **External projects enhanced** | Copy-in → work → approve → copy-back completes end-to-end |
| **Notion populated** | Milestones, highlights, and weekly summary visible in dashboard |
| **Skills reference projects** | Agent cites past work when executing similar tasks |
| **Knowledge applied** | Agent references prompt log patterns in research phase |

---

## Implementation Sequence

Suggested order (building agent decides final approach):

1. **Goal State Machine** — Folder structure, state transitions, agent behavior rules
2. **Goal Bundles** — PROMPT.md parsing, template scaffolding
3. **Notion Integration** — MCP connection, milestone reporting, summary generation
4. **Multi-Project Access** — Copy-in workflow, registry, approval flow, copy-back
5. **Project-Based Skills** — Migrate from percentage confidence to project references
6. **Knowledge Absorption** — Prompt log indexing, pattern extraction, application

---

## Appendix: Branching Model

For context, current development workflow:

- **main** — Stable, urgent fixes
- **develop** — Feature work via git worktree
- **Prompt logs** — Captured on both branches in ai-docs/

Agent should understand this model when working on self-enhancement tasks.

---

**End of V1.2 PRD**

*This document provides outcomes and constraints. Implementation details are left to the building agent.*
