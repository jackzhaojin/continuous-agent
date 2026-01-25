# Continuous Executive Agent V1 — Unified Learning & Skills Addendum

**Last Updated:** 2026-01-23  
**Status:** Design Extension to Main Specification  
**Applies To:** `continuous-executive-agent-v1-spec.md`  
**Contributors:** Combined insights from Claude (Anthropic) and Codex/ChatGPT (OpenAI) analysis sessions

---

## Executive Summary

This unified addendum extends the V1 specification with a practical, minimal framework for:

1. **Building real things** — Next.js apps, EDS sites, deployments — end-to-end
2. **Proving capabilities** — verifiers (triggered deterministically, evaluated agentically) produce evidence, not self-reports
3. **Tracking confidence as a spectrum** — 0-100 scores + maturity levels, not binary
4. **Separating skill categories** — Technical, Delivery, and Functional skills
5. **Enabling self-improvement** — gaps become practice tasks, outcomes inform confidence
6. **Maintaining transparency** — continuous markdown reporting + structured ledgers

This is intentionally **not** a full knowledge graph. It provides stable vocabulary + proof engine + ledger so graphs and advanced automation can be built later from real evidence.

**Key insight from first-principles analysis:** LLMs have frozen weights and are stateless. "Self-improvement" can only mean changing external artifacts (prompts, context rules, skill documentation) that affect future context assembly. The agent "learns" by writing better files that its future self will read.

---

## Part 1: First Principles — Why Self-Improvement Is Constrained

### 1.1 The Fundamental Nature of an LLM Agent

At the most basic level, every LLM interaction is:

```
Context → Frozen Model → Output
```

**Critical insight: The model (Claude) does not learn between calls.**

- Weights are fixed after training
- Every call is stateless from the model's perspective
- No information persists inside the model between invocations

What we call "the agent" is actually:

| Component | What It Is | Persists? |
|-----------|------------|-----------|
| **The Model** | Claude's frozen weights | No (immutable) |
| **Context Assembly** | What information goes into the prompt | Yes (external files) |
| **Orchestration** | When/how to call the model | Yes (code + config) |
| **State Management** | What persists between calls | Yes (files, logs) |

**The "intelligence" is borrowed from Claude. The "agency" is entirely in the wrapper.**

### 1.2 What "Self-Improvement" Actually Means

Since the model cannot change, improvement can only come from:

| Component | Can Be Improved? | Safe? | How? |
|-----------|------------------|-------|------|
| **Prompts** | ✅ Yes | ✅ Safe | Rewrite instruction text |
| **Context Assembly Rules** | ✅ Yes | ✅ Safe | Change what info gets retrieved/included |
| **Skill Documentation** | ✅ Yes | ✅ Safe | Update based on outcomes |
| **Config Parameters** | ✅ Yes | ✅ Safe | Adjust as needed, log changes |
| **Orchestration Code** | ✅ Yes | ⚠️ Audit | Modify with git versioning and testing |

**Self-improvement = changing prompts, context assembly, and skill documentation over time based on verified outcomes.**

### 1.3 The Policy Concept

The agent's "policy" (what determines behavior) consists of:

| Policy Element | Type | Agent Can Modify? |
|----------------|------|-------------------|
| System prompts | Text | ✅ Yes (with audit) |
| Context retrieval rules | Config | ✅ Yes (with testing) |
| Skill confidence levels | Data | ✅ Yes (evidence-based) |
| Decision heuristics | Text/Config | ✅ Yes (with audit) |
| Orchestration logic | Code | ✅ Yes (git versioned, tested) |

### 1.4 The Bootstrap Problem

To improve, the agent needs to:
1. Recognize it's doing poorly
2. Analyze why
3. Generate better approach
4. Test new approach
5. Validate improvement

But steps 1-4 require the same capabilities being improved. If the agent reasons poorly, it will reason poorly about how to reason better.

**Solution:** Human-seeded meta-prompts and structures. Initial prompts, skill definitions, and verification criteria must be good enough to build on. Pure self-bootstrap from nothing is impossible.

### 1.5 The Feedback Signal Problem

| Metric | What It Measures | Problem |
|--------|------------------|---------|
| Task completion rate | Did it finish? | Doesn't measure quality |
| Human override rate | How often corrected? | Requires human feedback (scarce) |
| Time to completion | Efficiency | Faster isn't always better |
| Verifier PASS/FAIL | Objective criteria | Only as good as verifier design |
| Human satisfaction | Ultimate goal | Hard to measure, delayed signal |

**Core insight:** Signal is sparse and delayed. The solution is verifiers that are triggered deterministically but evaluated agentically — providing immediate feedback without requiring human judgment for every task.

### 1.6 The Context Window Constraint

```
Context window is finite (~200K tokens)
Every piece of information competes for space
Better agents = better context curation
```

**Self-improvement partly means: learning what context leads to good outcomes.**

The agent should track which context was present in successful vs. failed outcomes, then update retrieval rules accordingly.

---

## Part 2: Canonical Definitions (Vocabulary)

Clear, non-overlapping definitions prevent confusion:

### 2.1 Tool

A **Tool** is an external interface the agent can invoke to obtain information or create side effects.

