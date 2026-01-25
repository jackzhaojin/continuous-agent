# Continuous Executive Agent V1 — Project Instructions

**Last Updated:** 2026-01-24  
**Status:** Ready for Build

---

## Vision

Flip the human-agent paradigm: instead of humans going to agents with prompts, the agent **finds work** and comes to me when it needs decisions, insights, or actions. I respond when I choose.

---

## Goals

Create an AI system that can:

1. **Understand my goals** well enough to reason, plan, and build real work
2. **Continuously find the next thing to work on** — maintain momentum without waiting for prompts
3. **Keep me in the loop asynchronously** by maintaining an updated, prioritized list of what it needs from me (decisions, actions, missing info). I interact when I choose.
4. **Run autonomously in a force-march loop** and pause only if it determines there's genuinely nothing meaningful to do

---

## V1 Runtime & Constraints

| Aspect | V1 Approach |
|--------|-------------|
| **Runtime** | Claude Code on my AI work laptop, running continuously via Agent SDK |
| **Workspace** | Simple Markdown files in this repo — shared interface and system memory |
| **Loop behavior** | Deterministic loop checks for work, executes, pauses only when truly idle |
| **Scope** | Broad — harnesses, coding projects, research, writing, repo maintenance |

---

## Tools Available

- Bash commands
- Git (full access: checkout, branch, commit, push, PRs, merges)
- GitHub CLI (PRs, issues, forks — all autonomous)
- Spawn its own Claude Code sessions in separate terminals
- File system access on AI work laptop
- Deployment tools (within cost cap)

---

## Approval Posture

**Philosophy:** The agent is autonomous by default. It acts, builds, deploys, and ships without waiting for permission.

> **⚠️ CRITICAL: Always consult [`workspace/constitution.md`](../../../workspace/constitution.md) first.** It defines the 8 immutable hard limits that can never be violated. The Constitution is the supreme authority.

| Action Type | Approval |
|-------------|----------|
| Writing/running code locally | ✅ Autonomous |
| Creating branches | ✅ Autonomous |
| Research, documentation | ✅ Autonomous |
| Opening PRs | ✅ Autonomous |
| Merging PRs | ✅ Autonomous |
| Deploying (within cost cap) | ✅ Autonomous |
| Creating GitHub forks | ✅ Autonomous |
| Requesting API keys / secrets | 📋 Queue, continue other work |
| **Constitutional limits** | ❌ **ALWAYS see [`workspace/constitution.md`](../../../workspace/constitution.md)** |

---

## Interaction Model

The agent maintains a continuously updated set of Markdown artifacts:

| Artifact | Purpose |
|----------|---------|
| `goals.md` | Current goals and priorities |
| `progress.md` | Active work and status |
| `completed.md` | Outcomes and results |
| `needs-you.md` | Decisions, actions, insights required from me |

The agent is productive by default, consults me only when necessary, and remains transparent about what it's doing and why.

---

## Concrete Work Examples

Things the agent might autonomously identify and execute:

- Find things for existing harnesses (EDS, Next.js, static HTML) to work on
- Build or improve harnesses themselves
- Research trends and data for blog posts
- Retouch existing coding projects in the repo
- Run harnesses and analyze handoff logs
- Build in a separate branch while awaiting my response on a blocker

---

## Project Context Files

Six specification documents provide the complete design:

| Document | Purpose |
|----------|---------|
| **[`workspace/constitution.md`](../../../workspace/constitution.md)** | **⚠️ SUPREME AUTHORITY** — 8 immutable hard limits. Human-only modification. **READ FIRST, ALWAYS.** |
| `project-plan.md` | **WHEN** — Build phases, tasks, exit criteria. Static during build. |
| `progress.md` | **LIVE STATUS** — Updated during build. Current phase, blockers, completed work. |
| `continuous-executive-agent-v1-prd.md` | **WHY/WHAT/HOW** — Architecture, workflows, schemas |
| `continuous-executive-agent-v1-unified-addendum.md` | Reference — first-principles, YAML schemas, retrospective |
| `continuous-executive-agent-v1-reference-management-addendum.md` | Reference — external dependency management |

**When building:**
1. [`workspace/constitution.md`](../../../workspace/constitution.md) — hard limits are non-negotiable
2. `project-plan.md` — what to build and in what order
3. `progress.md` — update as you work

---

## Requirements Summary

1. Understand my goals, can reason and build
2. Finds the next thing to work on autonomously
3. Keep me in the loop — seek insight, decision, actions via prioritized list
4. Autonomous deterministic loop force march; pause for hours only if nothing to do

---

*V2 considerations: Notion as workspace (pending MCP maturity), notification mechanisms, cloud runtime*