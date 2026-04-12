# Harness v2.2 — Three-Vendor Comparison (2026-04-12)

First live run of the generic harness across all three vendors: Kimi K2.5, OpenAI Codex, and Claude Sonnet 4.6. Target repo: `harness-v2-test` (separate branches per vendor).

## Test Setup

| | Kimi K2.5 | Codex | Claude Sonnet 4.6 |
|---|---|---|---|
| **Branch** | `kimi-k2-5-test` | `codex-test` | `claude-sonnet-test` |
| **Prompt** | Todo List App | Counter App | Counter App |
| **Auth** | `kimi login` (CLI) | `~/.codex/auth.json` (CLI) | `CLAUDE_CODE_OAUTH_TOKEN` (OAuth) |
| **Harness** | `generic` | `generic` | `generic` |
| **Mode** | `adopt` (first run) | `adopt` | `adopt` |

> Note: Kimi ran a different prompt (todo list) than Codex/Claude (counter app). This was unintentional — future comparisons should use identical prompts for fair evaluation.

## Results Summary

| | Kimi K2.5 | Codex | Claude Sonnet 4.6 |
|---|---|---|---|
| **Outcome** | PASS (3/3 tasks) | PASS (4/4 tasks) | PASS (2/2 tasks) |
| **Total time** | ~35 min | ~47 min | ~24 min |
| **Tasks created** | 3 | 3 + subtask 2.1 | 2 |
| **SPEC phase** | ~4 min | ~5 min | ~2.5 min |
| **3-file structure** | No (single file) | Yes | Yes |
| **E2E test count** | 160 (5 browsers) | 12 (1 browser) | 10 |
| **Validation quality** | Mixed | Excellent | Excellent |
| **Constitution violations** | Yes (sw.js) | None | None |
| **Transient errors** | Token limit (retry OK) | None | None |

## Phase Timing Breakdown

### SPEC Phase (4 agents: WHY → WHAT → HOW → WHEN)

| Agent | Kimi K2.5 | Codex | Claude Sonnet 4.6 |
|-------|-----------|-------|---------------------|
| spec-why | 40s | 27s | 24s |
| spec-what | 45s | 47s | 40s |
| spec-how | 98s | 112s | 50s |
| spec-when | 62s | 103s | 36s |
| **Total** | **~245s** | **~289s** | **~150s** |

### Per-Task Phases (Task 1)

| Phase | Kimi K2.5 | Codex | Claude Sonnet 4.6 |
|-------|-----------|-------|---------------------|
| Research | 53s | 211s | 260s |
| Build | 120s | 334s | 242s |
| Validate | 78s | 130s | 118s |

## Key Findings

### 1. Harness Bug Fixed: Output Capture (P0)

**Bug:** `harness-agent-runner.ts:95` — the `result` message from Kimi/Codex contained a summary line (e.g., "Kimi CLI exited with code 0") that **overwrote** all accumulated assistant text. This destroyed both the research output content and the handoff JSON block.

**Fix:** Only use result text if no assistant text was accumulated. Handoff extraction and output capture now work correctly for all vendors.

**Commit:** `fix(harness): prevent overwriting output with result text when assistant text is present`

### 2. Output Noise Filter (P1)

**Bug:** `[tool_call]` and `[tool_result]` prefixed lines from Kimi/Codex normalizers polluted persisted files (research.md, build_attempt_N.md).

**Fix:** `cleanAgentOutput()` strips tool traffic lines after handoff extraction. Raw transcript preserved in `result.messages` for logging.

**Commit:** `fix(harness): strip tool-call noise from persisted agent output`

### 3. Codex CLI Auth (P1)

**Bug:** Harness CLI rejected Codex vendor with "auth invalid" because `validateAuth()` only checks env vars (`CODEX_API_KEY`/`OPENAI_API_KEY`), not the CLI login file at `~/.codex/auth.json`.

**Fix:** Harness CLI (`cli.ts`) now falls back to checking `~/.codex/auth.json` for Codex vendor before rejecting.

### 4. Vendor Auth Test (P2)

Added `tests/e2e/harnesses/vendor-auth-check.e2e.ts` — validates all three vendors' credentials are in place without making API calls. Checks Claude OAuth token, Codex auth.json, and Kimi CLI login. Added to `npm run test:harness` suite (114 tests total).

## Vendor Behavioral Observations

### Kimi K2.5
- **Instruction following:** Weakest. Overrode PROMPT.md's 3-file requirement with single-file architecture. HOW agent invented a "Single-file deployability" principle not in the requirements.
- **Constitution adherence:** Added `sw.js` (service worker) despite CONSTITUTION.md explicitly stating "No Progressive Web App features."
- **Testing approach:** Most test-heavy — 160 Playwright CLI tests across 5 browsers (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari).
- **Validation quality:** Tasks 1-2 excellent (per-criterion with evidence), Task 3 weak (hand-wavy cross-browser claims).
- **Transient error:** Hit `model token limit: 0 (requested: 18589)` on Task 3 build — confirmed transient via ad-hoc testing with 20K token prompt. Retry succeeded.
- **Glob pattern issue:** Repeatedly used `**/*` patterns which Kimi's sandbox blocks. Recovered each time.