**Tool properties:**
- **Interface type:** CLI / API / SDK / File System
- **Permissions:** Read-only / Read-write / Approval-gated
- **Preconditions:** Auth tokens, environment setup, dependencies
- **Outputs:** Logs, JSON, files, side effects
- **Failure modes:** Auth errors, rate limits, network issues, invalid input
- **Cost model:** Time, API costs, resource consumption

**Examples:** `git`, `gh` CLI, `npm`, `ssh`, `az` CLI, Claude API

### 2.2 Skill

A **Skill** is a repeatable procedure mapping inputs → outputs under constraints.

A skill is only "real" if it is:
- **Specified:** Inputs, outputs, steps defined
- **Executable:** Can be run in current environment
- **Verifiable:** Can be proven with evidence

**Key principle:** *No verifier = not proven.* Self-report does not count.

### 2.3 Capability / Delivery Outcome

A **Capability** (or **Delivery Skill**) is an end-to-end outcome that composes multiple skills.

**Example:** "Deliver a production-ready Next.js app" composes:
- Technical skills: `node.npm.install`, `nextjs.build`, `git.branch_commit`
- Functional skills: `reason.planning`, `reason.debugging`, `comm.documentation`

### 2.4 Proven Skill

A skill is **proven** only when an independent **verifier** yields PASS, backed by evidence bundle.

**Proof bundle examples:**
- Git commit hashes + diff
- Build/test logs with exit codes
- Deployed URL + deployment ID
- Artifact existence checks (files, docs)

---

## Part 3: Skill Taxonomy — Three Buckets

Skills are tracked in three distinct registries to avoid mixing concerns:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SKILL ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   TECHNICAL SKILLS                    FUNCTIONAL SKILLS                 │
│   (Tool Operation)                    (Reasoning & Discipline)          │
│   ├── git.branch_commit: 95%          ├── reason.decomposition: 85%    │
│   ├── github.pr.create: 90%           ├── reason.debugging: 80%        │
│   ├── node.npm.install: 88%           ├── reason.risk_assessment: 75%  │
│   ├── nextjs.build.basic: 85%         ├── exec.strategy_switching: 65% │
│   └── azure.deploy: 55%               └── comm.needs_you.quality: 80%  │
│            │                                    │                       │
│            └────────────────┬───────────────────┘                       │
│                             │                                           │
│                             ▼                                           │
│                      DELIVERY SKILLS                                    │
│                      (End-to-End Outcomes)                              │
│                      ├── deliver.site.static: 90%                       │
│                      ├── deliver.nextjs.app.basic: 80%                  │
│                      ├── deliver.nextjs.app.advanced: 55%               │
│                      ├── deliver.eds.site: 70%                          │
│                      └── deliver.mcp.server: 40%                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Technical Skills (`technical-skills.yml`)

**Definition:** Interface-level operational skills — "Can I operate the machinery?"

**Characteristics:**
- Binary interface (command → result)
- Can be tested in isolation
- Transfer across project types
- External to Claude (tools, APIs, platforms)
- Verified by tool output (exit codes, artifacts)

**Examples:**
```
git.branch_commit          # Create branch, make commits
git.merge.simple           # Merge without conflicts
github.issues.read         # Read issue data
github.pr.create           # Create pull request (approval-gated)
node.npm.install           # npm install succeeds
node.npm.run_script        # npm run <script> succeeds
nextjs.build.basic         # npm run build passes
nextjs.routing.app_router  # App router patterns work
eds.scaffold.basic         # EDS project scaffolding
azure.containerapps.deploy # Azure deployment (auth-dependent)
ssh.remote_command         # Execute commands on remote host
docker.build               # Build Docker image
docker.compose.up          # docker-compose up succeeds
```

### 3.2 Delivery Skills (`delivery-skills.yml`)

**Definition:** End-to-end outcomes — "Can I ship a thing?"

**Characteristics:**
- Produce tangible deliverables
- Compose multiple technical skills
- Require functional skills to orchestrate
- Verified by multiple verifiers + DoD checklist

**Examples:**
```
deliver.site.static              # Complete static HTML site
deliver.nextjs.app.basic         # Basic Next.js app runs locally
deliver.nextjs.app.production    # Production-ready Next.js (build, test, docs)
deliver.eds.site.validated       # EDS site with validation passing
deliver.azure.container.deployed # App deployed to Azure
deliver.oracle.vm.deployed       # App deployed to Oracle VM
deliver.blog.post.researched     # Blog post from research
deliver.mcp.server.functional    # Working MCP server
```

### 3.3 Functional Skills (`functional-skills.yml`)

**Definition:** Cross-cutting reasoning, discipline, and communication — "Can I think and work well?"

**Characteristics:**
- Apply across all project types
- Hard to test in isolation
- Core to agent effectiveness
- Internal to Claude (reasoning, analysis)
- Verified via rubrics, not just tool output

**Examples:**
```
reason.decomposition        # Breaking goals into actionable tasks
reason.debugging.discipline # Repro → isolate → fix → verify
reason.risk_assessment      # Identifying and mitigating risks
reason.research.synthesis   # Gathering and combining information
reason.critical_evaluation  # Assessing quality, finding gaps
exec.strategy_switching     # Changing approach when stuck
exec.prioritization         # Selecting highest-value work
comm.needs_you.quality      # Clear, actionable escalations
comm.documentation          # Self-documenting work
```

