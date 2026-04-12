# v2.3 — Hardening Release (Revised)

**Status:** Draft for execution planning  
**Focus:** Convert v2.2 delivery into production confidence by closing validation gaps, strengthening vendor-specific behavior (especially Kimi K2.5), and hardening harness + executive integration.

## Why v2.3 Exists

v2.2 shipped major harness capabilities, but evidence across v2.2 docs and prior retros shows we still have a reliability gap between **"feature implemented"** and **"system proven under realistic autonomous runs."**

v2.3 is therefore a **hardening release**, not a net-new feature release.

## Inputs Reviewed

- v2.0 blueprint (`plan-2.0.md`) for execution-order and validation discipline
- v2.1 goals/retros for quality regressions and autonomous-run failure modes
- v2.2 goals/outcome/prompt-log/validation report for what was claimed vs what was actually tested

## Gaps to Close from v2.2 + Retros

### G1) "7 things built" but test coverage confidence is incomplete

We have evidence of substantial delivery in v2.2, but not all shipped surfaces were proven equally across:
- standalone harness mode
- integrated (meta-worker) harness mode
- all harness types (`generic`, `eds`, `study`)
- all vendors (Claude, Codex, Kimi CLI, Kimi Wire)

**v2.3 intent:** define and run an explicit test matrix so every major shipped claim is either verified, downgraded, or deferred with rationale.

### G2) Harness integration is implemented, but needs production-grade validation

v2.2 established integration paths; v2.3 must prove the executive can repeatedly run harness-backed goals end-to-end with stable contracts, gates, and failure handling.

### G3) Kimi K2.5 affordability is attractive, but instruction-following is weaker

Retros and v2.2 notes indicate Kimi can under-follow documentation and HOW-phase translation unless prompts are explicit.

**v2.3 intent:** strengthen both:
- **executive-side instructions** (selection, gating, escalation, defect handling)
- **worker-side instructions** (tool usage, verification expectations, handoff format)

### G4) Ledger logs are under-utilized for behavior steering

We need stronger feedback loops from ledger evidence into prompting and routing:
- when Playwright CLI usage should be enforced
- when it should be suggested (avoid over-prescription)
- when backend/API verification must take precedence

### G5) Vendor-specific prompting/logic needs explicit assessment

We need a clear status and gap list for vendor adapters and vendor-targeted prompts, including whether Kimi K2.5-specific logic is consistently applied to **all Kimi worker paths**.

---

## v2.3 Goals

### A. Validation & Test Matrix Hardening

1. Create a single v2.2 capability matrix (the "7 things" + sub-capabilities) and map each item to test evidence.
2. Add/expand harness test suites to cover:
   - standalone vs integrated mode parity
   - all 3 harnesses
   - vendor permutations (Claude, Codex, Kimi CLI, Kimi Wire)
3. Mark each matrix item as: `Verified`, `Partially Verified`, `Unverified`, or `Deferred`.
4. Treat "claim without evidence" as failing hardening acceptance.

### B. Harness + Executive Integration Reliability

5. Run at least one real multi-step goal via harness execution_pattern inside the executive loop.
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

### D. Ledger-Driven Tooling Policy (Playwright CLI, not overused)

11. Define a policy from ledger evidence:
   - **Required**: web UI change verification and critical journey gates
   - **Recommended**: ambiguous UI-impact tasks
   - **Optional/Skip**: backend-only or non-visual work
12. Encode this policy into prompts/skills/verifier expectations so workers use Playwright CLI when it improves confidence, but avoid ritualized overuse.

### E. Vendor-Specific Prompting & Adapter Audit

13. Audit vendor adapter behavior and prompt injection across all worker paths.
14. Confirm Kimi-specific mappings/instructions are consistently active for all Kimi variants (`kimi`, `kimi-cli`, `kimi-wire`).
15. Identify where vendor-specific logic is missing (e.g., study-harness coordinator emulation, HOW translation) and prioritize fixes.

### F. Retro Carry-Forward (H/I items)

16. Complete unresolved hardening items carried from v2.1.6 retro and v2.2 known issues, including:
   - Kimi handoff parsing and determinism
   - gate regression blocking
   - defect recursion limits
   - preserving completed steps during re-breakdown
   - full worker-log context capture
   - backend-testing skill and backend-first validation flow

---

## Deliverables

1. Updated hardening implementation plan (v2.3 scoped backlog with owners/status).
2. Capability test matrix artifact with linked evidence.
3. Prompt/skill revisions (executive + worker) reflecting vendor-aware and ledger-driven guidance.
4. Validation report per vendor and per harness mode.
5. Final v2.3 outcome report that distinguishes:
   - shipped
   - verified
   - partially verified
   - deferred

## Success Criteria

v2.3 is successful only if all are true:

- Every major v2.2 capability claim has explicit evidence or explicit deferral.
- Harness runs are reliable in both standalone and integrated modes for representative goals.
- Kimi K2.5 path shows materially improved instruction adherence and deterministic handoffs.
- Playwright CLI usage is targeted (high-value), not blanket.
- Vendor-specific prompt/adapter behavior is documented and consistently enforced.
- No unresolved contradiction between goals, outcome claims, and validation reports.

## Non-Goals

- Shipping major new product features unrelated to hardening.
- Re-architecting harnesses from scratch.
- Expanding dashboard/observability scope beyond what is required to validate hardening claims.

## References

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