### OpenAI Codex
- **Instruction following:** Strong. Created all 3 separate files as specified.
- **Task decomposition:** Most granular — created subtask 2.1 for history tracking, promoted parent task on completion.
- **Validation quality:** Excellent — line-level code references (e.g., `[app.js](/path:96)`), specific Playwright probe results.
- **Speed:** Slowest overall (~47 min). Research phases consistently 168-212s.
- **Constitution adherence:** No violations.
- **Testing approach:** 12 Playwright tests, single browser.

### Claude Sonnet 4.6
- **Instruction following:** Strong. Created all 3 separate files.
- **Efficiency:** Fastest overall (~24 min). Only created 2 tasks vs 3-4 for others.
- **SPEC quality:** Fastest and most focused spec generation (~2.5 min total).
- **Validation quality:** Excellent — computed CSS color verification (e.g., `rgb(45, 106, 79)`), centering tolerance checks, offline-capability verification.
- **Build pattern:** Long research (260-431s) then fast build (102-242s) — "think more, code less."
- **Constitution adherence:** No violations.
- **Testing approach:** 10 Playwright tests.

## Visual Assessment (Headed Playwright CLI)

Each vendor's output was tested interactively in a headed Chrome browser using `playwright-cli`. All three apps were fully functional — every feature specified in the PROMPT.md worked correctly.

### Kimi K2.5 — Todo List App

- **Design:** Clean card layout with purple accent color, rounded input field and Add button, subtle shadow
- **Empty state:** "No todos yet / Add a todo above to get started" — good onboarding UX
- **Completion UX:** Checkbox turns purple when checked, text gets strikethrough + muted gray, background highlights the completed row
- **Delete:** Red x button, right-aligned, removes instantly
- **Layout:** Centered card, light purple-gray page background (`#f8f9ff`)
- **Verdict:** Attractive and functional. Would pass a design review for an internal tool. The single-file architecture is invisible to the user but violates the PROMPT.md spec.

### Codex — Counter App

- **Design:** Most visually polished of the three. Gradient page background (white to soft green), card with shadow, header subtitle ("A direct-open starter with clear controls and room for action history"), "Ready" status badge
- **Negative/positive distinction:** Background color changes — red band behind negative counts, green behind positive. Bold, unmistakable.
- **Buttons:** Green "Increment", dark blue "Decrement", gray "Reset" — all with rounded pill shape, good contrast
- **History:** Timestamped entries ("Decremented to -1 / 12:41:45 PM"), reverse chronological, clean row separators
- **Keyboard shortcuts:** ArrowUp/ArrowDown/R all functional, history logs keyboard actions identically to button clicks
- **Verdict:** Best visual design. Has the most "shipped product" feel — could be a demo page on a portfolio site.

### Claude Sonnet 4.6 — Counter App

- **Design:** Minimalist card, vertically centered on page, "COUNTER" in small caps, large bold count number
- **Negative/positive distinction:** Text color changes — deep red for negative, dark green for positive. Subtler than Codex's background approach but equally clear.
- **Buttons:** Green/red/gray with proper color-coding, consistent sizing, slight rounding
- **History:** Clean format with arrow notation (`22:43:17 — Decrement → -1`), thin left border accent, alternating subtle row backgrounds
- **Keyboard shortcuts:** ArrowUp/ArrowDown/R all functional
- **Verdict:** Most elegant and readable. The history format (`Action → result`) is the clearest of the three. Less decorative than Codex but more intentional — nothing wasted.

### Design Rankings

| Category | Winner | Notes |
|----------|--------|-------|
| **Visual polish** | Codex | Gradient background, status badge, subtitle, most "complete" feel |
| **UX clarity** | Claude Sonnet 4.6 | Cleanest history format, best typography, nothing unnecessary |
| **Feature completeness** | Tie | All three deliver every specified feature |
| **Negative/positive distinction** | Codex | Background color change is bolder than text color change |
| **Code quality** | Claude Sonnet 4.6 | Smallest files (concise), 3-file structure, IIFE pattern |
| **Test coverage** | Kimi K2.5 | 160 tests across 5 browsers (but single-file architecture) |

## Recommendations

1. **Same prompt for comparisons** — Future vendor comparisons should use identical PROMPT.md for fair evaluation.
2. **Constitution enforcement** — The build/validate agents should cross-check output against CONSTITUTION.md constraints. Kimi's sw.js violation went uncaught.
3. **Prompt budget guards** — While the token limit error was transient, adding prompt size logging/warnings before sending would help diagnose similar issues.
4. **Test suite (passing):** 114 tests across unit, mock-e2e, Kimi validation, and vendor auth check — all green.
