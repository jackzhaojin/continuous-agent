# V2.1.5 Goal: Worker Reliability & Verification Hardening

**Status:** Planning (2026-04-06)

## Problem

Workers complete steps at a good pace (~6/hour) but verification is shallow. The verifier consistently reports 71% pass (5/7) with `node_build` and `lint_pass` as advisory failures — these never block progress, so broken builds accumulate across steps. Workers also leave orphan processes (stale dev servers on ports), and the web-testing skill hardcodes `localhost:3000` even though Next.js falls back to `:3001`, `:3002`, etc. when a port is occupied.

**What's wrong today:**
- `node_build` and `lint_pass` verifier failures are advisory-only — workers never fix build errors before moving to the next step
- Orphan `next-server` processes accumulate (port 3000 frozen, 3001 stale) — no cleanup between worker sessions
- `web-testing` skill hardcodes `http://localhost:3000` — fails when dev server binds to a different port
- No mid-build verification — a step can complete "successfully" while the app doesn't render
- Reference POCs in `worker-base` skill are narrow (v1 Claude SDK experiments only) — should be updated or removed if stale

## Core Issue

The system optimizes for step throughput over build health. A worker marks a step "complete" when it finishes its task description, even if `npm run build` fails. Over 32 steps, this compounds into a broken app that can't be verified at the end.

## Requirements

### R1: Promote Build Verification to Hard Failure

The `node_build` verifier should be a **hard failure** for web projects, not advisory. If `npm run build` fails after a step, that step should fail and retry — not pass through to the next step.

**Implementation options:**
- Option A: Make `node_build` a hard verifier for goals tagged `nextjs`, `react`, or matching web keywords
- Option B: Add a `hard_verifiers` field to PROMPT.md frontmatter (per-goal control)
- Option C: The `web-testing` skill declares which verifiers are hard requirements

### R2: Dynamic Port Detection in web-testing Skill

The `web-testing` skill should detect which port the dev server actually started on, not assume `:3000`.

**Approach:**
```bash
# Start dev server and capture output
cd {{PROJECT_PATH}} && npm run dev > /tmp/dev-server.log 2>&1 &
sleep 3
# Parse actual port from output
PORT=$(grep -oP 'localhost:\K\d+' /tmp/dev-server.log | head -1)
playwright-cli open http://localhost:$PORT
```

Or use `lsof -i -P -n | grep node | grep LISTEN` to find the port after startup.

### R3: Orphan Process Cleanup Between Steps

Workers leave dev servers running after each step. The worker spawner (or the worker-base skill) should kill orphan Node processes before starting a new step.

**Options:**
- Add a "cleanup" section to `worker-base` skill: "Before starting, kill any dev servers in your project directory"
- Add process cleanup to `worker-spawner.ts` `setupAgentOutputsRoot()` — run `pkill -f "next-server"` before each spawn
- Add cleanup to the step handoff protocol

### R4: Build-Fix Regression Loop

When a build fails after step N, the retry should focus specifically on fixing the build — not re-doing the entire step. The retry context should include the exact build error so the worker can target the fix.

**Approach:**
- Extract build error from `npm run build 2>&1` output
- Pass it to the retry prompt as structured context: "Your last attempt broke the build. Error: [exact error]. Fix the build first, then continue."
- The `web-testing` skill's post-build check already verifies rendering — this just makes build failure a hard gate

### R5: Update or Prune Reference POCs

The `worker-base` skill references 3 POCs from early v1:
- `references/poc/claude/chat-cli/` — Agent SDK basics
- `references/poc/claude/agent-sdk-skills-poc/` — Skills integration
- `references/poc/claude/agent-sdk-subagents-poc/` — Subagent delegation

These are all Claude-specific SDK experiments. For Kimi/Codex workers, they're irrelevant. Options:
- Move POC references to a Claude-specific section (only injected for Claude vendor)
- Update with Kimi/Codex POC references from `references/poc/{codex,kimi}/`
- Remove from `worker-base` entirely — workers rarely consult them

### R6: Step-Level Build Health Tracking

Track build health in STEPS.json alongside step status. After each step, record whether `npm run build` passes. This gives visibility into when builds break and which step caused it.

```json
{
  "id": "step-5",
  "status": "complete",
  "build_health": "pass",  // or "fail", "skip"
  "build_error": null       // or the error message
}
```

## Lessons Learned (Session 2026-04-05/06)

1. **Advisory verifiers don't drive quality** — workers ignore advisory failures and move on. If build health matters, it must be a hard gate.
2. **Port collisions are common** — each worker starts `npm run dev &` but doesn't clean up. By step 6, ports 3000-3005 may all have stale processes.
3. **Step throughput ≠ quality** — 6 steps/hour is great velocity, but compounding build errors mean the final app may not work despite all steps "passing."
4. **Step repeat bug was caused by custom IDs** — `step-regression-1` didn't match the `step-{N}` pattern. Fixed in v2.1.4 by using `step.id` directly.
5. **Skill-based composition works** — v2.1.4 proved that skills load correctly, vendor adaptation applies, and the prompt builder is now a thin composer.

## Success Criteria

- [ ] `node_build` is a hard failure for web projects — broken builds trigger retry
- [ ] `web-testing` skill detects actual dev server port dynamically
- [ ] Orphan processes are cleaned up between worker sessions
- [ ] Build errors are included in retry context for targeted fixes
- [ ] Reference POCs updated or pruned for multi-vendor relevance
- [ ] Build health tracked per-step in STEPS.json
- [ ] End-to-end: a 32-step web project completes with a working, renderable app