---

## Part 4: Confidence Model — Spectrum, Not Binary

### 4.1 Why Confidence Scores

Capabilities should not be yes/no. The system should express:
- "90% confident in building a static website"
- "70% confident in advanced Next.js routing"
- "40% confident in writing an MCP server"

Confidence is probability-like but practical: **"How likely is success next time for this scope?"**

### 4.2 Confidence Scale

| Range | Meaning | Implication |
|-------|---------|-------------|
| 90-100% | Proven, reliable, rarely fails | Use confidently, minimal oversight |
| 70-89% | Works well, occasional edge cases | Use with monitoring |
| 50-69% | Partial capability, known gaps | Use carefully, expect issues |
| 30-49% | Experimental, significant gaps | Needs validation before relying |
| 0-29% | Theoretical, unproven | Don't claim capability |

### 4.3 Maturity Levels (Alongside Confidence)

| Maturity | Definition | Criteria |
|----------|------------|----------|
| **Declared** | Exists in registry, not yet tested | 0 verifier runs |
| **Demonstrated** | At least one verifier PASS | ≥1 PASS |
| **Reliable** | Repeated PASS, handles failure modes | ≥3 PASS, documented recovery |

**Both dimensions matter:**
- Confidence 70%, Maturity: Demonstrated = "Worked once, probably works"
- Confidence 70%, Maturity: Reliable = "Consistently works at this level"

### 4.4 Evidence-Weighted Updates

**Update rules (V1):**
```
Initial: baseline 20-40% depending on theoretical assessment

On Verifier PASS:
  confidence += confidence_bump (default: +10, capped at scope ceiling)
  if maturity == Declared: maturity = Demonstrated
  if successes >= 3 and failure_rate < 20%: maturity = Reliable

On Verifier FAIL:
  confidence -= confidence_penalty (default: -15)
  if maturity == Reliable and failure_rate > 30%: maturity = Demonstrated
  log failure mode for future reference

On Extended Non-Use (optional, V2):
  confidence -= decay_rate per month (default: -5)
```

**Critical:** Confidence changes only when Validator accepts evidence.

### 4.5 Scope Tags Prevent Overclaiming

Avoid monolithic skills. Use scoped IDs:

```yaml
# Instead of one "nextjs" skill:
nextjs.routing.pages_router    # confidence: 85%
nextjs.routing.app_router      # confidence: 70%
nextjs.data.fetching.ssr       # confidence: 60%
nextjs.auth.integration        # confidence: 40%
```

Each skill entry includes explicit scope:
```yaml
scope:
  includes: ["layouts", "nested routes", "route handlers"]
  excludes: ["complex auth", "multi-tenant", "edge runtime"]
```

---

## Part 5: Verifiers — The Proof Engine

### 5.1 Core Concept

A **Verifier** is a validation step that is triggered deterministically but evaluated agentically. It produces:
- **Result:** PASS / FAIL
- **Logs pointer:** Where to find execution logs
- **Evidence pointers:** Commit hashes, artifacts, screenshots
- **Verifier version:** For reproducibility

**Principle:** Verifiers are the source of truth. No verifier = no proof.

### 5.2 Minimal V1 Verifier Set

Start with ~8 verifiers covering 80% of use cases:

| Verifier | What It Checks | Evidence Produced |
|----------|----------------|-------------------|
| `git_status_clean` | Branch exists, working tree clean | Branch name, status output |
| `commit_exists` | Expected commits exist | Commit hashes, diff |
| `files_exist` | Required files present | File list, checksums |
| `node_install` | `npm ci` succeeds | Exit code, logs |
| `node_build` | `npm run build` succeeds | Exit code, build output |
| `node_test` | `npm test` succeeds | Exit code, test results |
| `lint_pass` | Linting passes | Exit code, lint output |
| `docs_checklist` | README exists, run instructions present | File content checks |

**Project-specific verifiers (add as needed):**

| Verifier | What It Checks |
|----------|----------------|
| `eds_preview` | EDS local preview runs |
| `docker_build` | Docker image builds |
| `deploy_health` | Deployed endpoint responds |

### 5.3 Verifier Schema

```yaml
verifier_id: node_build
version: "1.0"
description: "Verify npm build succeeds"
command: "npm run build"
working_dir: "${project_root}"
timeout_seconds: 300
success_criteria:
  - exit_code: 0
  - output_not_contains: ["error", "failed"]
evidence_capture:
  - type: log
    path: "build.log"
  - type: artifact
    path: "dist/"
    optional: true
```

### 5.4 Verifier Execution Protocol

```
1. Executor completes task, declares ready for verification
2. Validator receives task + claimed artifacts
3. Validator runs all applicable verifiers
4. Each verifier produces PASS/FAIL + evidence
5. Validator aggregates results into validation report
6. Validation report updates skill confidence + ledger
```

---

## Part 6: Validator Role — Independent Verification

### 6.1 Why Separate Validator

