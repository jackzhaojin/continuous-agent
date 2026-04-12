# v2.3 — Unified Build Targets + Hardening Release

**Status:** Draft for execution planning
**Focus:** First, unify where harnesses and the executive agent write output (build target model). Then harden the system based on v2.2 delivery gaps and prior retro findings.

## Why v2.3 Exists

Two problems converged:

1. **Fragmented output model.** Harnesses write to one place (`harness-v2-test/`), the executive agent writes to another (`ai-sandbox/`), and there's no way to point either at an existing project. As we scale to more builds and want agents working on real repos, we need a unified build target layer before adding more capabilities on top.

2. **Reliability gap.** v2.2 shipped major harness capabilities, but evidence across v2.2 docs and prior retros shows a gap between "feature implemented" and "system proven under realistic autonomous runs."

v2.3 addresses both: **build the new operating model first, then harden everything on top of it.**

## Execution Order

v2.3 is sequenced in three phases. Each phase builds on the previous — don't start Phase 2 until Phase 1 is validated.

```
Phase 1: Unified Build Targets (PRD)
  └── New default operating model for all output
       ↓
Phase 2: Capability Hardening
  └── Validate v2.2 claims, strengthen prompts/vendors, run the test matrix
       ↓
Phase 3: Retro Carry-Forward
  └── Close remaining H/I items from v2.1.6 retro and v2.2 known issues
```

---

## Phase 1: Unified Build Targets

**PRD:** [`harness-build-target-prd.md`](harness-build-target-prd.md)

Merge the harness and executive agent output paths into a single build-target model with three options:

| Target | Description | When to use |
|---|---|---|
| **worktree** (default) | Git worktree off `ai-sandbox-v2` repo | New projects, incubating work, parallel builds |
| **existing** | Work directly in an external repo/directory | Improving existing projects, migrations |
| **monorepo** (legacy) | Subfolder in current `ai-sandbox/` | Backward compat, scratch experiments |

### Phase 1 Goals

1. **P1-1:** Jack creates `ai-sandbox-v2` repo (Apache 2.0, baseline `.gitignore`, init commit)
2. **P1-2:** Add `build_target`, `target_dir`, `target_branch` to PROMPT.md frontmatter parser (`prompt-md-parser.ts`)
3. **P1-3:** Implement worktree creation in worker-spawner — `git worktree add` off `ai-sandbox-v2` init commit
4. **P1-4:** Implement `existing` target — validate `target_dir`, skip project scaffold, respect existing conventions
5. **P1-5:** Wire harness `targetDir` resolution through PROMPT.md instead of CLI `--target`
6. **P1-6:** Run one harness goal and one executive goal using worktree target end-to-end
7. **P1-7:** Run one executive goal using `existing` target against a real external project
8. **P1-8:** Flip default from `monorepo` to `worktree`

### Phase 1 Success Criteria

- Both harness and executive agent can create and write to a worktree off `ai-sandbox-v2`
- An executive goal can work directly in an existing external project via `target_dir`
- Legacy `ai-sandbox/` monorepo path still works for goals without `build_target`
- `output_path` persistence and retry context work correctly for all three targets

---

## Phase 2: Capability Hardening

Validate v2.2 claims and strengthen the system. This work runs on the new build target model from Phase 1.

### A. Validation & Test Matrix

1. Create a v2.2 capability matrix (the "7 things" + sub-capabilities) and map each to test evidence.
2. Add/expand harness test suites to cover:
   - standalone vs integrated mode parity
   - all 3 harnesses (`generic`, `eds`, `study`)
   - vendor permutations (Claude, Codex, Kimi CLI, Kimi Wire)
3. Mark each item as: `Verified`, `Partially Verified`, `Unverified`, or `Deferred`.
4. Treat "claim without evidence" as failing hardening acceptance.

### B. Harness + Executive Integration Reliability

5. Run at least one real multi-step goal via `execution_pattern: harness` inside the executive loop.
6. Verify phase-to-step mapping, verifier behavior, retries, and defect-subtask handling under integrated mode.
7. Ensure harness failures propagate cleanly into Phase 7 diagnosis and Phase 8 blocking behavior.

### C. Prompting Hardening (Executive + Worker)

8. Strengthen executive prompts for:
   - gate enforcement decisions
   - defect escalation boundaries
   - re-breakdown behavior preserving completed work
9. Strengthen worker prompts/skills for:
   - structured handoffs
   - explicit verification sequencing (build/API/UI)
   - tool-use compliance
