# Retrospective: B2B Postal Checkout Flow — v2.1.6 Re-run

**Date:** 2026-04-12
**Goal:** B2B Postal Checkout Flow (P2) — second run with v2.1.6 defect-subtask pipeline
**Vendor:** Kimi K2.5 (CLI, stream-json mode)
**Duration:** ~15 hours wall clock (2026-04-11T18:15 → 2026-04-12T09:05 UTC)
**Result:** GOAL_COMPLETED — 55 steps in final STEPS.json (47 build + 8 defect subtasks), 60 commits, 213 E2E test cases, 83 components, 12 API routes, ~41,600 lines of TS/TSX

---

## What Went Well

### 1. Zero human interventions

The v2.1.4 run needed 2 hotfixes (step ID bug, verifier bug). This run completed 55 steps entirely autonomously. The framework held up over ~15 hours without crashing, stalling, or needing a human touch.

### 2. Prerequisite detection worked

Steps 1-2 were auto-inserted as schema setup + seed data, correctly identified from the goal's Supabase/database keywords. This was the #1 recommendation from the first retro. Seed data committed at `2971fdcb`.

### 3. Integration gates fired reliably

11 gates inserted at regular cadence throughout the build. Every gate completed. Gate workers actually ran `npx playwright test` (not just aspirational test files). `journey.spec.ts` grew from 7 → 67 tests across 11 gates — the append-only journey file working as designed.

### 4. Gates caught real regressions

- **Gate 6:** Found missing `current_step` column in shipments table
- **Gate 9:** Detected 17/45 test failures (pricing→payment navigation broken)
- **Gate 11:** Fixed 24 broken selectors after the accessibility step changed form structure, added 11 new tests

### 5. Depth-first subtask resolution works mechanically

When the defect chain resolved, the system correctly walked bottom-up: step-1.1.2.1.1.1.1.1 → 1.1.2.1.1.1.1 → ... → 1.1. The `selectNextExecutableStep` depth-first algorithm is correct.

### 6. Worker self-correction

Step 21 hit a 300s timeout running tests with `--project=chromium` that didn't match the playwright config. The Kimi worker read the config and self-corrected without needing a retry. Workers also produced proper conventional commits throughout.

### 7. Build quality and ambition

83 components, 12 API routes, 9 pages, responsive layout, WCAG 2.1 AA accessibility, loading states, error boundaries, 5 B2B payment methods. Visually the app looks professional. Velocity: 4.5 steps/hour during the clean build phase.

### 8. Discord notifications provided async visibility

The identity system's Discord webhook integration worked throughout the ~15 hour run (38 notifications logged), posting step completions and gate results. This gave async visibility into progress without needing to watch logs — you could check Discord on your phone and see the run advancing overnight.

### 9. Notion reporting operational

80 Notion-related log entries — milestones were being reported to the Notion dashboard throughout the run. Combined with Discord, this gave two independent async visibility channels.

### 10. Ledger and contract tracking comprehensive

- 150 work-ledger events tracked the full execution
- 127 contract events in CONTRACTS.jsonl with proper start/complete pairs
- 559-line PROGRESS_LOG.md with human-readable timeline
- 38 worker logs (60-109KB each) with turn-by-turn execution data
- Zero idle or unhealthy sleeps — the executive was productive the entire run

### 11. PROMPT.md input quality was high

The goal PROMPT.md had thorough `definition_of_done_journey`, explicit `data_requirements` (dedicated `postal_v2` schema, seed data requirements, idempotent seed script), `integration_gate_cadence: 3`, and clear vendor justification. The input was not the problem — the execution pipeline couldn't enforce what the input specified.

### 12. Comparison vs v2.1.4

