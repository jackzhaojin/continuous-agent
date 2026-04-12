# Retrospective: B2B Postal Checkout Flow — v2.1.6 Re-run

**Date:** 2026-04-12
**Goal:** B2B Postal Checkout Flow (P2) — second run with v2.1.6 defect-subtask pipeline
**Vendor:** Kimi K2.5 (CLI, stream-json mode)
**Duration:** ~15 hours wall clock (2026-04-11T18:15 → 2026-04-12T09:05 UTC)
**Result:** GOAL_COMPLETED — 55 steps in final STEPS.json (47 build + 8 defect subtasks), 60 commits, 213 E2E test cases, 83 components, 12 API routes, ~41,600 lines of TS/TSX

---

## Context

This is the second attempt at the B2B Postal Checkout goal, now running on v2.1.6 which introduced:
- **Defect subtask pipeline** — Phase 5b integration validator that can file subtasks
- **Integration gates** — `[GATE]` steps every ~3 build steps
- **Prerequisite detection** — seed data step auto-inserted before UI work
- **`definition_of_done_journey`** in PROMPT.md frontmatter
- **Structured handoff protocol** — workers produce `what_i_built`, `what_connects`, `what_i_verified`

The first run (v2.1.4, retro'd in `retro-b2b-postal-checkout.md`) completed 32 steps in ~11 hours with 52 commits but shipped an undemoable product. This run aimed to prove the new pipeline catches integration failures.

---

## Timeline

| Phase | Time (UTC) | Duration | What happened |
|-------|-----------|----------|---------------|
| Goal start + breakdown | 18:15 | — | 70-step plan generated |
| Step 0-1 (research + init) | 18:15–18:28 | 13min | Research completed, init started |
| **Recursive defect chain** | **18:28–22:18** | **3h 50min** | Validator filed defects about missing handoffs, spawning recursive defect-on-defect chain (30 attempts) |
| 5 re-breakdowns | 18:15–20:25 | 2h 10min | System re-broke the goal 5 times (70→71→47→30→47 steps) trying to escape the defect loop |
| Defect chain resolves | 21:58–22:18 | 20min | 8 defect subtasks completed in reverse order (deepest first) |
| **Schema + seed data** | **22:40–22:51** | **11min** | Steps 1-2: Supabase schema + seed data — clean, no retries |
| Gate 1 checkpoint | 22:51–22:55 | 4min | First gate passed |
| **Core build phase** | **22:55–06:06** | **7h 11min** | Steps 4-34: layout, forms, APIs, all 6 wizard pages |
| **Extended build** | **06:06–08:45** | **2h 39min** | Steps 35-44: CRUD endpoints, search, draft/resume, responsive, a11y, E2E tests |
| Final polish | 08:45–09:05 | 20min | Steps 45-46: bug fixes, cleanup, documentation |
| **GOAL_COMPLETED** | **09:05** | — | All 55 steps marked complete |

**Total wall clock:** ~14h 50min
**Productive build time (excluding defect chain):** ~10h 25min
**Defect chain waste:** ~3h 50min (26% of total time)

---

## By the Numbers

| Metric | v2.1.6 (this run) | v2.1.4 (first run) | Delta |
|--------|-------------------|---------------------|-------|
| Total steps | 55 (47 build + 8 defect) | 32 | +72% |
| Step attempts | 84 | 55 | +53% |
| Steps completed | 60 (includes defect chain) | 32 | +88% |
| Wasted attempts (defect chain) | 30 | 23 (retries) | +30% |
| Git commits | 60 | 52 | +15% |
| Components built | 83 | 40+ | +108% |
| API routes | 12 | ~5 | +140% |
| E2E test cases | 213 | 217 | ~same |
| Lines of code | ~41,600 | ~20,000 (est) | +108% |
| Integration gates | 11 | 0 | NEW |
| Wall clock time | ~15h | ~11h | +36% |
| Human interventions | 0 | 2 | -100% |
| Re-breakdowns | 5 | 1 | +400% |

---

## Execution Analysis: Executive + Worker Coordination

### What the Executive Did Well

1. **Zero human interventions.** Unlike the v2.1.4 run (2 hotfixes needed), the v2.1.6 run completed entirely autonomously. The framework held up.

2. **Prerequisite detection worked.** Steps 1-2 were auto-inserted as schema setup + seed data, correctly identified from the goal's Supabase/database keywords. This was the #1 recommendation from the first retro.

3. **Integration gates fired reliably.** 11 gates inserted at regular cadence throughout the build. Every gate completed. The gate workers ran `npx playwright test` regression suites and extended `journey.spec.ts`.

4. **Depth-first subtask resolution.** When the defect chain finally resolved, the system correctly walked the tree bottom-up: step-1.1.2.1.1.1.1.1 completed first, then 1.1.2.1.1.1, then 1.1.2.1.1, etc. The depth-first `selectNextExecutableStep` worked exactly as designed.

5. **Step velocity was excellent post-stabilization.** Once the defect chain resolved (22:40), the system completed 47 productive steps in ~10.5 hours = **4.5 steps/hour** (1 step every ~13 minutes). Comparable to the v2.1.4 clean run (4.6 steps/hour).

### What the Executive Did Poorly

1. **Recursive defect chain — the biggest failure.** The Phase 5b validator filed a defect "Step-1 handoff missing" because the Kimi worker didn't produce a structured handoff. That defect step also failed to produce a handoff, so the validator filed a defect about the defect. This recursed to depth `step-1.1.2.1.1.1.1.1` over 30 attempts and 3h 50min before resolving.

   **Root cause:** The validator treated "missing handoff" as a product defect, but it's actually a harness telemetry gap. The worker DID produce output (schema was set up, files were created), but Kimi's output format doesn't include the structured handoff YAML that the state-handler parser expects. The validator couldn't see the work, so it assumed nothing was done.

   **Fix applied mid-run:** The integration-validator prompt was updated to bias toward PASS when handoffs are missing, and to never file defects titled "no structured handoff" or "no foundation exists." This stopped the bleeding, but the 3h 50min was already burned.

2. **5 re-breakdowns.** The defect chain caused the goal to hit failure thresholds that triggered re-breakdowns. Each re-breakdown generated a fresh step list (70→71→47→30→47), wasting research and init steps that had to re-run each time.

3. **Phase 5b validator was 100% PASS (38/38).** Every single validator call returned PASS. Zero defects filed from the validator after the recursive chain fix. This means the validator added LLM cost to every step completion but caught nothing. The reasoning-only mode is insufficient — it can only review structured handoffs, and Kimi produces none.

### Worker (Kimi K2.5) Performance

1. **Build quality was high.** 83 components, 12 API routes, responsive design, accessibility features, loading states, error boundaries. Visually the app looks professional and polished.

2. **Workers DID test.** Unlike the first run where testing was mostly aspirational, this run's gate workers actually ran `npx playwright test` and dealt with real failures. Gate 6 found a missing `current_step` column. Gate 11 fixed 24 broken selectors after the accessibility step changed form structure.

3. **Structured handoffs not produced.** Kimi workers started producing YAML handoffs around step 25, but the handoff parser in `state-handler.ts` doesn't extract them from Kimi's CLI output format. The parser was built for Claude Agent SDK output. This is why the validator was blind.

4. **Workers self-corrected.** Step 21 hit a 300s timeout running tests with a `--project=chromium` flag that didn't match the playwright config. The worker read the config and self-corrected without retry.

5. **Gate workers found real issues but didn't always fix them.** Gate 9 found 17/45 test failures (pricing→payment navigation broken). The gate worker documented the issue but did NOT fix it. The regression persisted through completion — ~26/67 journey tests still failing at the end.

---

## Product Demo: What Works and What Doesn't

### UI Pages Built (9 total)

| # | Route | Status |
|---|-------|--------|
| - | `/` (Home) | Works — landing page with CTA |
| 1 | `/shipments/new` (Details) | Works — full form with presets, dual address, package config, special handling |
| 2 | `/shipments/[id]/rates` | Works — 15 carrier rates displayed with comparison UI |
| 2b | `/shipments/[id]/pricing` | Duplicate of rates (different workers built both) |
| 3 | `/shipments/[id]/payment` | Partially works — 5 payment methods (PO, BOL, Third-Party, Net Terms, Corporate), billing form |
| 4 | `/shipments/[id]/pickup` | Broken — "Failed to load pickup availability" (API 500) |
| 5 | `/shipments/[id]/review` | Loads but data incomplete |
| 6 | `/shipments/[id]/confirm` | Loads with mock data |
| 6b | `/shipments/[id]/confirmation` | Duplicate of confirm |

### What Works (UI-only, no backend)

- **Visual quality is excellent.** Professional B2B shipping UI with proper iconography, responsive layout, accessibility (skip links, ARIA, keyboard nav).
- **Step 1 form is fully interactive.** Presets auto-fill dimensions, package type selector with DIM weight calculation, hazmat conditional form, multi-piece support, address autocomplete UI.
- **Rates page displays 15 mock rates** from multiple carriers with sorting, filtering, price breakdowns, delivery estimates, CO2 emissions.
- **Payment page has 5 B2B payment methods** — Purchase Order, Bill of Lading, Third-Party, Net Terms, Corporate Account. Each has its own detailed form.
- **6-step progress bar** with completed/active/pending states, keyboard navigation.
- **Error boundaries** — custom error page with "Something Went Wrong" UI, retry/go-back/go-home options.

### Known UI Defects

1. **SelectValue component always shows placeholder.** The custom `Select` component's `SelectValue` (line 206 of `components/ui/select.tsx`) returns `<>{placeholder}</>` unconditionally — it never reads the `value` from context. Country and State/Province dropdowns click correctly (onChange fires, form state updates) but the display always shows "Select country" / "Select state". This affects every combobox in the app.

2. **Duplicate page routes.** Workers built both `/rates` and `/pricing`, and both `/confirm` and `/confirmation`. Different workers in different steps didn't coordinate on route naming.

3. **Payment form validation is opaque.** The payment page shows "Payment Error: Please correct the validation errors" without indicating which specific fields failed. The PO form uses separate `useState` state (`purchaseOrderData`) not connected to react-hook-form, so `playwright-cli fill` sets DOM values but not React state.

### Backend / Data Flow Issues

1. **API health check reports `database: disconnected`.** The `/api/health` endpoint returns `{"status":"unhealthy","checks":{"database":{"status":"disconnected"}}}`. Supabase credentials exist in `.env.local` but the connection fails.

2. **All API routes return 500** when called from the UI. `/api/quote`, `/api/shipments/:id`, `/api/pickup-availability` all fail. The `GET /api/shipments` endpoint works (returns empty array), and `POST /api/shipments` validates input but the nested object schema (`origin`/`destination`/`package`) doesn't match what the form sends (flat field names).

3. **Backend errors start at Step 2 (Rates).** Step 1 is purely client-side. The moment the app navigates to rates and calls `/api/quote`, the 500s begin. The rates page falls back to mock data so it looks like it works, but it's not hitting the real API.

4. **Seed data may exist in Supabase** (Step 2 completed successfully with commit `2971fdcb`), but the API routes can't reach it due to the disconnected database status.

---

## The Gate System: Did It Catch Anything?

### Gate Results Summary

| Gate | Checkpoint | Tests | Findings |
|------|-----------|-------|----------|
| 1 | Schema + seed | N/A | Verified schema and seed completed |
| 2 | Layout + API config | N/A | Navigation structure verified |
| 3 | Step 1 forms | 7 journey tests | Form renders, presets work |
| 4 | Pricing engine | 12 journey tests | Pricing components render |
| 5 | Payment + billing | 17 journey tests | Payment selection works |
| 6 | Pickup calendar | 27 journey tests | Found missing `current_step` column issue |
| 7 | Pickup complete | 30 journey tests | Pickup form structure verified |
| 8 | Review page | 39 journey tests | Review page loads |
| 9 | Confirmation | 45 journey tests | **17 tests failed** (pricing→payment nav broken). NOT FIXED. |
| 10 | Draft/resume | 52 journey tests | Draft/resume flows added |
| 11 | A11y + loading | 67 journey tests | **Fixed 24 broken selectors** from a11y step. Added 11 new tests. |

**journey.spec.ts grew from 7 → 67 tests** across 11 gates. This is the append-only journey file working as designed.

### Gate Effectiveness

- **Regression detection: YES.** Gates 6, 9, and 11 all found real regressions.
- **Regression enforcement: NO.** Gate 9 found 17 test failures but the system continued building. There's no mechanism to block progress when gate tests fail. The gate worker documents failures but doesn't file defect subtasks for them — only the Phase 5b validator can do that, and it rubber-stamped everything PASS.
- **The pricing→payment navigation regression was never fixed.** It was detected at Gate 9 (~06:15) and persisted through GOAL_COMPLETED (~09:05). At completion, ~26/67 journey tests were still failing.

### Phase 5b Validator: Total Rubber Stamp

- **38 PASS, 0 FAIL.** Every single validator call returned PASS.
- **Reason:** The validator is reasoning-only — it reviews structured handoffs, not actual app state. Kimi workers don't produce structured handoffs in a format the state-handler parser can extract. So the validator saw "NO STRUCTURED HANDOFF" for every step and, per the anti-recursion rules, defaulted to PASS.
- **Cost:** 38 LLM calls with zero diagnostic value. The validator added latency and token cost to every step without catching a single issue.

---

## Architecture Lessons: Backend Needs Its Own Testing Layer

### The Core Insight

The v2.1.6 pipeline assumes a single "build and verify" loop where each worker builds a component and a gate verifies it renders. This works for pure frontend. It breaks for fullstack apps because:

1. **Backend and frontend have different failure modes.** A backend API that returns 500 is invisible to a UI component test. The component renders fine with mock data. The failure only surfaces when the UI tries to call the real API.

2. **Backend testing doesn't require a browser.** API endpoints should be tested with `curl` or a test runner hitting HTTP endpoints, not with Playwright walking a UI. The gate system's reliance on browser-based E2E means backend regressions are only caught when a UI test happens to hit a broken endpoint.

3. **The form → API → DB → response chain crosses multiple workers.** Worker A builds the form. Worker B builds the API route. Worker C sets up the schema. If any link breaks, the chain fails silently — the UI worker sees mock data, the API worker sees valid schema, the DB worker sees valid credentials. Nobody tests the full chain.

### What Needs to Change

1. **Backend services need their own skill and validation loop.** A `backend-testing` skill that:
   - Runs API smoke tests after every API route is built (`curl` / `httpie` / simple test runner)
   - Verifies database connectivity and seed data existence
   - Tests the actual request → response → database round trip, not just "does the endpoint compile"
   - Runs independently of the frontend — no browser needed

2. **Frontend testing should mock the backend.** UI tests should use `page.route()` to intercept API calls with known responses. This decouples frontend verification from backend state. If the frontend works against mocks and the backend passes its own API tests, integration is a small remaining gap.

3. **The gate system needs enforcement.** Currently gates detect regressions but can't block progress. Options:
   - Gate worker files defect subtasks when tests fail (not just the Phase 5b validator)
   - Parent step blocked until all gate tests pass
   - At minimum: the number of failing tests should not increase between gates

4. **Database health should be a continuous prerequisite.** Before any step that touches an API, verify `GET /api/health` returns `{"status":"healthy"}`. If it doesn't, file a defect immediately — don't build 30 more UI components on top of a disconnected database.

---

## What Improved vs v2.1.4

| Area | v2.1.4 | v2.1.6 | Verdict |
|------|--------|--------|---------|
| Human interventions | 2 (step ID bug, verifier bug) | 0 | **Major improvement** |
| Seed data | Missing entirely | Step 2 completed (seed script committed) | **Improved** (though connection issues remain) |
| Integration gates | None | 11 gates, journey.spec.ts grew to 67 tests | **Major improvement** |
| Regression detection | Nothing | Gates 6, 9, 11 caught real regressions | **Working** |
| Regression enforcement | N/A | Zero enforcement — detected but not blocked | **Gap** |
| Defect subtask pipeline | N/A | Working but caused recursive chain | **Mixed** — mechanism works, validator is broken for Kimi |
| Test execution | Mostly aspirational | Gate workers actually ran `npx playwright test` | **Improved** |
| Backend testing | None | None | **Still missing** |
| Validator | N/A | 38 PASS / 0 FAIL — rubber stamp | **Not working** for Kimi vendor |
| Output volume | 32 steps, 40+ components | 47 steps, 83 components, 12 APIs | **Much more ambitious** |
| Demoable end product? | No | **No** — same root problem | **Not improved** |

---

## Recommendations

### Immediate (next goal)

1. **Fix the validator for Kimi workers.** Either parse Kimi's YAML handoff format in `state-handler.ts`, or make the validator spawn a browser worker instead of reasoning-only mode. A 100% PASS rate means the validator doesn't exist.

2. **Gate workers must file defects when regression tests fail.** Don't wait for Phase 5b. If `npx playwright test` shows more failures than the previous gate, the gate worker should call `insertDefectSubtask()` directly.

3. **Add backend smoke tests to gate steps.** Every gate should also run: `curl -s localhost:3000/api/health | jq .status` and verify "healthy". If unhealthy, that's a defect.

### Medium-term (next sprint)

4. **Separate backend and frontend testing skills.** A `backend-testing` skill for API-level validation (no browser). A `frontend-testing` skill for UI-level validation (browser, but with mocked APIs). The current `web-testing` skill conflates both.

5. **Backend-first build order for fullstack goals.** Current order: research → schema → seed → init → UI → UI → UI → API. Better order: research → schema → seed → API endpoints → **API smoke test gate** → UI → UI → UI with API mocks → **integration gate**.

6. **Fix the SelectValue bug pattern.** This is a class of bugs where the custom UI component renders correctly in isolation but doesn't integrate with the form library. The worker built a `Select` component from scratch instead of using shadcn/radix, and the `SelectValue` subcomponent just returns the placeholder. This is exactly the "beautiful pieces, broken whole" failure: the Select looks perfect, works for onClick, but never shows the selected value.

### Strategic

7. **The defect chain proves the pipeline works — but needs guardrails.** The depth-first subtask resolution, the recursive chain detection, the anti-pattern rules in the validator prompt — all of this machinery worked correctly. The problem was the trigger condition: "missing handoff" is not a product defect. Add a hard rule: the validator can only file defects about observable product failures (404, 500, broken navigation, missing data), never about harness telemetry (missing handoffs, missing journey_blocks_added, missing what_connects).

8. **The "demoable" bar hasn't moved.** Two runs, ~26 hours combined, ~100 steps, ~100 commits, 83 components — and you still can't fill out the form and complete a shipment. The system builds impressive breadth (every component, every page, every edge case) but not depth (does the happy path work end-to-end?). The single highest-leverage change: make the **first integration gate** (checkpoint 1) test the full happy path with `curl` against the API, not just "does the page load." If that gate fails, nothing else should build.

---

## Raw Data

- **Work ledger events:** 150 events for this goal in `ledgers/work-ledger.jsonl` (grep `goal-b2b-postal-checkout` + `2026-04-1[12]`)
- **Executive logs:** `ledgers/executive-2026-04-11.log` (defect chain phase), `ledgers/executive-2026-04-12.log` (productive build phase)
- **STEPS.json:** `workspace/completed/b2b-postal-checkout-2026-04-12/STEPS.json` (55 steps)
- **Output:** `/Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-04-11/1775939155064/`
- **Previous retro:** `retro-b2b-postal-checkout.md` (v2.1.4 first run)
- **Plan that created v2.1.6:** `/Users/jackjin/.claude/plans/iterative-roaming-haven.md`