10. Add explicit "documentation adherence" cues for lower-cost vendors (especially Kimi).

### D. Ledger-Driven Tooling Policy

11. Define Playwright CLI usage policy from ledger evidence:
    - **Required**: web UI change verification and critical journey gates
    - **Recommended**: ambiguous UI-impact tasks
    - **Optional/Skip**: backend-only or non-visual work
12. Encode policy into prompts/skills/verifier expectations — use Playwright when it improves confidence, avoid ritualized overuse.

### E. Vendor-Specific Prompting & Adapter Audit

13. Audit vendor adapter behavior and prompt injection across all worker paths.
14. Confirm Kimi-specific mappings/instructions are consistently active for all Kimi variants (`kimi`, `kimi-cli`, `kimi-wire`).
15. Identify where vendor-specific logic is missing (e.g., study-harness coordinator emulation, HOW translation) and prioritize fixes.

### Phase 2 Success Criteria

- Every major v2.2 capability claim has explicit evidence or explicit deferral
- Harness runs are reliable in both standalone and integrated modes
- Kimi K2.5 path shows materially improved instruction adherence and deterministic handoffs
- Playwright CLI usage is targeted (high-value), not blanket
- Vendor-specific prompt/adapter behavior is documented and consistently enforced

---

## Phase 3: Retro Carry-Forward (H/I Items)

Close unresolved items carried from v2.1.6 retro and v2.2 known issues:

16. **H1:** Fix Kimi handoff parser — `parseStructuredHandoffFromLog()` must JSON-parse `[MSG]` lines before searching for YAML fences
17. **H3:** Gate enforcement — gates must block progress when regression test count increases; gate workers need authority to file defect subtasks
18. **H4:** Defect recursion depth limit — hard cap at 2-3 levels in `insertDefectSubtask()`, escalate to `needs-you.md` instead of infinite recursion
19. **H5:** Re-breakdown preserves completed steps — don't regenerate steps 0-N when only step N+1 failed
20. **H6:** Worker log full output — remove `.slice(0, 500)` truncation on `msg.raw` in worker-spawner.ts
21. **I0:** Enrich prompt packet — inject API surface summary, last gate test count, health check result
22. **I1:** Backend testing skill — separate `backend-testing` skill for API smoke tests without browser
23. **I2:** Backend-first build order — for fullstack goals, API endpoints + smoke test gate before UI work
24. **I3:** Journey definition includes API verification — `definition_of_done_journey` must cover backend round-trips
25. **I4:** Workers use UI libraries — skill guidance to use shadcn/radix instead of custom components

### Phase 3 Success Criteria

- A fullstack goal completes with at least one defect subtask filed and resolved mid-build
- Gate enforcement blocks a regression and it gets fixed before proceeding
- Backend health check runs at every gate
- Prior step handoff contains real structured content (not "no structured handoff")
- The final product is demoable end-to-end in a browser

---

## Future (Post-v2.3): Unified Input Packet

Both harness and executive execution should converge on a single PROMPT.md schema. Today harnesses use CLI flags + `HarnessRunConfig` while the executive uses PROMPT.md frontmatter + env vars. Post-v2.3:

- Move vendor/model config from CLI flags into PROMPT.md frontmatter (per-role: `worker_vendor`, `planner_vendor`, `validator_vendor`)
- Harness CLI becomes a thin wrapper that reads PROMPT.md
- Document all PROMPT.md fields with defaults in one reference
- Executive and harness share the same parser

See [`harness-build-target-prd.md`](harness-build-target-prd.md) "Unified Input Packet" section for the target schema.

---

## Non-Goals

- Shipping major new features unrelated to build targets or hardening
- Re-architecting harnesses from scratch
- Full unified input packet (post-v2.3, see above)
- Automating worktree-to-standalone-repo promotion
- Auto-creating the `ai-sandbox-v2` repo (Jack does this manually)

## Deliverables

1. Working build-target resolution for all three targets (worktree, existing, monorepo)
2. Capability test matrix artifact with linked evidence
3. Prompt/skill revisions reflecting vendor-aware and ledger-driven guidance
4. Validation report per vendor and per harness mode
5. Final v2.3 outcome report distinguishing: shipped, verified, partially verified, deferred

## References

- [`harness-build-target-prd.md`](harness-build-target-prd.md) — Build target PRD (Phase 1 detail)
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