| Area | v2.1.4 | v2.1.6 | Verdict |
|------|--------|--------|---------|
| Human interventions | 2 | 0 | **Major improvement** |
| Seed data | Missing entirely | Committed | **Improved** |
| Integration gates | 0 | 11 with real test execution | **Major improvement** |
| Regression detection | None | Gates 6, 9, 11 caught regressions | **Working** |
| Test execution | Aspirational | Workers ran `npx playwright test` | **Improved** |
| Output volume | 32 steps, 40+ components | 47 steps, 83 components | **Much more ambitious** |

---

## What Did NOT Work — Demoable Product

**Bottom line: two runs, ~26 hours combined, ~100 steps, ~100 commits, 83 components — and you still can't fill out the form and complete a shipment.**

### Demo walkthrough findings (playwright-cli --headed)

- **Step 1 (Details):** Form fills out, but Country/State dropdowns never show selected value (always "Select country"). Form submits anyway because React state has the value — the UI just doesn't display it.
- **Step 2 (Rates):** 15 rates display, but API calls (`/api/quote`) return 500. The page falls back to mock data. Looks like it works; doesn't.
- **Step 3 (Payment):** 5 payment methods render. PO form fills but validation fails — the PO form uses standalone `useState` not connected to react-hook-form, so filled values don't reach the submit handler.
- **Step 4 (Pickup):** "Failed to load pickup availability" — API 500. Page is stuck.
- **Step 5 (Review):** Loads but data is incomplete.
- **Step 6 (Confirm):** Loads with hardcoded mock data.

### Root causes

1. **`/api/health` returns `database: disconnected`** — Supabase credentials exist, schema was set up, seed data was committed, but the API routes can't reach the database at runtime.
2. **API request schema mismatch** — POST `/api/shipments` expects nested objects (`origin.line1`, `destination.city`) but the form sends flat fields (`originLine1`, `destinationCity`).
3. **SelectValue component bug** — `components/ui/select.tsx` line 206: `SelectValue` returns `<>{placeholder}</>` unconditionally. Never reads `value` from context. Every combobox in the app is affected.
4. **Duplicate routes** — Workers built both `/rates` and `/pricing`, both `/confirm` and `/confirmation`. No coordination between steps.

---

## MUST FIX: Harness / Executive Code

These are bugs in the continuous-agent infrastructure that must be fixed in code before the next run.

### H1. Kimi handoff parser is broken (CRITICAL)

**File:** `src/deterministic/state-handler.ts` → `parseStructuredHandoffFromLog()`

**Bug:** The parser uses a regex (`/```ya?ml\s*\n([\s\S]*?)\n```/gi`) to find YAML blocks in worker logs. This works for Claude Agent SDK logs (plain text). Kimi CLI logs wrap output in JSON `[MSG]` lines — the YAML fences are inside escaped JSON strings and the regex can't match.

**Evidence:** Worker log `contract-1775980744690` (step-44) contains a full structured handoff (`what_i_built: "Added 11 new E2E test blocks..."`) but every executive handoff file says "_Worker did not produce a structured handoff block._"

**Impact:** Phase 5b validator sees "NO STRUCTURED HANDOFF" for every step → rubber-stamps PASS. Prompt builder can't inject prior step context. The entire handoff chain is broken for Kimi vendor.

**Fix:** JSON-parse `[MSG]` lines first, extract `content[].text` field, then search for YAML fences in the extracted text. Vendor-specific log format handling.

### H2. Defect subtask pipeline never fired for real product defects (CRITICAL)

**Bug:** All 8 defect subtasks were filed against step-1 for "missing handoff" — a false positive caused by H1. Zero defects were filed during the actual build phase (steps 2-46). The intended pattern (step 17 has defect → 17.1 runs before 18) was never exercised.

**Evidence:** STEPS.json shows all defect subtasks are children of `step-1`:
```
step-1 → step-1.1 → step-1.1.1
                   → step-1.1.2 → step-1.1.2.1 → ... (8 levels deep)
```
Zero subtasks parented to any step after step-1.

**Why it didn't fire:** The validator (the only entity that can file defects) rubber-stamped everything PASS because of H1. Gate workers found regressions (Gate 9: 17 test failures) but gates don't have authority to file defect subtasks.

