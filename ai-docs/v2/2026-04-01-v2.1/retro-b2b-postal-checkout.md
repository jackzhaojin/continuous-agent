# Retrospective: B2B Postal Checkout Flow — Longest Autonomous Run

**Date:** 2026-04-06
**Goal:** B2B Postal Checkout Flow (P2)
**Vendor:** Kimi (CLI, stream-json mode)
**Duration:** ~11 hours wall clock (2026-04-05T18:33 → 2026-04-06T05:28 UTC)
**Result:** GOAL_COMPLETED — 32/32 steps, 52 git commits, 217 test cases written

---

## Timeline

| Phase | Time (UTC) | Duration | What happened |
|-------|-----------|----------|---------------|
| Goal promoted | 18:33 | — | Moved from ondeck to in-progress/P2 |
| Breakdown v1 | 18:36 | 3min | LLM splits into 6 steps (too coarse) |
| Steps 1-2 (research + init) | 18:36-18:49 | 13min | Clean, no retries |
| Step 3 (Supabase schema) | 18:49-19:47 | **58min** | 7 attempts, worst step |
| Steps 4-5 (design system + API) | 19:47-20:29 | 42min | 1 retry on API endpoints |
| Step 6 (Step 1 UI) | 20:29-20:53 | 24min | Failed, triggered re-breakdown |
| **Re-breakdown v2** | 21:04 | — | **New 32-step plan** (fine-grained) |
| Steps 1-4 (component build) | 21:04-21:46 | 42min | 3 retries on HazmatForm |
| Step 5 (regression test) | 21:46-22:06 | **20min** | **12 attempts** — step ID mismatch bug |
| *Human intervention* | ~22:06 | — | Fixed step ID bug (v2.1.4 hotfix) |
| Steps 7-14 (pricing + payment) | 00:30-02:06 | 96min | **Zero retries**, 8 steps clean |
| Steps 15-19 (pickup) | 02:06-02:55 | 49min | Zero retries, 5 steps clean |
| Steps 20-22 (review) | 02:55-03:25 | 30min | Zero retries |
| Step 23 (documentation) | 03:25-03:47 | **22min** | **3 failures** → blocked (git_status_clean) |
| *Human intervention* | ~03:53 | — | Fixed verifier, unblocked goal |
| Steps 23-27 (docs + polish) | 03:57-04:29 | 32min | Zero retries post-fix |
| Steps 28-32 (E2E + final) | 04:29-05:28 | 59min | Zero retries |

## By the Numbers