Self-report bias is real. The agent that builds should not be the sole judge of success. We want a "really good validation agent" that:
- Runs verifiers independently
- Challenges assumptions
- Checks DoD criteria
- Identifies gaps honestly
- Suggests stabilization work

### 6.2 Role Separation

| Role | Responsibility | Outputs |
|------|----------------|---------|
| **Executor** | Builds, changes, creates artifacts | Code, files, commits, logs |
| **Validator** | Verifies, critiques, reports | Validation report, confidence updates |

In V1, these may be the same Claude instance with different prompts/modes. The key is **separation of concerns** — execution mindset vs. critical evaluation mindset.

### 6.3 Validator Outputs

For every completed task, the Validator produces:

```yaml
validation_report:
  task_id: "task-2026-01-23-001"
  validated_at: "2026-01-23T15:00:00Z"
  
  verifier_results:
    - verifier: git_status_clean
      result: PASS
      evidence: {branch: "feature/hello-cap", clean: true}
    - verifier: node_build
      result: PASS
      evidence: {exit_code: 0, log: "logs/build-001.txt"}
    - verifier: docs_checklist
      result: FAIL
      evidence: {missing: ["run instructions"]}
  
  dod_checklist:
    - criterion: "App runs locally"
      result: PASS
    - criterion: "README with run instructions"
      result: FAIL
  
  overall_result: PARTIAL  # PASS | FAIL | PARTIAL
  
  gaps_identified:
    - "README missing run instructions"
    - "No test coverage"
  
  skills_exercised:
    - skill_id: nextjs.build.basic
      result: PASS
      confidence_delta: +10
    - skill_id: comm.documentation
      result: FAIL
      confidence_delta: -15
  
  recommendations:
    - "Add README run instructions before marking complete"
    - "Consider adding basic test as practice task"
```

---

## Part 7: Capability Ledger — Truth Record for Learning

### 7.1 Why a Ledger

Self-improvement requires knowing, with receipts:
- What was attempted
- What succeeded
- What failed
- Under what conditions
- What context was present

### 7.2 Event Types (V1)

Extend existing JSONL logging with structured events:

```jsonl
{"event": "SKILL_ATTEMPT", "ts": "2026-01-23T14:00:00Z", "skill_id": "nextjs.build.basic", "task_id": "task-001", "context": {"project": "hello-cap", "prior_confidence": 75}}
{"event": "TOOL_CALL", "ts": "2026-01-23T14:01:00Z", "tool_id": "npm", "command": "npm run build", "exit_code": 0, "logs_ref": "logs/build-001.txt"}
{"event": "VERIFIER_RUN", "ts": "2026-01-23T14:02:00Z", "verifier_id": "node_build", "result": "PASS", "evidence_refs": ["logs/build-001.txt"]}
{"event": "SKILL_RESULT", "ts": "2026-01-23T14:02:00Z", "skill_id": "nextjs.build.basic", "result": "PASS", "confidence_after": 85, "maturity_after": "Demonstrated"}
{"event": "VALIDATION_COMPLETE", "ts": "2026-01-23T14:05:00Z", "task_id": "task-001", "overall_result": "PASS", "report_ref": "reports/validation-001.yaml"}
```

### 7.3 Ledger Enables

- **Replay:** Reconstruct what happened for any task
- **Learning:** Analyze patterns across many tasks
- **Calibration:** Compare claimed confidence vs. actual success rate
- **Debugging:** Trace failures to specific tool calls

---

## Part 8: Practice Loop — Gap → Safe Improvement

### 8.1 Core Concept

When idle or blocked on primary work, the agent should:
1. Identify highest-impact unproven/brittle skill required by top goals
2. Generate a **practice task** to exercise that skill safely
3. Execute → Validate → Record evidence
4. Update confidence/maturity

### 8.2 Practice Task Selection

```
Priority order for practice:
1. Skills blocking P1 goals (unblock critical path)
2. Skills with confidence < 50% but needed soon
3. Skills with maturity = Declared (never tested)
4. Skills with high failure rate (stabilization)
5. Skills unused > 30 days (prevent decay, optional)
```

### 8.3 Practice Task Examples

| Skill Gap | Practice Task |
|-----------|---------------|
| `git.branch_commit` | Create branch, make 3 commits, in safe test repo |
| `nextjs.build.basic` | Scaffold minimal app, run build, verify |
| `eds.scaffold.basic` | Create minimal EDS site, run preview |
| `reason.debugging` | Intentionally break something, debug systematically |

### 8.4 Practice vs. Real Work

Practice tasks:
- Use designated safe repos/locations
- Don't count toward goal completion
- Are explicitly logged as practice
- Update skill confidence same as real work

---

## Part 9: Calibration Projects — Prove Capability Early

### 9.1 Purpose

Before trusting the agent with important work, run "Hello Capability" projects that:
- Validate end-to-end delivery skills
- Surface real blockers (auth, tooling, templates)
- Establish baseline confidence from evidence
- Prove the verification system works

### 9.2 Next.js Calibration Project