**Fix:** Two changes needed:
1. Fix H1 so the validator can actually see handoff evidence
2. Give gate workers authority to file defect subtasks when `npx playwright test` shows more failures than the previous gate recorded

### H3. Gates detect regressions but don't enforce them

**Bug:** Gate 9 found 17/45 test failures (pricing→payment navigation broken). The system continued building 8 more steps. The regression was never fixed. At completion, ~26/67 journey tests were still failing.

**Impact:** Gates are expensive (each is a full worker spawn + test run) but toothless. They document failures without blocking progress.

**Fix:** Gate step completion should be gated on "test failure count did not increase since last gate." If it increased, the gate worker must either fix the regressions or file a defect subtask. Don't proceed to the next build step with a known regression growing.

### H4. Recursive defect chain needs a depth limit

**Bug:** The validator filed defects about defects about defects, recursing to depth `step-1.1.2.1.1.1.1.1` (8 levels) over 30 attempts and 3h 50min.

**Fix applied mid-run:** Validator prompt updated to never file defects about "missing handoff." But this is a prompt-level band-aid. Add a hard depth limit in `insertDefectSubtask()` — max 2-3 levels. If a defect subtask itself fails, escalate to `needs-you.md` instead of recursing.

### H5. 5 re-breakdowns wasted ~2 hours

**Bug:** The defect chain caused failure thresholds that triggered re-breakdowns. Each generated a fresh step list (70→71→47→30→47), re-running research and init steps.

**Fix:** Re-breakdown should preserve completed steps. If steps 0-2 are complete and step 3 fails, re-breakdown should only regenerate steps 3+, not start over from scratch.

---

### H6. Worker log truncates AI output to 500 chars (LOW PRIORITY)

**File:** `src/agentic/execution/worker-spawner.ts` line 764

**Bug:** `logger.log(`[MSG] type=${msg.type} ${JSON.stringify(msg.raw).slice(0, 500)}`);` — the raw message JSON is truncated to 500 characters. AI reasoning (which can be 5-10KB), tool call arguments (200 chars), and tool results (500 chars via kimi-cli-provider.ts) are all cut off.

**Impact:** When debugging a step failure, you can't see what the AI actually said or what tool output it received. The worker logs look comprehensive (60-109KB, 92+ MSG lines per log) but each MSG line is a stub.

**Fix:** Remove the `.slice(0, 500)` from the log line. Optionally write full raw JSON to a separate `.jsonl` file if log size is a concern. The `msg.text` field (the normalized summary) can stay as the primary log line, but `msg.raw` should be fully preserved somewhere for debugging.

---

## MUST FIX: Goal Input / Skills / Prompts

These are changes to how goals are defined and how workers are prompted — not infrastructure bugs.

### I0. The prompt packet needs richer prior-step context (input quality)

The PROMPT.md itself was excellent (`definition_of_done_journey`, `data_requirements`, `integration_gate_cadence`). But the full input packet each worker receives has gaps:

**What each worker gets today:**
1. Step title + description from STEPS.json ✓
2. Previous step handoff file — but every one says "_Worker did not produce a structured handoff block_" (H1) ✗
3. `definition_of_done_journey` injected verbatim ✓
4. Worker-base and web-testing skills ✓
5. CLAUDE.md with monorepo rules ✓
6. `data_requirements` referenced but not prominently placed — workers may not read it ⚠️

**What's missing:**
- **No API contract/schema context.** Each worker rebuilds its mental model of what endpoints exist, what shapes they return, what the DB schema looks like. The prompt should inject a compact API surface summary (routes + request/response types) extracted from the codebase.
- **No "current state of journey tests" context.** The worker doesn't know how many journey tests pass or fail. Injecting `npx playwright test --list` output or the last gate's test count would let the worker know what to protect.
- **Prior step handoff is useless.** Because of H1, every step sees "_no structured handoff_" — even though the prior worker DID produce one. The worker has to `git log` and `ls` to figure out what was built. This wastes 5-10 turns per step.
- **No explicit API health check instruction.** The prompt says "verify data persists across screens" but doesn't say "first run `curl localhost:3000/api/health` — if database is disconnected, stop and file a defect." Workers happily build UI on a dead backend.
- **`data_requirements` should be in the constraints section**, not just in PROMPT.md frontmatter. Workers see constraints prominently; they may skim the journey definition.

