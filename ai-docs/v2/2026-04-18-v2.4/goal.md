# v2.4 — Capability Hardening & Retro Carry-Forward

**Status:** Planned
**Focus:** Validate v2.2 harness claims under real autonomous runs, close H/I items from the v2.1.6 retro and v2.2 known issues, and tighten prompts/adapters.

> **Split out from v2.3 on 2026-04-18.** v2.3's original scope was "Unified Build Targets + Hardening Release." Once the build-target work shipped as v2.3.0, the hardening + retro carry-forward content was moved here so v2.4 can be sequenced independently. See [`../2026-04-18-v2.3/goal.md`](../2026-04-18-v2.3/goal.md) for what shipped in the split.

## Why v2.4 Exists

v2.2 shipped major harness capabilities, but evidence across v2.2 docs and prior retros shows a gap between "feature implemented" and "system proven under realistic autonomous runs." v2.4 closes that gap on top of the v2.3 build-target model.

## Execution Order

v2.4 has two workstreams:

```
A. Capability Hardening
   └── Validate v2.2 claims, strengthen prompts/vendors, run the test matrix
        ↓
B. Retro Carry-Forward
   └── Close remaining H/I items from v2.1.6 retro and v2.2 known issues
```

---

## A. Capability Hardening

### v2.2 Verification Gap

The v2.2 outcome (`ai-docs/v2/2026-04-11-v2.2/outcome.md`) claims four things delivered:

| v2.2 Claim | Actual evidence | Real status |
|---|---|---|
| Standalone harness runs | All 3 harnesses ran via CLI, 3 vendors, visually verified via Playwright headful | **Verified** |
| Meta-worker integration (executive → harness) | Mock e2e tests only (`mock-{generic,eds,study}-orchestrator.e2e.ts`). No real executive loop run with a live LLM. | **Unverified** |
| Multi-vendor (Claude + Codex + Kimi) | Standalone runs only. Codex only tested on generic, not eds/study. Kimi CLI intermittent. | **Partially verified** |
| OSS-prep | LICENSE, CONTRIBUTING, README, docs updated. No publishing pipeline. | **Verified** (docs only) |

**The critical gap is executive → harness integration.** The entire path — `harness-executor.ts` resolving the harness, consuming `HarnessOrchestrator.run()` events, bridging them into STEPS.json via `StepSink`, Phase 5 verifiers running against harness output, Phase 7 diagnosis on harness failure, Phase 8 blocking — has never been tested with a real LLM and a real goal bundle in `workspace/ondeck/`.

### A1. Executive → Harness Integration (the must-test)

This is the highest priority item. Everything else is secondary until this works.

1. **Create a real goal bundle** with `execution_pattern: harness` and `harness: generic`, drop it into `workspace/ondeck/`, and let the executive loop pick it up.
2. **Verify the full event flow**: harness phases appear as steps in STEPS.json, `PROGRESS_LOG.md` updates in real time, `CONTRACTS.jsonl` records the contract lifecycle.
3. **Verify phase-to-step mapping**: each harness phase (WHY/WHAT/HOW/WHEN/RESEARCH/BUILD/VALIDATE) maps to a step in STEPS.json with correct status transitions.
4. **Verify failure handling**: intentionally trigger a harness failure (e.g. bad prompt that causes BUILD to fail) and confirm:
   - The failure propagates to Phase 7 diagnosis
   - Phase 8 blocks the goal appropriately
   - Internal harness retries are NOT counted against the executive's 3-failure threshold (as documented in `.claude/rules/harnesses.md`)
5. **Verify verifier behavior**: Phase 5 verifiers run against the harness output directory and produce meaningful pass/fail signals.
6. **Repeat with `harness: eds`** if generic passes — at minimum two harnesses validated in integrated mode.

### A2. Build-Target Manual E2E (carried from v2.3 P1-6 / P1-7)

7. Run one harness goal and one executive goal using `worktree` target end-to-end (manual e2e).
8. Run one executive goal using `existing` target against a real external project (manual e2e).

### A3. Validation & Test Matrix

9. Create a v2.2 capability matrix mapping each claim to test evidence (using the gap table above as a starting point).
10. Expand harness test suites to cover:
    - standalone vs integrated mode parity
    - all 3 harnesses (`generic`, `eds`, `study`)
    - vendor permutations where feasible (Claude primary, Codex on generic, Kimi wire on generic)
11. Mark each item as: `Verified`, `Partially Verified`, `Unverified`, or `Deferred`.
12. Treat "claim without evidence" as failing hardening acceptance.

### A4. Prompting Hardening (Executive + Worker)

13. Strengthen executive prompts for:
    - gate enforcement decisions
    - defect escalation boundaries
    - re-breakdown behavior preserving completed work
14. Strengthen worker prompts/skills for:
    - structured handoffs
    - explicit verification sequencing (build/API/UI)
    - tool-use compliance
15. Add explicit "documentation adherence" cues for lower-cost vendors (especially Kimi).

### A5. Ledger-Driven Tooling Policy

16. Define Playwright CLI usage policy from ledger evidence:
    - **Required**: web UI change verification and critical journey gates
    - **Recommended**: ambiguous UI-impact tasks
    - **Optional/Skip**: backend-only or non-visual work