| Metric | Value |
|--------|-------|
| Total steps | 32 (after re-breakdown) |
| Steps completed first try | 24 (75%) |
| Steps needing retries | 8 (25%) |
| Total step attempts | 55 |
| Wasted attempts | 23 (retries that didn't produce new value) |
| Git commits by worker | 52 |
| E2E test cases written | 217 (across 6 spec files) |
| Components built | 40+ across 8 directories |
| Worker turns (estimated) | ~2,000 |
| Human interventions | 2 (step ID bug, verifier bug) |

## What the Worker Built

### Application Structure
```
app/
├── api/            # REST endpoints (shipments, quotes, payments, pickup)
├── shipments/
│   ├── new/        # Step 1: Shipment Details (wizard entry)
│   └── [id]/
│       ├── rates/  # Step 2: Rate Selection
│       └── confirm/ # Step 6: Confirmation
├── layout.tsx      # Root layout with progress nav
└── page.tsx        # Landing / design system demo

components/
├── layout/         # Header, footer, progress bar
├── shipments/      # PresetSelector, PackageType, Dimensions, Weight, Hazmat, MultiPiece
├── pricing/        # PricingCard, PriceBreakdown, PricingGrid, ShipmentSummaryBar
├── payment/        # 5 payment method forms, CostSummary, BillingAddress
├── pickup/         # Calendar, TimeSlot, Location, Equipment, Contact, Notifications, Guidelines
├── review/         # ShipmentSummary, TermsAndConditions, ValidationErrors
├── confirmation/   # SuccessBanner, Documentation, Contact, NextSteps, RecentShipments
├── shared/         # StatusIndicator, FeeBadge
└── ui/             # shadcn primitives (Button, Input, Select, Textarea, etc.)

e2e/
├── step1-shipment-details.spec.ts  (41 tests)
├── step2-rate-selection.spec.ts    (39 tests)
├── step3-payment.spec.ts           (44 tests)
├── step4-pickup.spec.ts            (17 tests)
├── step5-review.spec.ts            (19 tests)
├── step6-confirmation.spec.ts      (57 tests)
└── utils/test-helpers.ts
```

### What Works
- **Step 1 (Shipment Details):** Full wizard with presets, dual address forms, package type selector, dimensions with dimensional weight calc, weight comparison, declared value with insurance, hazmat conditional form, multi-piece, special handling. All interactive.
- **Step 6 (Confirmation):** Rich confirmation page — success banner, reference number with copy + QR code, shipment/pickup/delivery/tracking info, package documentation, contact sections, recent shipments, responsive design.
- **Progress navigation:** 6-step wizard progress bar with completed/active/pending states.
- **Error handling:** Rate loading failures show proper error state with retry + back buttons.
- **Accessibility:** Skip links, ARIA labels, heading hierarchy, keyboard navigation.
- **Responsive:** Mobile, tablet, desktop viewports tested.

### What Doesn't Work (E2E Flow)
- **No connected data flow.** Each step renders independently with mock/hardcoded data. Step 1 creates a form but submitting doesn't persist to Supabase and navigate to Step 2. Going to `/shipments/1/rates` shows "Failed to load shipment" because no shipment with ID 1 exists.
- **Steps 3-4 (Payment, Pickup) have no dedicated routes.** Components exist but aren't wired into page routes. The wizard handles them via React state within `/shipments/new` but the state doesn't persist across navigations.
- **E2E tests are written to individual step specs**, not a connected flow. Step 2 tests include a `createShipmentAndNavigateToRates()` helper that fills Step 1 and submits, but this depends on a working API + Supabase connection.
- **Supabase schema was created** (Step 3, 7 attempts), and `.env.local` has cloud credentials, but the API endpoints return 404/errors for shipment IDs because no seed data exists in the cloud DB.

**In short:** The worker built 40+ polished components and 217 E2E test specs, but it's an assembly of parts — not a working end-to-end application. Each piece works in isolation. The plumbing between steps (form submission → API → DB → next page load) is incomplete.

## Failure Analysis

### Failure 1: Supabase Schema Setup (7 attempts, 58 min)
**Root cause:** Kimi worker tried to run `supabase init` and `supabase db push` — neither works without a local Supabase CLI install or a migration setup. The worker kept trying different approaches (SQL via REST API, Supabase client, direct psql) before finally writing a schema setup script.
**Lesson:** Workers need clearer guidance on Supabase cloud vs local. The worker-base skill should document: "Supabase is cloud-hosted, use the JS client or REST API, not CLI migration tools."

### Failure 2: Regression Step Repeat (12 attempts, step ID bug)
**Root cause:** The `step-regression-1` ID didn't match the `step-{N}` pattern that `updateStepStatus` expected. The step completed successfully each time but the status was never written to STEPS.json, so the executive re-selected it infinitely.
**Fix:** v2.1.4 hotfix — use `step.id` directly instead of generating from step number.
**Lesson:** Custom step IDs from the regression step inserter must be tested against the status update path. This was a framework bug, not a worker bug.

### Failure 3: git_status_clean Verifier (3 attempts + block)
**Root cause:** Worker ran playwright-cli for visual verification, leaving `.playwright-cli/` screenshots and logs uncommitted. The `git_status_clean` verifier saw dirty files and rejected the step. The worker committed its own code but didn't know to commit playwright artifacts.
**Fix:** Added `.playwright-cli/` and `.playwright-mcp/` to `ARTIFACT_DIR_PREFIXES` in `core-verifiers.ts`.
**Lesson:** The verifier's artifact filter needs to evolve as workers use new tools. This is exactly the type of failure that goal-2.1.6 (self-triage) is designed to auto-fix.

### Failure 4: Re-breakdown Trigger (Step 6 UI too large)
**Root cause:** The initial 6-step breakdown had "Build Step 1: Shipment Details UI" as a single step with ~20 components. Kimi couldn't complete it in the allocated turns. After 2 failures, the system re-broke into 32 fine-grained steps.
**Outcome:** This actually worked well. The re-breakdown was the right call — all subsequent steps completed much more reliably with ~1 component per step.
**Lesson:** The auto-breakdown system works. Complex UI goals should start with finer granularity (5-10 components per step max) or the breakdown should be more aggressive from the start.

## Kimi Worker Observations

- **Tool usage:** Correct Kimi tool names throughout (Shell, ReadFile, WriteFile, StrReplaceFile). V2.1.4 vendor adapter working.
- **Skill adoption:** Workers read `jack-git-commit` skill and committed with proper conventional commit format. Workers followed web-testing skill and ran playwright-cli for visual verification.
- **Turn efficiency:** Most build steps completed in 50-90 turns. E2E test steps took 60-80 turns.
- **Commit discipline:** 52 commits across 32 steps — workers committed after each logical change, not just at step end. Good.
- **Weakness — integration:** Kimi builds excellent individual components but doesn't wire them into a working flow. Each step treated its task as isolated. No worker stepped back to ask "does the full flow work?"

## Velocity Analysis

Post re-breakdown, excluding failures:

| Phase | Steps | Time | Rate |
|-------|-------|------|------|
| Component build (steps 7-22) | 16 | 4.5 hours | **3.6 steps/hour** |
| Polish + E2E (steps 23-32) | 10 | 2.5 hours | **4.0 steps/hour** |
| Overall (32 steps) | 32 | ~7 hours productive | **4.6 steps/hour** |

The clean middle run (steps 7-22, zero retries) averaged **one step every 10 minutes**. This is the system's sustainable velocity when there are no infrastructure bugs.

## What the System Did Well

1. **Re-breakdown worked.** The coarse 6-step plan failed, the system automatically re-broke into 32 steps, and completion rate jumped from 50% to 75% first-try.
2. **Skill-based composition worked.** V2.1.4 prompt builder loaded worker-base + web-testing skills correctly for every Kimi spawn. Tool name mappings applied consistently.
3. **Step handoffs worked.** Each step received context from the prior step's handoff file. Workers resumed from existing code without starting over.
4. **Verifier-gated quality.** The git_status_clean verifier caught real issues (uncommitted files). Even though it over-triggered on playwright artifacts, the concept of blocking on dirty state is correct.
5. **Playwright visual testing.** Workers actually ran playwright-cli, took screenshots, clicked elements, and scrolled viewports. Not just token compliance.

## What Needs Improvement

1. **No end-to-end data flow.** 32 steps of component building without a single "verify the full user journey works" gate. Need a mid-run integration test step (not just component verification).
2. **E2E tests are aspirational.** 217 test cases written, but they require a running Supabase with seed data to pass. The worker wrote tests against an API that doesn't exist yet. Tests should be runnable at write time.
3. **Seed data gap.** Supabase credentials exist, schema was set up, but no test data was seeded. The confirmation page uses hardcoded mock data, and the rates page fails because no shipments exist.
4. **Step isolation.** Each step operates in a vacuum. Step 15 (PickupCalendar) doesn't verify it integrates with Step 14 (CostSummary). Need integration verification between steps, not just within.
5. **Self-healing gap.** Two human interventions were needed for framework bugs. Goal-2.1.6 addresses this.

## E2E Test Deep Dive

### Did the Worker Actually Run Tests?

**Yes.** The ledger shows the Kimi worker ran `npx playwright test` multiple times:

1. **Step 28 (E2E tests for Steps 1-3):** Worker ran step1 tests, initially got 17 passed / 24 failed. Fixed selectors, got partial passes. Committed with note "tests provide a good foundation but need selector adjustments."
2. **Step 29 (E2E tests for Steps 4-6):** Worker ran tests for steps 4-6 separately. After several iterations of fixing, reported **93 tests passed in 30.6s**. This was steps 4+5+6 only.
3. **Step 30 (Full journey test):** Worker tried to run full suite, it timed out. Fell back to playwright-cli manual testing — opened pages, took snapshots, navigated routes. Noted payment page returns 404.
4. **Step 31 (Final validation):** Worker ran build, typecheck (failed with pre-existing TS errors), and did final playwright-cli spot checks.

### What the Tests Actually Cover

| File | Tests | What They Test | Can They Pass Today? |
|------|-------|----------------|---------------------|
| step1 (41 tests) | Form rendering, presets, validation, package types, dimensions, hazmat | Page loads, elements visible, basic interaction | **Partial** — 17/41 passed when worker ran them. Selector mismatches on the rest. |
| step2 (39 tests) | Rate loading, filtering, sorting, quote selection | Depends on Step 1 creating real shipment + API returning quotes | **No** — requires working Supabase API with seed data |
| step3 (44 tests) | 5 payment method forms, billing address, cost summary | Tests 5 different payment flows | **No** — payment page returns 404 (noted in file header) |
| step4 (17 tests) | Pickup calendar, time slots, location, contacts | Actually tests `/confirm` page, not a pickup page | **Yes** — tests hardcoded confirmation page content |
| step5 (19 tests) | Confirmation number, shipment summary, navigation | Also tests `/confirm` page | **Yes** — tests hardcoded confirmation page content |
| step6 (57 tests) | Full confirmation page, QR code, tracking, docs, responsive | Thorough confirmation page testing | **Yes** — tests hardcoded confirmation page content |

**Summary:** Steps 4-6 (93 tests) pass because they test the confirmation page which renders with hardcoded mock data. Steps 1-3 (124 tests) mostly fail — step 1 has selector issues, step 2 needs live API, step 3's page doesn't exist.

### Test Architecture Problems

1. **No mocks or route interception.** Zero uses of `page.route()` to intercept API calls. Every test hits real APIs. This means tests can't run without a live backend.

2. **Hardcoded test data.** Steps 4-6 assert specific values:
   - Confirmation: `B2B-2024-XK9P7M`
   - Cost: `$284.50`
   - Carrier: `FedEx Freight`
   - Account Manager: `Michael Chen`

   These values are baked into the confirmation page component, not from a database. Tests pass because they're testing hardcoded UI, not actual data flow.

3. **Steps 4-5 don't test their own pages.** There are no `/pickup` or `/review` routes. Steps 4 and 5 tests navigate to `/confirm` and test subsets of the confirmation page. The wizard handles steps 3-5 via React state within `/shipments/new`, but that state doesn't persist across page navigation.

4. **Step 2 helper does full flow.** `createShipmentAndNavigateToRates()` fills the entire Step 1 form and submits — but this depends on the form → API → DB → redirect chain working, which it doesn't without seed data.

5. **No cleanup.** Tests don't clean up created shipments. If Step 1 tests ever do create real records, they accumulate.

### The Real Test Results

From the worker's actual runs:
- **Step 1:** 17 passed, 24 failed (selector mismatches — tests written to wrong element names)
- **Steps 4-6:** 93 passed (all hardcoded confirmation page content)
- **Steps 2-3:** Never successfully ran (API dependency, page 404)
- **Full suite:** Timed out, worker gave up and fell back to manual playwright-cli testing

**The 217 test cases are aspirational specs, not passing tests.** About 93 (43%) actually pass, and those 93 only validate a single page with hardcoded data.

---

## The Core Problem: No Sprint Demo Gate

The system completed 32 steps, marked the goal GOAL_COMPLETED, and moved on — but nobody ever asked **"does the full user journey work?"** The verifiers check:
- git status clean ✓
- files exist ✓  
- node build passes ✓ (advisory)
- lint passes ✓ (advisory)

But none of them check:
- Can a user fill Step 1 and get to Step 2? ✗
- Does the API create a real shipment? ✗
- Do the E2E tests pass? ✗
- Is there test data in Supabase? ✗

This is the "building broke on broke" problem. Each step builds on the previous step's output, but nothing verifies the integration. By step 32, you have 40+ polished components that don't connect.

### What Needs to Change

**1. E2E-first, not E2E-last.** The E2E test steps were steps 28-30 out of 32 — the very end. By the time the worker writes tests, it's too late to fix integration issues. E2E verification should happen after every major phase:
- After Step 1 UI is built → verify form submits and creates a shipment
- After Step 2 is built → verify full Step 1→2 flow
- After all UI is done → verify complete journey

**2. Seed data is infrastructure, not a step.** The Supabase schema was set up (step 3, 7 retries) but no seed data was created. For fullstack projects, the executive breakdown should identify "populate test data" as a prerequisite step that blocks all UI work. Without data, API endpoints return empty/404 and the worker just builds more UI without noticing.

**3. The verifier needs an E2E gate.** A new verifier for web projects: `e2e_smoke_test`. After each step, run a minimal smoke test:
- Start dev server
- Navigate to the main route
- Verify no JS errors
- Submit the primary form
- Verify API response

This is not unit testing (waste of time for autonomous workers). This is scoped E2E: verify the thing you just built actually works in the running app.

**4. "Definition of Done" must include working flow.** The PROMPT.md for this goal says nothing about data flow or API integration. It just describes UI components. The executive breakdown should add integration requirements: "Step 1 is not done until form submission creates a record in Supabase that Step 2 can load."

---

## Recommendations for Future Goals

1. **Sprint demo gate every 8 steps.** Insert a verification-only step that tests the full user journey so far — not component rendering, but actual data flow. If it fails, fix it before building more.
2. **Seed data is Step 1.** For any project with a database, the first step must be: create schema + seed test data + verify API returns expected data. Block all UI work until this passes.
3. **E2E tests must pass when written.** If a test depends on an API, either mock it with `page.route()` or ensure the API works first. Writing tests that can't run is documentation, not testing.
4. **Goal PROMPT.md must declare data requirements.** "This goal requires: Supabase with seeded data, working REST API, dev server." The system should verify prerequisites before starting UI work.
5. **Finer initial breakdown for UI goals.** Don't start with 6 steps and wait for re-breakdown. For high-complexity UI, start with 20+ steps immediately.
6. **Scoped E2E > unit tests.** Don't write unit tests for autonomous worker output. Write focused E2E tests that verify "the thing I just built works in the browser." This is the only testing that catches integration failures.
7. **Executive must understand fullstack.** When breaking down a "Next.js + Supabase" goal, the executive should know: schema → seed data → API endpoints → verify API → UI → verify UI → integration test. Not: research → init → schema → design system → API → UI → UI → UI...