**Fix — enrich `prompt-builder.ts`:**
1. Extract and inject a compact API surface from `app/api/**/route.ts` (route, methods, key types)
2. Inject last gate's test pass/fail count
3. Inject `curl localhost:3000/api/health` result if the dev server is running
4. Move `data_requirements` into the Constraints section, not just the journey definition
5. Fix H1 so the prior step handoff actually has content

### I1. Backend and frontend need separate test loops

**Problem:** The pipeline treats the whole app as one thing. Backend APIs returning 500 is invisible to UI tests that fall back to mock data. The form → API → DB chain crosses multiple workers and nobody tests the full chain.

**Fix — new `backend-testing` skill:**
- After every API route is built, run `curl` smoke tests against the running dev server
- Verify `GET /api/health` returns `status: healthy` at every gate
- Test actual HTTP request → response → database round trips, no browser needed
- If `/api/health` returns unhealthy, file a defect immediately — don't build 30 more UI components on a disconnected database

**Fix — frontend testing should mock the backend:**
- UI E2E tests should use `page.route()` to intercept API calls with known responses
- Decouples frontend verification from backend state
- Current `web-testing` skill conflates both — split into `backend-testing` and `frontend-testing`

### I2. Build order should be backend-first for fullstack goals

**Current order:** research → schema → seed → init → UI → UI → UI → API (APIs built at steps 36-38, after all UI)

**Better order:** research → schema → seed → API endpoints → **API smoke test gate** → UI with mocked APIs → **integration gate with real APIs**

The seed data step ran early (step 2) but API endpoints weren't built until step 36. By then, 30+ UI components were built against mock data that doesn't match the real API response shapes.

### I3. `definition_of_done_journey` needs to include API verification

**Current:** `"Fill shipment form → submit → rates page loads quote → select → payment → confirm → reference number displayed"`

**Missing:** No mention of backend verification. Add: `"API health check returns healthy. POST /api/shipments creates a record. GET /api/shipments/:id returns it. Full form submit persists to Supabase."`

### I4. Workers reinvent UI components instead of using libraries

The `Select` component was built from scratch (326 lines) instead of using shadcn/radix. The `SelectValue` subcomponent has a bug (always shows placeholder). This is the "beautiful pieces, broken whole" pattern at the component level.

**Fix — add to `worker-base` or `web-testing` skill:** "Use shadcn/ui or radix primitives for form controls. Do not build custom Select, Combobox, DatePicker, etc. from scratch. Custom components are the #1 source of integration bugs."

---

## Detailed Findings

### Gate Results

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

### UI Pages Built (9 total)

| # | Route | Status |
|---|-------|--------|
| - | `/` (Home) | Works — landing page with CTA |
| 1 | `/shipments/new` (Details) | Works — full form with presets, dual address, package config, special handling |
| 2 | `/shipments/[id]/rates` | Displays 15 mock rates — API calls return 500, falls back to mocks |
| 2b | `/shipments/[id]/pricing` | Duplicate of rates (different workers built both) |
| 3 | `/shipments/[id]/payment` | 5 B2B payment methods, billing — validation broken (PO form not connected to react-hook-form) |
| 4 | `/shipments/[id]/pickup` | Broken — "Failed to load pickup availability" (API 500) |
| 5 | `/shipments/[id]/review` | Loads but data incomplete |
| 6 | `/shipments/[id]/confirm` | Loads with hardcoded mock data |
| 6b | `/shipments/[id]/confirmation` | Duplicate of confirm |