17. Encode policy into prompts/skills/verifier expectations — use Playwright when it improves confidence, avoid ritualized overuse.

### A6. Vendor-Specific Prompting & Adapter Audit

18. Audit vendor adapter behavior and prompt injection across all worker paths.
19. Confirm Kimi-specific mappings/instructions are consistently active for all Kimi variants (`kimi`, `kimi-cli`, `kimi-wire`).
20. Identify where vendor-specific logic is missing (e.g., study-harness coordinator emulation, HOW translation) and prioritize fixes.

### Hardening Success Criteria

- **Executive → harness integration works end-to-end with a real LLM** — not just mock tests. A goal bundle with `execution_pattern: harness` completes successfully through the full executive loop lifecycle.
- Build-target manual e2e (worktree + existing) passes for both harness and executive modes.
- Every major v2.2 capability claim has explicit evidence or explicit deferral.
- Harness runs are reliable in both standalone and integrated modes.
- Kimi K2.5 path shows materially improved instruction adherence and deterministic handoffs.
- Playwright CLI usage is targeted (high-value), not blanket.
- Vendor-specific prompt/adapter behavior is documented and consistently enforced.

---

## B. Retro Carry-Forward (H/I Items)

Close unresolved items carried from v2.1.6 retro and v2.2 known issues:

21. **H1:** Fix Kimi handoff parser — `parseStructuredHandoffFromLog()` must JSON-parse `[MSG]` lines before searching for YAML fences
22. **H3:** Gate enforcement — gates must block progress when regression test count increases; gate workers need authority to file defect subtasks
23. **H4:** Defect recursion depth limit — hard cap at 2-3 levels in `insertDefectSubtask()`, escalate to `needs-you.md` instead of infinite recursion
24. **H5:** Re-breakdown preserves completed steps — don't regenerate steps 0-N when only step N+1 failed
25. **H6:** Worker log full output — remove `.slice(0, 500)` truncation on `msg.raw` in worker-spawner.ts
26. **I0:** Enrich prompt packet — inject API surface summary, last gate test count, health check result
27. **I1:** Backend testing skill — separate `backend-testing` skill for API smoke tests without browser
28. **I2:** Backend-first build order — for fullstack goals, API endpoints + smoke test gate before UI work
29. **I3:** Journey definition includes API verification — `definition_of_done_journey` must cover backend round-trips
30. **I4:** Workers use UI libraries — skill guidance to use shadcn/radix instead of custom components

### Retro Carry-Forward Success Criteria

- A fullstack goal completes with at least one defect subtask filed and resolved mid-build
- Gate enforcement blocks a regression and it gets fixed before proceeding
- Backend health check runs at every gate
- Prior step handoff contains real structured content (not "no structured handoff")
- The final product is demoable end-to-end in a browser

---

## Future (Post-v2.4): Unified Input Packet

Both harness and executive execution should converge on a single PROMPT.md schema. Today harnesses use CLI flags + `HarnessRunConfig` while the executive uses PROMPT.md frontmatter + env vars.

- Move vendor/model config from CLI flags into PROMPT.md frontmatter (per-role: `worker_vendor`, `planner_vendor`, `validator_vendor`)
- Harness CLI becomes a thin wrapper that reads PROMPT.md
- Document all PROMPT.md fields with defaults in one reference
- Executive and harness share the same parser

See [`../2026-04-18-v2.3/harness-build-target-prd.md`](../2026-04-18-v2.3/harness-build-target-prd.md) "Unified Input Packet" section for the target schema.

---

## Non-Goals

- Shipping major new features unrelated to hardening
- Re-architecting harnesses from scratch
- Full unified input packet (post-v2.4, see above)
- Cloud migration or observability unification (moved to [v3.0](../xxxx-xx-xx-v3.0/goal.md) / [v3.1](../xxxx-xx-xx-v3.1/goal.md))

## Deliverables

1. Capability test matrix artifact with linked evidence
2. Prompt/skill revisions reflecting vendor-aware and ledger-driven guidance
3. Validation report per vendor and per harness mode
4. Final v2.4 outcome report distinguishing: shipped, verified, partially verified, deferred

## References

- [`../2026-04-18-v2.3/goal.md`](../2026-04-18-v2.3/goal.md) — v2.3.0 shipped build-target work (predecessor)
- [`../2026-04-18-v2.3/harness-build-target-prd.md`](../2026-04-18-v2.3/harness-build-target-prd.md) — Build-target PRD
- `ai-docs/v2/2026-03-29-v2.0/plan-2.0.md`
- `ai-docs/v2/2026-04-01-v2.1/goal.md`
- `ai-docs/v2/2026-04-01-v2.1/goal-2.1.4.md`
- `ai-docs/v2/2026-04-01-v2.1/goal-2.1.5.md`
- `ai-docs/v2/2026-04-01-v2.1/goal-2.1.6.md`
- `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.5.md`
- `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.6.md`
- `ai-docs/v2/2026-04-11-v2.2/goals.md`
- `ai-docs/v2/2026-04-11-v2.2/outcome.md`
- `ai-docs/v2/2026-04-11-v2.2/validation-report-kimi-k2.5.md`
- `ai-docs/v2/2026-04-11-v2.2/prompt-log.md`