```yaml
project: calibration.nextjs.hello
goal: "Prove deliver.nextjs.app.basic capability"
steps:
  1. Scaffold: npx create-next-app@latest hello-nextjs
  2. Modify: Add one custom component
  3. Build: npm run build
  4. Test: npm test (if configured)
  5. Document: README with run instructions
  6. Validate: Run all verifiers
  7. Ledger: Record all events and outcomes
expected_verifiers:
  - git_status_clean
  - node_install
  - node_build
  - docs_checklist
success_criteria:
  - All verifiers PASS
  - Delivery skill confidence updated
  - Gaps (if any) documented
```

### 9.3 EDS Calibration Project

```yaml
project: calibration.eds.hello
goal: "Prove deliver.eds.site capability"
steps:
  1. Scaffold: Create minimal EDS structure
  2. Content: Add one page with basic content
  3. Preview: Run local preview/build
  4. Document: README with setup instructions
  5. Validate: Run all verifiers
  6. Ledger: Record all events and outcomes
expected_verifiers:
  - git_status_clean
  - files_exist (required EDS files)
  - eds_preview (or equivalent local check)
  - docs_checklist
blockers_to_surface:
  - aem-cli version requirements
  - GitHub auth requirements
  - Template availability
```

### 9.4 Calibration Schedule

Run calibration projects:
- Before trusting agent with real goals
- After significant environment changes
- When skill confidence seems uncalibrated
- Periodically (monthly) to prevent drift

---

## Part 10: Harness Integration — Learning from History

### 10.1 Harnesses as Proven Capabilities

Existing harnesses (EDS, Next.js, Static HTML) represent:
- **Proven delivery skills** — evidence of capability
- **Patterns** — how to approach similar work
- **Prompt logs** — what decisions were made and why
- **Failure history** — what went wrong and how it was fixed

### 10.2 Extracting Skills from Harnesses

For each harness:
1. Document what it delivers (delivery skill)
2. List tools it uses (technical skills)
3. Identify reasoning required (functional skills)
4. Set confidence based on success history
5. Note gaps discovered during use
6. Link to prompt logs for context

### 10.3 Using Harness Patterns

When the agent encounters a new task:
```
1. Is this similar to an existing harness?
   → If yes: reference harness patterns, include in context
   
2. What skills does the harness use?
   → Check confidence in those skills
   
3. What did we learn building the harness?
   → Include relevant lessons in context
   
4. What failed during harness development?
   → Avoid those approaches
```

### 10.4 Harness Retrospective Prompt

```markdown
# Meta-Analysis: Harness Retrospective

Given: Full prompt log from building [harness name]

Extract:
1. What was the starting point?
2. What key decisions were made and why?
3. What errors occurred and how were they resolved?
4. What would we do differently now?
5. What patterns apply to similar projects?

Output: Lessons document for future similar work
```

---

## Part 11: Safe Self-Modification Boundaries

### 11.1 What the Agent Can Modify

| Artifact | Can Modify? | Risk | Validation Required |
|----------|-------------|------|---------------------|
| Logs (append-only) | ✅ Yes | Minimal | None |
| Workspace markdown | ✅ Yes | Low | None |
| Skill registries (YAML) | ✅ Yes | Low | Evidence-based |
| preferences.md | ✅ Yes | Low | Human can override |
| context-rules.yaml | ✅ Yes | Low | Test on next task |
| Worker prompts | ✅ Yes | Low | A/B testing |
| Config parameters | ✅ Yes | Low | Log changes |
| Orchestration code | ✅ Yes | Medium | Git versioning, run tests |
| Verifier definitions | ✅ Yes | Medium | Git versioning, run tests |

### 11.2 The Safe Modification Zone

**Philosophy:** The agent is autonomous by default. Almost everything is evolvable. Only irreversible actions with real-world consequences require approval.

```
EVOLVABLE (agent-controlled with audit):
├── executive-loop.js (git versioned, tested)
├── constitution.md (git versioned, logged)
├── verifier definitions (git versioned, tested)
├── skills/*.yml (confidence, maturity, evidence)
├── strategies/prompts/*.md (versioned in git)
├── strategies/context-rules.yaml (tested incrementally)
├── preferences.md (human can override)
└── config.yaml (all parameters adjustable)

APPEND-ONLY (audit trail):
├── capability-ledger.jsonl
├── evolution-log.jsonl
└── work-ledger.jsonl

HARD LIMITS (requires human approval):
├── Spending money beyond cost cap
├── Permanent deletions (repos, data, references)
└── External publishing (npm, blog, social media)
```

### 11.3 Evolution Log

Track all self-modifications:

```jsonl
{"id": "evo-001", "ts": "2026-01-23T20:00:00Z", "trigger": "validation_result", "file": "technical-skills.yml", "skill": "nextjs.build.basic", "change": "confidence 75→85", "evidence": ["validation-001"]}
{"id": "evo-002", "ts": "2026-01-23T20:01:00Z", "trigger": "gap_discovered", "file": "technical-skills.yml", "skill": "nextjs.auth.integration", "change": "added gap: oauth flow untested", "evidence": ["task-002-failure"]}
```

---

## Part 12: File Architecture (Updated)

### 12.1 Directory Structure