### Handoff Pipeline State

- **Executive handoff files:** 47 exist in `workspace/completed/b2b-postal-checkout-2026-04-12/` — ALL say "Worker did not produce a structured handoff block" (parser bug H1)
- **Worker-written handoffs:** ~15 of 47 workers also wrote their own files to the project's `ai-docs/` directory — steps 0, 1, 1.1.2, 2, 6, 42, 48, 50-53. Most workers didn't.
- **STEPS.json handoff field:** Empty for every step (never populated due to H1)
- **Phase 5b validator:** 38 calls, 38 PASS, 0 FAIL — total rubber stamp

### Worker (Kimi K2.5) Observations

- Build quality high — 83 components, responsive, accessible, proper error boundaries
- Workers ran real tests — `npx playwright test` at gates, `playwright-cli` for visual verification
- Self-corrected on config mismatches (step 21 timeout → read config → fixed)
- Proper conventional commits throughout (60 commits)
- Structured handoffs produced in YAML but not parseable by executive (H1)

---

## Timeline

| Phase | Time (UTC) | Duration | What happened |
|-------|-----------|----------|---------------|
| Goal start + breakdown | 18:15 | — | 70-step plan generated |
| Step 0-1 (research + init) | 18:15–18:28 | 13min | Research completed, init started |
| **Recursive defect chain** | **18:28–22:18** | **3h 50min** | Validator filed defects about missing handoffs, spawning 8-level recursive chain (30 attempts, 5 re-breakdowns) |
| **Schema + seed data** | **22:40–22:51** | **11min** | Steps 1-2: Supabase schema + seed data — clean |
| **Core build phase** | **22:55–06:06** | **7h 11min** | Steps 4-34: layout, forms, APIs, all 6 wizard pages. 11 gates interspersed. |
| **Extended build** | **06:06–08:45** | **2h 39min** | Steps 35-44: CRUD endpoints, search, draft/resume, responsive, a11y, E2E tests |
| Final polish | 08:45–09:05 | 20min | Steps 45-46: bug fixes, cleanup, documentation |
| **GOAL_COMPLETED** | **09:05** | — | All 55 steps marked complete |

**Productive build time:** ~10h 25min | **Defect chain waste:** ~3h 50min (26%)

---

## By the Numbers

| Metric | v2.1.6 (this run) | v2.1.4 (first run) |
|--------|-------------------|---------------------|
| Total steps | 55 (47 build + 8 defect) | 32 |
| Step attempts | 84 | 55 |
| Git commits | 60 | 52 |
| Components built | 83 | 40+ |
| API routes | 12 | ~5 |
| E2E test cases | 213 | 217 |
| Lines of code | ~41,600 | ~20,000 (est) |
| Integration gates | 11 | 0 |
| Human interventions | 0 | 2 |
| Phase 5b validator calls | 38 PASS / 0 FAIL | N/A |
| Defect subtasks filed | 8 (all false positives on step-1) | 0 |
| Defects filed for real product bugs | **0** | 0 |
| Demoable end-to-end? | **No** | No |

---

## Raw Data

- **Work ledger:** 150 events — `grep "goal-b2b-postal-checkout" ledgers/work-ledger.jsonl | grep "2026-04-1[12]"`
- **Executive logs:** `ledgers/executive-2026-04-11.log` (defect chain), `ledgers/executive-2026-04-12.log` (build phase)
- **STEPS.json:** `workspace/completed/b2b-postal-checkout-2026-04-12/STEPS.json` (55 steps)
- **Handoff files:** `workspace/completed/b2b-postal-checkout-2026-04-12/step-*-handoff.md` (47 files, all say "no structured handoff" due to H1)
- **Project output:** `/Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-04-11/1775939155064/`
- **Previous retro:** `retro-b2b-postal-checkout.md` (v2.1.4 first run)
- **Plan:** `/Users/jackjin/.claude/plans/iterative-roaming-haven.md`
