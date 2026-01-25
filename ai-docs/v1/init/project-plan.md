# Continuous Executive Agent V1 — Project Plan (WHEN)

**Created:** 2026-01-24
**Status:** Ready for Build
**Type:** Static — This file is NOT updated during build. See `progress.md` for live status.

---

## Overview

This is the build plan for the Continuous Executive Agent V1 MVP infrastructure. The agent will build according to this plan, tracking progress in `progress.md`.

> **⚠️ CRITICAL: Always consult [`workspace/constitution.md`](../../../workspace/constitution.md) first.** All work must respect the 8 Constitutional hard limits.

---

## Phase 0: Human Setup (Pre-Build)

**Owner:** Human
**Duration:** ~30 minutes

| Task | Command/Action | Exit Criteria |
|------|----------------|---------------|
| Create agent repo | `mkdir -p ~/dev/continuous-agent && cd ~/dev/continuous-agent && git init` | Repo exists |
| Create outputs repo | `mkdir -p ~/dev/agent-outputs && cd ~/dev/agent-outputs && git init` | Repo exists |
| Create GitHub remotes | `gh repo create` for both | Remotes exist |
| Install dependencies | `npm init -y && npm install @anthropic-ai/claude-agent-sdk typescript @types/node` | package.json exists |
| Say "proceed with bootstrap" | Human message | Agent begins Phase 1 |

---

## Phase 1: Workspace Bootstrap

**Owner:** Agent (autonomous)
**Depends On:** Phase 0 complete

### 1.1 Directory Structure

| Task | Output | Exit Criteria |
|------|--------|---------------|
| Create workspace/ | Directory with markdown files | `ls workspace/` shows files |
| Create ledgers/ | Directory with JSONL files | `ls ledgers/` shows files |
| Create skills/ | Directory with YAML files | `ls skills/` shows files |
| Create verifiers/ | Directory structure | `ls verifiers/` shows definitions/ and results/ |
| Create .claude/skills/ | Project-bundled skills | `ls .claude/skills/` shows skill folders |

### 1.2 Core Workspace Files

| File | Purpose | Exit Criteria |
|------|---------|---------------|
| `workspace/goals.md` | Strategic objectives | File exists, has initial structure |
| `workspace/queue.md` | Task backlog | File exists |
| `workspace/progress.md` | Active work status | File exists |
| `workspace/completed.md` | Outcomes and results | File exists |
| `workspace/needs-you.md` | Blockers for human | File exists |
| `workspace/preferences.md` | Learned patterns | File exists |
| `workspace/capabilities.md` | Tools, auth, capacity | File exists |

### 1.3 Ledger Files

| File | Purpose | Exit Criteria |
|------|---------|---------------|
| `ledgers/inputs-log.jsonl` | Immutable input audit | File exists |
| `ledgers/work-ledger.jsonl` | Time/effort tracking | File exists |
| `ledgers/capability-ledger.jsonl` | Skill events | File exists |

### Phase 1 Exit Criteria

- [ ] All directories created
- [ ] All workspace markdown files created
- [ ] All ledger files created
- [ ] Initial commit pushed to GitHub

---

## Phase 2: Skills Seeding

**Owner:** Agent (autonomous)
**Depends On:** Phase 1 complete

### 2.1 Skill Registry Files

| File | Content | Exit Criteria |
|------|---------|---------------|
| `skills/technical-skills.yml` | Tool operation skills | Valid YAML, 10+ skills seeded |
| `skills/delivery-skills.yml` | End-to-end outcomes | Valid YAML, 5+ skills seeded |
| `skills/functional-skills.yml` | Reasoning/discipline | Valid YAML, 5+ skills seeded |
| `skills/sdk-registry.yml` | SDK capabilities | Valid YAML |

### 2.2 Initial Skill Entries

All skills start at:
- **Confidence:** 20-40% (theoretical baseline)
- **Maturity:** Declared (not yet tested)

### Phase 2 Exit Criteria

- [ ] All skill YAML files valid
- [ ] Skills seeded from known tools/capabilities
- [ ] Committed to git

---

## Phase 3: Verifier Implementation

**Owner:** Agent (autonomous)
**Depends On:** Phase 2 complete

### 3.1 Core Verifiers (8 minimum)

| Verifier | What It Checks | Priority |
|----------|----------------|----------|
| `git_status_clean` | Branch exists, working tree clean | P1 |
| `commit_exists` | Expected commits exist | P1 |
| `files_exist` | Required files present | P1 |
| `node_install` | `npm ci` succeeds | P1 |
| `node_build` | `npm run build` succeeds | P1 |
| `node_test` | `npm test` succeeds | P2 |
| `lint_pass` | Linting passes | P2 |
| `docs_checklist` | README exists with run instructions | P1 |