```
workspace/
├── [existing V1 spec files]
│
├── skills/
│   ├── technical-skills.yml    # Tool/interface operation
│   ├── delivery-skills.yml     # End-to-end outcomes
│   └── functional-skills.yml   # Reasoning/discipline
│
├── verifiers/
│   ├── definitions/            # Verifier YAML definitions
│   └── results/                # Verifier run outputs
│
├── learning/
│   ├── capability-ledger.jsonl # Skill attempt/result events
│   ├── evolution-log.jsonl     # Self-modification audit
│   ├── retrospectives/         # Periodic analysis summaries
│   └── calibration/            # Calibration project records
│
├── strategies/
│   ├── context-rules.yaml      # What context for what task
│   └── prompts/                # Versioned worker prompts
│
└── reports/
    ├── validation/             # Validation reports
    ├── transcripts/            # Execution transcripts
    └── dashboard.html          # Visual interface
```

### 12.2 Skill File Schema (YAML)

#### Technical Skill Entry

```yaml
- id: nextjs.routing.app_router
  name: "Next.js App Router"
  description: "Advanced routing with layouts, nested routes, server components"
  confidence: 70
  maturity: Demonstrated  # Declared | Demonstrated | Reliable
  
  scope:
    includes:
      - "layouts"
      - "nested routes"
      - "route handlers"
      - "server components"
    excludes:
      - "complex auth flows"
      - "multi-tenant routing"
      - "edge runtime"
  
  prerequisites:
    - tool: node
      min_version: "18.0.0"
    - tool: npm
    - skill: nextjs.build.basic
  
  verifiers:
    - node_build
    - route_smoke_test
  
  evidence:
    successes: 2
    failures: 1
    last_success: "2026-01-21"
    last_failure: "2026-01-19"
    pointers:
      - type: commit
        ref: "abc1234"
      - type: validation_report
        ref: "reports/validation/val-001.yaml"
  
  common_failure_modes:
    - "File placement incorrect for nested routes"
    - "Server/client component boundary mistakes"
    - "'use client' directive missing"
  
  last_validated: "2026-01-21"
  last_used: "2026-01-21"
```

#### Delivery Skill Entry

```yaml
- id: deliver.nextjs.app.production
  name: "Deliver Production-Ready Next.js App"
  description: "End-to-end: scaffold, build, test, document, validate"
  confidence: 65
  maturity: Declared
  
  scope:
    includes:
      - "build passes"
      - "basic routing"
      - "documentation"
      - "deployment notes"
    excludes:
      - "authentication"
      - "payments"
      - "complex caching"
      - "CI/CD pipeline"
  
  requires_skills:
    technical:
      - nextjs.build.basic
      - nextjs.routing.app_router
      - git.branch_commit
      - node.npm.install
    functional:
      - reason.decomposition
      - reason.debugging.discipline
      - comm.documentation
  
  verifiers:
    - node_install
    - node_build
    - node_test
    - lint_pass
    - docs_checklist
  
  dod_template:
    - "npm install succeeds"
    - "npm run build succeeds"
    - "App runs locally"
    - "README with run instructions"
    - "All code committed"
  
  evidence:
    successes: 0
    failures: 0
```

#### Functional Skill Entry

```yaml
- id: reason.debugging.discipline
  name: "Debugging Discipline"
  description: "Systematic approach: reproduce → isolate → fix → verify"
  confidence: 80
  maturity: Reliable
  
  rubric:
    pass_conditions:
      - "Writes explicit reproduction steps"
      - "Identifies likely root cause with evidence"
      - "Fixes without introducing new issues"
      - "Runs verifier after fix"
      - "Documents fix and prevention"
    fail_indicators:
      - "Random changes without hypothesis"
      - "Declares fixed without verification"
      - "Same error recurs after 'fix'"
  
  evidence:
    successes: 8
    failures: 1
    examples:
      - task: "task-2026-01-15-003"
        outcome: PASS
        notes: "Correctly isolated CSS issue to missing import"
  
  improvement_strategies:
    - "Include debugging checklist in context"
    - "Require hypothesis before each fix attempt"
```

---

## Part 13: Retrospective Process

### 13.1 When to Run

- **Weekly:** Every Sunday (scheduled)
- **Threshold:** After 10+ new outcomes
- **On-demand:** "Analyze my recent work"
- **Post-calibration:** After calibration projects complete

### 13.2 Retrospective Prompt

```markdown
# Weekly Retrospective Analysis

## Input Context
- capability-ledger.jsonl (last 7 days)
- All skill files (current state)
- Validation reports (last 7 days)
- needs-you.md (current blockers)
- Human feedback received (if any)

## Analysis Questions

### 1. Skill Performance
- Which skills had verifier PASS consistently?
- Which skills had FAIL or required multiple attempts?
- Any confidence levels that seem miscalibrated?
- Should any maturity levels change?

### 2. Gaps Discovered
- What new gaps surfaced this week?
- Are any gaps blocking multiple goals?
- Which gaps should become practice tasks?

### 3. Verification Quality
- Did verifiers catch real issues?
- Any false positives (FAIL but actually fine)?
- Any false negatives (PASS but had issues)?
- Verifiers to add or modify?

### 4. Context Effectiveness
- What context was present in successful tasks?
- What context was missing in failures?
- Should context-rules.yaml be updated?

### 5. Pattern Recognition
- What approaches worked for what task types?
- Any anti-patterns to document?
- New strategies to capture?

## Outputs

1. **Update skill files:**
   - Confidence adjustments with rationale
   - New gaps documented
   - Maturity level changes
   - common_failure_modes updated

2. **Update evolution-log.jsonl:**
   - All changes with evidence references

3. **Update needs-you.md if:**
   - Gap requires human input (auth, decision)
   - Skill documentation needs review
   - Uncalibrated confidence detected

4. **Create retrospective summary:**
   - Key findings
   - Changes made
   - Recommendations
```

