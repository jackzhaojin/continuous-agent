# v2.3 — Hardening Release

**Focus:** Validate and harden both the harness system (v2.2) and the continuous-agent executive pipeline (v2.1.6) based on findings from the B2B Postal Checkout v2.1.6 retro and harness v2.2 delivery.

**Trigger:** The v2.1.6 re-run (55 steps, ~15h, Kimi K2.5) exposed critical gaps in the defect-subtask pipeline, handoff parsing, gate enforcement, and backend testing — all documented in `retro-b2b-postal-checkout-v2.1.6.md`. The harness v2.2 system needs production validation beyond the initial vendor comparison tests.

## Goals

### Continuous-Agent Executive Fixes (from retro H1-H6)

1. **H1: Fix Kimi handoff parser** — `parseStructuredHandoffFromLog()` must JSON-parse `[MSG]` lines before searching for YAML fences. The entire handoff chain (validator, prompt builder, next-step context) is broken for Kimi vendor.

2. **H2: Defect subtask pipeline real-world validation** — The 17→17.1→18 pattern was never exercised for a real product defect. Run a goal where the validator actually files a mid-build defect and the depth-first resolution produces a fix before the next sibling step.

3. **H3: Gate enforcement** — Gates must block progress when regression test count increases. Gate workers need authority to file defect subtasks, not just document failures.

4. **H4: Defect recursion depth limit** — Hard cap at 2-3 levels in `insertDefectSubtask()`. Escalate to `needs-you.md` instead of infinite recursion.

5. **H5: Re-breakdown preserves completed steps** — Don't regenerate steps 0-N when only step N+1 failed.

6. **H6: Worker log full output** — Remove `.slice(0, 500)` truncation on `msg.raw` in worker-spawner.ts line 764.

### Continuous-Agent Input/Skill Improvements (from retro I0-I4)

7. **I0: Enrich prompt packet** — Inject API surface summary, last gate test count, health check result, move `data_requirements` into Constraints section.

8. **I1: Backend testing skill** — Separate `backend-testing` skill for API smoke tests without browser.

9. **I2: Backend-first build order** — For fullstack goals, API endpoints + smoke test gate before any UI work.

10. **I3: Journey definition includes API verification** — `definition_of_done_journey` must cover backend round-trips, not just UI navigation.

11. **I4: Workers use UI libraries** — Skill guidance to use shadcn/radix instead of building custom Select/Combobox/DatePicker from scratch.

### Harness v2.2 Validation

12. **Run harness on a real multi-step goal** — Validate the phased delivery, vendor-agnostic chokepoint, and per-harness deltas work in a production scenario (not just unit/mock tests).

13. **Harness + executive integration** — Verify that harness-mode execution pattern correctly delegates to HarnessOrchestrator and results flow back through Phase 5 verifiers.

## Success Criteria

- A fullstack goal (with DB + API + UI) completes with:
  - At least one defect subtask filed and resolved mid-build (not just at step 1)
  - Gate enforcement blocks a regression and it gets fixed before proceeding
  - Backend health check runs at every gate
  - Prior step handoff contains real structured content (not "no structured handoff")
  - The final product is demoable end-to-end in a browser
- Harness v2.2 runs a multi-phase goal to completion

## References

- `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.6.md` — Full retro with H1-H6 and I0-I4
- `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout.md` — Original v2.1.4 retro
- `HARNESS.md` — Harness v2.2 reference