### 3.2 Verifier Definition Structure

Each verifier needs:
- YAML definition in `verifiers/definitions/`
- Executable script or command
- Success criteria
- Evidence capture rules

### Phase 3 Exit Criteria

- [ ] 6+ verifiers implemented and runnable
- [ ] Each verifier produces PASS/FAIL with evidence
- [ ] Verifier runner script works

---

## Phase 4: Executive Loop (Minimal)

**Owner:** Agent (autonomous)
**Depends On:** Phase 3 complete

### 4.1 Core Loop Components

| Component | File | Purpose |
|-----------|------|---------|
| Executive loop | `src/executive-loop.ts` | Main PM2-managed process |
| Health checker | `src/health-checker.ts` | System health monitoring |
| Work selector | `src/work-selector.ts` | Priority-based task selection |
| Worker spawner | `src/worker-spawner.ts` | Agent SDK worker management |

### 4.2 PM2 Configuration

| File | Purpose |
|------|---------|
| `ecosystem.config.js` | PM2 process configuration |

### 4.3 Loop Behavior

1. Health check (GitHub, disk space, etc.)
2. Check inputs (goals.md changed? new work?)
3. Select work (priority engine)
4. Create task contract
5. Execute (direct or spawn worker)
6. Validate (run verifiers)
7. Update state (progress.md, completed.md)
8. Sleep (30s default)
9. Loop

### Phase 4 Exit Criteria

- [ ] `npm run start` launches executive loop
- [ ] PM2 keeps process running
- [ ] Health checks pass
- [ ] Loop logs activity correctly
- [ ] Can select work from goals.md

---

## Phase 5: Worker Delegation

**Owner:** Agent (autonomous)
**Depends On:** Phase 4 complete

### 5.1 Agent SDK Integration

| Task | Exit Criteria |
|------|---------------|
| Configure SDK options | `settingSources: ['user', 'project']` working |
| Implement worker spawn | Can spawn Claude Code worker |
| Implement task handoff | Worker receives task contract |
| Implement result collection | Worker output captured |

### 5.2 Spawn Decision Logic

- Small task (< 5 min estimated) → Execute directly
- Large task OR needs focus → Spawn Agent SDK worker

### Phase 5 Exit Criteria

- [ ] Can spawn Agent SDK worker
- [ ] Worker executes task contract
- [ ] Worker output collected
- [ ] Skills/verifiers invoked correctly

---

## Phase 6: Calibration

**Owner:** Agent (autonomous)
**Depends On:** Phase 5 complete

### 6.1 Calibration Projects

| Project | Purpose | Exit Criteria |
|---------|---------|---------------|
| `calibration-nextjs-hello` | Prove Next.js delivery capability | All verifiers PASS |
| `calibration-eds-hello` | Prove EDS delivery capability | All verifiers PASS (or blockers documented) |

### 6.2 Skill Confidence Updates

After each calibration:
- Update skill confidence from evidence
- Update maturity levels
- Document gaps discovered
- Log to capability-ledger.jsonl

### Phase 6 Exit Criteria

- [ ] At least one calibration project complete
- [ ] Skill confidence updated with evidence
- [ ] Gaps documented in skills files
- [ ] Blockers (if any) in needs-you.md

---

## Phase 7: Continuous Operation

**Owner:** Agent (autonomous)
**Depends On:** Phase 6 complete

### 7.1 Activation

- PM2 process running continuously
- Executive loop selecting real work
- Human checks needs-you.md periodically

### 7.2 Initial Goals (P1)

| Goal | Type | Notes |
|------|------|-------|
| Build Next.js transactional app | Delivery | Proves capability |
| Notion integration POC | Research + Build | Needs API token |

### Phase 7 Exit Criteria

- [ ] Agent running autonomously
- [ ] Selecting and executing work from goals.md
- [ ] Updating progress.md and needs-you.md
- [ ] First real deliverable in progress

---

## Success Criteria Summary

| Milestone | Criteria |
|-----------|----------|
| Phase 1-4 Complete | PM2 starts loop, health checks pass |
| Phase 5 Complete | Worker spawning functional |
| Phase 6 Complete | Calibration done, 6+ verifiers working |
| Week 3 | Next.js app in progress, Notion research done |
| 1 Month | Next.js complete, 80%+ skills demonstrated |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| GitHub token | Needed | For PR creation, issues |
| Anthropic API key | Needed | For Agent SDK workers |
| Notion API token | Needed for P1 | Queue if not available |
| Azure credentials | Optional | For deployment verification |

---

*This plan is static. Track live progress in `progress.md`.*