---

## Part 14: Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goal:** Establish skill registry and verification infrastructure

| Task | Output | Validation |
|------|--------|------------|
| Create skills/ directory structure | Directories exist | ✓ |
| Define technical-skills.yml schema | Schema documented | Human review |
| Seed technical skills from known tools | Initial entries | Human review |
| Define delivery-skills.yml schema | Schema documented | Human review |
| Seed delivery skills from harnesses | Initial entries | Human review |
| Define functional-skills.yml schema | Schema documented | Human review |
| Self-assess functional skills | Initial entries | Human review |
| Create verifier definitions | verifiers/definitions/*.yml | Schema valid |

### Phase 2: Verification (Week 2)

**Goal:** Implement verifiers and Validator workflow

| Task | Output | Validation |
|------|--------|------------|
| Implement core verifiers (6-8) | Executable scripts | Each runs |
| Create Validator prompt/workflow | Validator mode | Produces reports |
| Run Validator on test task | Validation report | Report complete |
| Integrate with capability-ledger | Events logged | Ledger populates |

### Phase 3: Calibration (Week 3)

**Goal:** Prove capability through calibration projects

| Task | Output | Validation |
|------|--------|------------|
| Run Next.js calibration project | Working app | All verifiers PASS |
| Update skills from calibration | Confidence changes | Evidence-based |
| Run EDS calibration project | Working site | All verifiers PASS |
| Update skills from calibration | Confidence changes | Evidence-based |
| Document blockers found | needs-you.md entries | Clear, actionable |

### Phase 4: Learning Loop (Week 4)

**Goal:** Close the feedback loop

| Task | Output | Validation |
|------|--------|------------|
| Create retrospective prompt | Meta-analysis capability | Produces insights |
| Run first retrospective | Retrospective summary | Meaningful findings |
| Update skills from retrospective | Changes logged | evolution-log entries |
| Implement practice task selection | Practice recommendations | Targets real gaps |
| Run one practice task | Skill improvement | Confidence updated |

### Phase 5: Integration (Week 5+)

**Goal:** Full integration with executive loop

| Task | Output | Validation |
|------|--------|------------|
| Integrate skill checks into task planning | Pre-execution skill assessment | Logs skill requirements |
| Integrate Validator into task completion | Auto-validation | Reports generated |
| Dashboard shows skill confidence | Visual display | Readable, accurate |
| Practice loop runs when idle | Continuous improvement | Skills trend upward |

---

## Part 15: Success Metrics

### Short-term (1 month)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Skill files populated | All three files | Files exist, entries present |
| Verifiers implemented | ≥6 core verifiers | Each runs successfully |
| Calibration projects run | ≥2 complete | Validation reports exist |
| Capability ledger active | 50+ events | Ledger entries |
| First retrospective complete | 1 | Summary exists |

### Medium-term (3 months)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Skills with maturity ≥ Demonstrated | 80%+ | Registry analysis |
| Confidence calibration | ±15% of actual success rate | Compare claimed vs. actual |
| Gaps documented | ≥20 specific gaps | Gap count |
| Gaps closed | ≥5 | Before/after comparison |
| Practice tasks run | ≥10 | Ledger count |

### Long-term (6 months)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Average confidence (delivery skills) | Trending upward | Monthly average |
| Verifier PASS rate | >80% | Aggregate results |
| Human override rate | Trending downward | Correction frequency |
| New delivery skills added | ≥3 | Registry additions |
| Self-identified improvements | Regular occurrence | Evolution log frequency |

---

## Part 16: Design Principles (Extended)

Add to the original 13 principles from the main spec:

14. **Skills must be proven** — confidence comes from verifier PASS, not claims
15. **No verifier = not proven** — self-report does not count
16. **Confidence is a spectrum** — 0-100, not binary yes/no
17. **Scope prevents overclaiming** — explicit includes/excludes for each skill
18. **Validator is separate from Executor** — different mindsets, honest assessment
19. **Gaps are valuable** — known unknowns enable targeted improvement
20. **Practice fills gaps** — idle time becomes skill development
21. **Evidence enables learning** — capability ledger provides receipts
22. **Calibration before trust** — run calibration projects before real work
23. **Harnesses are evidence** — existing successes seed initial confidence
24. **Full autonomy with hard limits** — agent modifies anything except: spend, delete, publish
25. **Evolution is audited** — all self-modifications logged with rationale

---

## Part 17: Open Questions for `needs-you.md`

These require human decision before certain capabilities can be proven:

### Blockers to Queue

1. **Approved repos for calibration**
   - Where can the agent create Next.js calibration project?
   - Where can the agent create EDS calibration project?

2. **Credential policy**
   - GitHub token scope (read-only vs. PR creation)
   - OpenAI/Anthropic API keys (for multi-model work)
   - Azure authentication (if Azure deploy verification desired)

3. **EDS validation standard**
   - What exactly constitutes "proof" for EDS locally?
   - Is local preview sufficient or is deploy required?

4. **Verifier authority**
   - Are proposed verifiers sufficient?
   - Any additional checks required?

Until resolved, affected skills should be marked **Blocked** with clear prerequisite notes.

---

## Part 18: Peer Review Checklist

For another AI or human reviewing this document:

### Definitions
- [ ] Are Tool / Skill / Capability definitions crisp and non-overlapping?
- [ ] Is the distinction between Technical / Delivery / Functional skills clear?
- [ ] Is "proven" clearly defined (requires verifier PASS)?

### Confidence Model
- [ ] Is the confidence scale (0-100) practical?
- [ ] Is the maturity model (Declared/Demonstrated/Reliable) useful?
- [ ] Do update rules make sense (evidence-weighted)?
- [ ] Does scope tagging prevent overclaiming?

### Verification
- [ ] Are proposed verifiers minimal yet sufficient?
- [ ] Is the Validator role clearly separated from Executor?
- [ ] Does the proof bundle concept work?

### Learning
- [ ] Does the capability ledger support replay and learning?
- [ ] Does the retrospective process close the feedback loop?
- [ ] Does the practice loop enable targeted improvement?

### Integration
- [ ] Does this remain compatible with the contract-first design?
- [ ] Does this remain compatible with the PM2 loop architecture?
- [ ] Are safe modification boundaries clear?

### Practicality
- [ ] Can this be implemented in the proposed phases?
- [ ] Are there missing pieces for "build + prove + self-document" to work?
- [ ] Is the complexity appropriate for V1?

---

## Part 19: Future Increments (V2+ Candidates)

When V1 is running and collecting evidence:

1. **Confidence calibration tuning** — adjust bump/decay based on observed success rates
2. **Shadow execution** — propose "what I would do" without acting, for review
3. **Replay evaluation** — test new prompts against historical ledger data
4. **Parallel worker management** — resource limits and scheduling
5. **Richer functional rubrics** — plan quality scoring, communication scoring
6. **Knowledge graph** — build graph from accumulated ledger data
7. **Notification system** — SMS/email/Slack for needs-you items
8. **Cloud runtime** — move off laptop for 24/7 operation
9. **Multi-human support** — team scenarios with multiple approvers

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Tool** | External interface (CLI, API, SDK) the agent can invoke |
| **Skill** | Repeatable procedure: inputs → outputs under constraints |
| **Technical Skill** | Tool/interface operation capability |
| **Delivery Skill** | End-to-end outcome capability (composes skills) |
| **Functional Skill** | Reasoning/discipline/communication capability |
| **Confidence** | 0-100 estimate of success likelihood for a skill |
| **Maturity** | Declared → Demonstrated → Reliable progression |
| **Verifier** | Validation step (triggered deterministically, evaluated agentically) producing PASS/FAIL + evidence |
| **Validator** | Role that runs verifiers and produces validation reports |
| **Executor** | Role that builds/changes things |
| **Proof Bundle** | Evidence artifacts backing a skill claim |
| **Capability Ledger** | Append-only event log of skill attempts/results |
| **Practice Task** | Safe task to exercise and improve a skill |
| **Calibration Project** | End-to-end project to prove capability |
| **Retrospective** | Periodic analysis connecting outcomes to improvements |
| **Evolution** | Self-modification to skill files, prompts, or config |
| **Gap** | Known limitation or missing capability |
| **Scope** | Explicit includes/excludes defining skill boundaries |

---

## Appendix B: Quick Reference — What Agent Can/Cannot Do

**Philosophy:** The agent is autonomous by default. Human approval is reserved only for irreversible actions with real-world cost or permanent consequences.

### ✅ Agent CAN (Fully Autonomous)

- Update skill confidence based on verifier results
- Add new gaps to skill documentation
- Run practice tasks in any safe location
- Generate retrospective analyses
- Update context-rules.yaml
- Modify worker prompts (with git versioning)
- Adjust config parameters within bounds
- Append to all ledger files
- **Create and open PRs**
- **Merge PRs**
- **Deploy to any environment (within cost cap)**
- **Create GitHub forks**
- **Execute all task types without pre-approval**

### ⚠️ Agent CAN with Audit

- Change skill maturity levels (logged to evolution-log)
- Add new skills to registries (logged)
- Modify scope includes/excludes (logged)
- Update common_failure_modes (logged)
- Modify executive-loop.js (logged, requires testing)
- Change verifier definitions (logged)

### ❌ Agent CANNOT (Hard Limits — Requires Human)

- **Spend money beyond free tier / cost cap**
- **Permanently delete data, repos, or references**
- **Publish externally (npm, blog posts, social media)**
- Access new credentials (queue and continue)

---

**End of Unified Addendum**

*This document combines insights from analysis sessions with Claude (Anthropic) and Codex/ChatGPT (OpenAI), synthesizing the strongest elements from each into a coherent, implementable specification extension.*
