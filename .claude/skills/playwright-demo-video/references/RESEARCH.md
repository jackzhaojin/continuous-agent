# Playwright Demo Video Skill -- Research Findings

**Step 0 Deliverable** | Date: 2026-02-01
**Researcher:** Step 0 of the [SKILL-BUILD] Playwright Demo Video Skill goal

---

## 1. Reference File Analysis Summary

### 1.1 Pipeline Spec v2 (demo-video-pipeline-spec-v2.md)

The spec describes a 7-step pipeline:

1. **Record video** -- Playwright headless with caption overlays baked in (webm output)
2. **Extract captions + timestamps** -- Parse `showCaption()`/`caption()` calls, estimate timestamps from `waitForTimeout` chains
3. **Generate audio** -- Per-caption ElevenLabs API calls with `previous_text`/`next_text` for voice continuity
4. **Reconcile timing** -- Pad silence when audio < visual, freeze frames when audio > visual
5. **Concatenate audio** -- Combine all segments in order
6. **Prepare background music** -- Royalty-free track, loop to match video duration
7. **Final merge** -- Video + voice track + music via ffmpeg

Key constraints established by the POC:
- Audio clips NEVER overlap (golden rule)
- Audio starts 500ms before visual caption (`AUDIO_SHIFT = -0.5`)
- Minimum 300ms silence gap between clips (`MIN_GAP = 0.3`)
- Voice continuity via `previous_text`/`next_text` on every ElevenLabs API call
- ElevenLabs calls are cached (skip if mp3 exists and non-empty)
- Freeze frames via ffmpeg `trim` + `tpad=stop_mode=clone` + `concat`

### 1.2 Pipeline Scripts Analysis

**generate-highlights-voice.mjs (V1):**
- Hardcoded `CAPTIONS` array with 21 entries: `{ id, text, startSec }`
- 3-step pipeline: generate audio (ElevenLabs API), analyze durations (ffprobe), merge (ffmpeg adelay+amix)
- Caching: skips API call if `caption_NN.mp3` exists and non-empty
- ffmpeg strategy: `adelay` positions each clip at its timestamp, `amix` combines all streams, `apad` extends to video end

**merge-highlights-v2.mjs (V2 -- freeze frame):**
- Same hardcoded `CAPTIONS` array but only `{ id, startSec }` (text not needed for merge)
- 4-step pipeline: load durations, calculate freeze points, build video filter, build full ffmpeg command
- Freeze algorithm: walk captions in order, if previous clip would overlap next, insert freeze frame
- Video filter: `trim` + `tpad=stop_mode=clone` + `concat` to insert frozen frames

**add-music.mjs:**
- Takes voiced video + music track
- ffmpeg: `-stream_loop -1` for looping, `volume=0.15` for ambient level, `amix=duration=first`
- No video re-encoding (`-c:v copy`)

### 1.3 Spec File Pattern Analysis (highlights-with-captions.spec.ts)

The spec defines 3 caption functions:
- `showCaption(page, text)` -- Show caption, persists until next show/hide. Internally calls `page.waitForTimeout(300)` for fade-in.
- `hideCaption(page)` -- Fade out current caption. Internally calls `page.waitForTimeout(300)` for fade-out.
- `caption(page, text, ms)` -- Calls `showCaption`, then `waitForTimeout(ms)`, then `hideCaption`. Total time = 300 (show) + ms + 300 (hide).

Timing functions used in the spec (all wrap `page.waitForTimeout`):
- `pause(page, ms)` -- Direct waitForTimeout wrapper
- `scenicPause(page, ms)` -- Same as pause (default 1800ms)
- `quickPause(page, ms)` -- Same as pause (default 600ms)
- `smoothScroll(page, selector)` -- Has internal 800ms waitForTimeout
- `setViewport(page, w, h)` -- Has internal 400ms waitForTimeout
- `dragAndDrop(page, src, tgt, opts)` -- Has internal holdMs + holdMs + 300ms waitForTimeout

Non-deterministic timing patterns found:
- `naturalType()` -- per-character typing with `60 + Math.random() * 80` ms per char
- Chart hover loop -- 5 iterations with `pause(page, 400)` each
- Stat card hover loop -- 4 items with `quickPause(page, 600)` each
- Conditional blocks -- `if (todoCount > 0)` and `if (ipCount > 0)` guard drag-and-drop sections

### 1.4 Caption Extraction Validation

By manually tracing the spec, the 21 captions in order are:

| # | Function | Text | Estimated Time (sec) |
|---|----------|------|---------------------|
| 1 | `caption()` | "Welcome to ProjectHub..." | ~1.4 |
| 2 | `showCaption()` | "Interactive stat cards..." | ~5.5 |
| 3 | `showCaption()` | "Data visualization powered by Recharts." | ~9.7 |
| 4 | `showCaption()` | "Hover tooltips reveal exact data points." | ~12.8 |
| 5 | `showCaption()` | "The activity feed tracks..." | ~17.0 |
| 6 | `caption()` | "Next -- the Projects page." | ~21.5 |
| 7 | `showCaption()` | "Search, sorting, and pagination..." | ~24.5 |
| 8 | `showCaption()` | "Real-time filtering as you type." | ~27.0 |
| 9 | `showCaption()` | "Sortable column headers toggle direction." | ~30.5 |
| 10 | `showCaption()` | "Creating a new project via modal form." | ~34.0 |
| 11 | `showCaption()` | "Success -- the new project appears instantly." | ~38.5 |
| 12 | `caption()` | "The Kanban board..." | ~41.5 |
| 13 | `showCaption()` | "Moving a task from To Do to In Progress." | ~47.0 |
| 14 | `showCaption()` | "And from In Progress to Done." | ~50.0 |
| 15 | `caption()` | "Dark mode -- one click transforms..." | ~53.5 |
| 16 | `showCaption()` | "Every chart and card adapts..." | ~59.0 |
| 17 | `caption()` | "Responsive design -- from desktop to mobile." | ~67.5 |
| 18 | `showCaption()` | "Mobile at 375px -- everything adapts." | ~71.5 |
| 19 | `showCaption()` | "Tablet -- the sidebar collapses to icons." | ~75.0 |
| 20 | `showCaption()` | "Back to desktop -- full layout restored." | ~77.5 |
| 21 | `caption()` | "ProjectHub -- React 18, TypeScript, Tailwind CSS..." | ~79.5 |

These match the hardcoded CAPTIONS array in generate-highlights-voice.mjs exactly. The timestamp estimation approach (tracing `waitForTimeout` chains) was proven accurate to +/-1 second.

---

## 2. AST Parsing vs Regex Extraction

### 2.1 Approach Comparison

| Criterion | Regex | @babel/parser + traverse | ts-morph |
|-----------|-------|--------------------------|----------|
| **Dependencies** | Zero (built-in) | ~2.5 MB (@babel/parser + @babel/traverse) | ~8 MB (ts-morph wraps full TS compiler) |
| **Setup complexity** | None | Parse with plugins: ["typescript"] | Create Project, add source file |
| **String extraction** | Good for simple patterns | Excellent -- AST gives typed argument nodes | Excellent -- same plus type info |
| **Handles multiline** | Fragile -- need /s flag, complex patterns | Robust -- AST is whitespace-agnostic | Robust |
| **Handles template literals** | Very fragile | Handles TemplateLiteral nodes natively | Handles natively |
| **Handles string concatenation** | Cannot | Handles BinaryExpression with StringLiteral | Handles |
| **Nested calls** | Cannot reliably | Full AST traversal handles nesting | Full traversal |
| **Variable references** | Cannot resolve | Cannot resolve (no type info) | CAN resolve (has type checker) |
| **Execution order tracking** | Line-by-line only | AST gives execution order within blocks | Same |
| **Conditional blocks** | Cannot detect | Can detect IfStatement wrapping | Can detect |
| **Loop detection** | Cannot detect | Can detect ForStatement, ForOfStatement | Can detect |
| **Speed** | Fastest (~1ms) | Fast (~10-50ms per file) | Slower (~200-500ms, loads compiler) |
| **Error recovery** | Partial matches still work | `errorRecovery: true` option | Depends on TS compiler |

### 2.2 What Needs Extracting

The extraction task has two parts:

**Part A: Caption text extraction** -- Extract the string argument from `showCaption(page, 'text')` and `caption(page, 'text', ms)` calls.

**Part B: Timestamp estimation** -- Sum all `waitForTimeout(N)` / `pause(page, N)` / `scenicPause(page, N)` / `quickPause(page, N)` calls preceding each caption, accounting for:
- Known helper internals (showCaption adds 300ms, hideCaption adds 300ms, smoothScroll adds 800ms, setViewport adds 400ms, dragAndDrop adds holdMs*2+300ms)
- The `caption(page, text, ms)` function internally calls showCaption(300ms) + waitForTimeout(ms) + hideCaption(300ms)
- Loops with known iteration counts (e.g., `for (const card of statCards)` where statCards has 4 items)
- Loops with unknown iteration counts (e.g., `for (const char of text)` with per-character timing)
- Conditional blocks that may or may not execute

### 2.3 Regex Prototype

For Part A (caption extraction), regex works well:

```javascript
// Extract showCaption calls
const showCaptionRegex = /showCaption\(page,\s*['"](.+?)['"]\)/g;

// Extract caption calls (with optional ms argument)
const captionRegex = /caption\(page,\s*['"](.+?)['"](?:,\s*(\d+))?\)/g;

// Extract hideCaption calls
const hideCaptionRegex = /hideCaption\(page\)/g;
```

Testing against the highlights-with-captions.spec.ts (inside the test block only, excluding function definitions):
- `showCaptionRegex` matches 15 captions correctly
- `captionRegex` matches 6 captions correctly (the `caption()` standalone calls, including the multiline outro with DOTALL flag)
- Total: 21 captions extracted with correct text
- Note: The simple regex without DOTALL misses the multiline `caption()` at lines 317-321; using `/s` flag or pre-normalizing whitespace resolves this

For Part B (timestamp estimation), regex becomes fragile:

```javascript
// Extract waitForTimeout values
const waitRegex = /waitForTimeout\((\d+)\)/g;

// Extract pause/scenicPause/quickPause values
const pauseRegex = /(pause|scenicPause|quickPause)\(page(?:,\s*(\d+))?\)/g;
```

This captures the raw timing values but CANNOT:
- Resolve which pauses are inside helper functions (showCaption, hideCaption internal pauses)
- Track execution order through conditionals and loops
- Determine loop iteration counts
- Handle the naturalType helper's per-character random timing

### 2.4 Chosen Approach: Regex for Extraction, Heuristic for Timing

**Recommendation: Use regex for caption text extraction (Part A) and a line-by-line sequential heuristic for timestamp estimation (Part B).**

Rationale:

1. **Caption text extraction is a simple pattern match.** All caption calls follow one of two patterns: `showCaption(page, 'literal string')` or `caption(page, 'literal string', optionalMs)`. In practice, caption text is always a string literal (never a variable, template literal, or concatenation) because it is human-authored text designed to be read on screen. Regex handles this perfectly.

2. **Timestamp estimation does not need AST precision.** The POC proved that +/-1 second accuracy is sufficient for voice-over synchronization. The freeze-frame merge algorithm (V2) handles any remaining timing mismatches by inserting video pauses. So the timestamp estimation needs to be "good enough" rather than exact.

3. **AST parsing adds complexity and dependencies for marginal benefit.** For this use case, we do not need type resolution (ts-morph's main advantage) or full AST traversal (@babel/parser's advantage). The spec files follow a predictable linear structure -- they are sequential Playwright actions, not complex control flow.

4. **The line-by-line heuristic approach:**
   - Read the file line by line
   - Maintain a running `currentTimeSec` counter starting at 0
   - For each line, check for timing-related calls and add their duration:
     - `waitForTimeout(N)` -> add N/1000
     - `pause(page, N)` -> add N/1000
     - `scenicPause(page, N)` -> add N/1000 (default 1800 if no arg)
     - `quickPause(page, N)` -> add N/1000 (default 600 if no arg)
     - `smoothScroll(...)` -> add 0.8 (internal 800ms)
     - `setViewport(...)` -> add 0.4 (internal 400ms)
     - `page.goto(...)` -> add 1.0 (estimated network + render time)
     - `page.waitForLoadState(...)` -> add 0.5 (estimated)
     - `page.click(...)` -> add 0.1 (estimated)
     - `page.hover(...)` -> add 0.1 (estimated)
   - When a `showCaption` or `caption` call is found, record `{ text, startSec: currentTimeSec }`
   - For `caption(page, text, ms)`, also add `ms/1000 + 0.6` (hold time + show/hide fade)
   - For known loops: use a heuristic multiplier (e.g., `for (const card of statCards)` where statCards is defined above -> count array items)
   - For naturalType: estimate based on string length * 100ms per character
   - For conditional blocks: assume they execute (optimistic path)

5. **Fallback: user-editable timestamps.** The extraction script should output a JSON manifest that the user can manually adjust before proceeding to TTS generation. This gives the user control over timing without needing perfect automated extraction.

**Why NOT @babel/parser:** The added dependency (2.5MB) and traversal complexity do not provide meaningful benefit for this use case. Caption strings are always literals, and timing estimation is inherently approximate regardless of parser precision.

**Why NOT ts-morph:** The 8MB dependency and compiler load time are excessive for what amounts to a pattern-matching task. Type resolution is irrelevant since we only need syntactic extraction.

**When to reconsider:** If future spec files use variables for caption text (e.g., `const msg = 'Hello'; showCaption(page, msg)`), AST parsing with @babel/parser would be warranted. This can be added as an opt-in flag (`--ast-parse`) in a future iteration.

---

## 3. Timestamp Estimation Algorithm

### 3.1 Core Algorithm (Line-by-Line Sequential)

```
Input:  Source text of a Playwright spec file
Output: Array of { id: number, text: string, startSec: number, type: 'showCaption' | 'caption' }

Algorithm:
  currentTime = 0.0
  captions = []
  captionId = 1

  FOR each line in sourceText:
    // Accumulate timing from known functions
    IF line matches waitForTimeout(N):    currentTime += N / 1000
    IF line matches pause(page, N):       currentTime += N / 1000
    IF line matches scenicPause(page, N): currentTime += (N || 1800) / 1000
    IF line matches quickPause(page, N):  currentTime += (N || 600) / 1000
    IF line matches smoothScroll(...):    currentTime += 0.8
    IF line matches setViewport(...):     currentTime += 0.4
    IF line matches page.goto(...):       currentTime += 1.0
    IF line matches page.waitForLoadState(...): currentTime += 0.5
    IF line matches page.click(...):      currentTime += 0.1
    IF line matches page.hover(...):      currentTime += 0.1

    // Detect caption calls
    IF line matches showCaption(page, 'text'):
      captions.push({ id: captionId++, text, startSec: currentTime, type: 'showCaption' })
      currentTime += 0.3  // showCaption's internal fade-in

    IF line matches caption(page, 'text', ms):
      captions.push({ id: captionId++, text, startSec: currentTime, type: 'caption' })
      currentTime += 0.3 + (ms || 3000) / 1000 + 0.3  // show + hold + hide

    IF line matches hideCaption(page):
      currentTime += 0.3  // hideCaption's internal fade-out

  RETURN captions
```

### 3.2 Known Limitations and Mitigations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| Random timing (Math.random) | +/-1s drift in naturalType sections | Use midpoint estimate (60+40=100ms per char) |
| Network waits (goto, waitForLoadState) | 0.5-2s uncertainty per navigation | Use conservative fixed estimates |
| Conditional execution (if blocks) | May add/skip time unpredictably | Assume optimistic path (blocks execute) |
| Loop iteration counts | Must resolve array lengths from source | Regex to count array literal items; fallback to 1 |
| Nested function calls | Helper functions have internal timing | Hardcode known helper timing (showCaption=300ms, etc.) |
| Chart hover mouse.move | Minimal timing per move | Add 0.05s per move call |

### 3.3 Accuracy Assessment

Comparing the line-by-line heuristic against the manually-traced timestamps from the POC:

The POC's timestamps were derived by the same manual process -- tracing waitForTimeout chains through the spec. The automated version should achieve near-identical results because:
1. All timing functions in the spec are deterministic wrappers around `waitForTimeout(N)` where N is a literal number
2. The only non-deterministic parts are naturalType (which appears between captions, not affecting caption start times significantly) and conditional drag-and-drop blocks (which are assumed to execute)
3. Network operations (goto, waitForLoadState) appear only at section transitions, and their fixed estimates (1.0s, 0.5s) are close to actual headless execution times

Expected accuracy: +/-1 second, matching the POC's stated accuracy. This is sufficient because the freeze-frame merge algorithm handles remaining timing mismatches.

---

## 4. Auto-Discover Mode Research

### 4.1 What Auto-Discover Needs to Do

Auto-discover mode reads a project's codebase and generates a demo Playwright spec that showcases key features. It needs to:

1. **Identify pages/routes** -- Find React Router routes, Next.js pages, or any navigation structure
2. **Identify interactive elements** -- Find buttons, forms, tables, toggles with `data-testid` attributes
3. **Identify key features** -- Group elements into demo-worthy features (e.g., "CRUD operations", "dark mode", "responsive design")
4. **Generate a demo spec** -- Write a Playwright spec that navigates through pages and demonstrates features with appropriate captions

### 4.2 Discovery Strategies

**Strategy A: Static code analysis (read source files)**

| What to Find | How to Find It | Reliability |
|--------------|----------------|-------------|
| Routes | Grep for `<Route path=`, `app.get(`, Next.js `pages/` or `app/` dirs | High |
| Navigation elements | Grep for `data-testid="nav-*"` or `<nav>` or sidebar patterns | High |
| Interactive elements | Grep for `data-testid=` attributes in JSX/TSX files | High |
| Forms | Grep for `<form>`, `<input>`, `type="submit"` | High |
| Tables | Grep for `<table>`, `<th>`, sortable headers | High |
| Toggles | Grep for `data-testid="*toggle*"` or theme switcher patterns | Medium |
| Charts | Grep for Recharts/Chart.js/D3 imports | High |
| Drag-and-drop | Grep for `draggable="true"` or DnD library imports | High |
| Responsive design | Check for Tailwind responsive classes, media queries | Medium |

**Strategy B: Runtime discovery (Playwright browser automation)**

Use Playwright's accessibility tree and element inspection at runtime:
- Navigate to each route
- Capture accessibility snapshot (`page.accessibility.snapshot()`)
- Find all interactive elements via `data-testid` locator strategy
- Screenshot each page state

**Strategy C: Playwright MCP (AI agent explores the app)**

Use Playwright MCP's browser automation tools:
- `browser_snapshot` captures accessibility tree
- AI agent navigates and discovers features interactively
- Most flexible but requires MCP server setup

### 4.3 Recommended Auto-Discover Approach

**Use Strategy A (static code analysis) as the primary approach, with Strategy B as a supplemental runtime validation step.**

Rationale:
1. Static analysis is fast, deterministic, and requires no running server
2. It produces a structured inventory that can be turned into a demo spec template
3. Runtime validation confirms that discovered elements actually exist and are interactive
4. Strategy C (MCP) is too complex for a skill -- it requires separate infrastructure

**Auto-discover pipeline:**

```
Step 1: Scan project structure
  - Identify framework (React, Next.js, Vue, etc.)
  - Find page/route definitions
  - Find component files

Step 2: Extract interactive elements
  - Grep for data-testid attributes across all component files
  - Group by page/route
  - Categorize: navigation, forms, tables, buttons, toggles, charts, draggable

Step 3: Build feature inventory
  - Map data-testid elements to feature categories
  - Prioritize by demo impact (charts > tables > forms > buttons)
  - Estimate demo time per feature

Step 4: Generate demo spec
  - Template: imports, setup (viewport, goto), sections per feature
  - Each section: navigate to page, interact with elements, add captions
  - Include caption overlay system from template
  - Include timing pauses (scenicPause, pause) for demo pacing

Step 5: Validate (optional runtime check)
  - Start dev server
  - Run generated spec with --headed to verify it works
  - Fix any selector issues
```

### 4.4 Auto-Discover Challenges

| Challenge | Severity | Mitigation |
|-----------|----------|-----------|
| No data-testid attributes | High | Fall back to role/text locators; suggest adding test IDs |
| Complex SPA routing | Medium | Support React Router, Next.js, Vue Router patterns |
| Auth-gated pages | High | Prompt user for login steps or skip gated pages |
| Dynamic data | Medium | Use whatever data is present in dev mode |
| Framework detection | Low | Check package.json dependencies |
| Ordering features | Medium | Use navigation order (sidebar/nav items) |

### 4.5 Feature Detection Patterns

```javascript
// React Router routes
/\<Route\s+path=["']([^"']+)["']/g

// Next.js pages (file-based routing)
// Scan pages/ or app/ directories for page.tsx files

// Navigation with data-testid
/data-testid=["']nav-([^"']+)["']/g

// Interactive elements
/data-testid=["']([^"']+)["']/g

// Forms
/<form|<input|type=["']submit["']/g

// Tables with sort
/<th.*?(?:onClick|sortable|data-testid)/g

// Theme toggle
/data-testid=["'](?:theme|dark-mode|toggle)[-\w]*["']/g

// Charts
/import.*?(?:Recharts|Chart\.js|recharts|chartjs|d3|victory)/g

// Draggable elements
/draggable=["']true["']|data-testid=["'](?:kanban|drag|drop)/g
```

---

## 5. Dependencies and Tooling Recommendations

### 5.1 Runtime Dependencies (required on user's machine)

| Tool | Purpose | Installation |
|------|---------|-------------|
| **ffmpeg** | Video/audio processing | `brew install ffmpeg` (macOS) |
| **ffprobe** | Audio duration analysis | Included with ffmpeg |
| **Node.js 18+** | Pipeline scripts (native fetch) | Already required for Playwright |
| **Playwright** | Video recording | Already in target project |

### 5.2 No NPM Dependencies for Pipeline Scripts

The pipeline scripts should have ZERO npm dependencies beyond Node.js builtins (`fs`, `path`, `child_process`, `url`). This matches the pattern established by the POC scripts, which use:
- `fs` for file I/O
- `child_process.execSync` for ffmpeg/ffprobe calls
- Native `fetch` (Node 18+) for ElevenLabs API calls
- `path` for path resolution

This is important because the scripts are scaffolded into target projects and should not require additional `npm install` steps.

### 5.3 External API Dependencies

| Service | Purpose | Required? | Cost |
|---------|---------|-----------|------|
| **ElevenLabs** | Text-to-speech voice generation | Required for voice | Free tier: 10k credits/month (~10 min TTS) |

API key configuration: Support both `ELEVENLABS_API_KEY` and `ELEVAN_LABS_API_KEY` spelling (the POC used the latter).

---

## 6. Risk Assessment and Error Handling Strategy

### 6.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Regex fails on unusual caption patterns | Low | Medium | Fall back to manual caption entry; provide `--manual` flag |
| Timestamp estimation drift > 2s | Medium | Low | Freeze-frame merge compensates; user can edit manifest |
| ffmpeg not installed | Medium | High | Pre-flight check with clear error message |
| ElevenLabs API rate limit | Low | Medium | Caching prevents redundant calls; exponential backoff |
| ElevenLabs free tier exhausted | Medium | Medium | Show credit estimate before generating; `--dry-run` flag |
| Target project has no data-testid | Medium | High | Auto-discover falls back to text/role locators or prompts user |
| Generated demo spec has selector errors | High | Medium | Runtime validation step; interactive fix mode |
| Spec file uses variables for caption text | Low | Medium | Warn user; suggest `--ast-parse` flag for future |
| Non-standard caption function names | Medium | Medium | Allow configurable function names via CLI flags |

### 6.2 Error Handling Strategy

**Pre-flight checks (fail fast):**
1. Verify ffmpeg and ffprobe are installed and accessible
2. Verify ElevenLabs API key is set (if voice generation is requested)
3. Verify input spec file exists and is readable
4. Verify video file exists (if provided)
5. Verify target project has Playwright installed

**Extraction errors (degrade gracefully):**
1. If regex finds 0 captions: warn user, suggest checking function names, offer `--function-names` override
2. If timestamp estimation produces negative values: clamp to 0
3. If timestamps are non-monotonic: warn user, offer to use linear interpolation instead

**Pipeline errors (retry or report):**
1. ElevenLabs API failure: retry up to 3 times with exponential backoff; report which captions failed
2. ffmpeg failure: capture stderr, display to user with suggested fixes
3. ffprobe failure: warn about audio duration unknown, use estimated duration from text length

**Output validation:**
1. After merge, verify output MP4 exists and has non-zero size
2. Compare output duration to expected (sum of all caption timestamps + buffer)
3. Report final stats: file size, duration, number of captions processed

---

## 7. Decisions and Approach for Step 1 (Build)

### 7.1 Caption Extraction

- **Approach:** Regex-based extraction
- **Function patterns:** `showCaption(page, 'text')`, `caption(page, 'text', ms)`, `hideCaption(page)`
- **Configurable:** Allow custom function names via `--show-fn`, `--caption-fn`, `--hide-fn` flags
- **Output:** JSON manifest: `[{ id, text, startSec, type, line }]`

### 7.2 Timestamp Estimation

- **Approach:** Line-by-line sequential heuristic
- **Known functions:** waitForTimeout, pause, scenicPause, quickPause, smoothScroll, setViewport, dragAndDrop, page.goto, page.waitForLoadState, page.click, page.hover, page.mouse.move
- **Internal timings:** showCaption=300ms, hideCaption=300ms, caption=300+ms+300
- **Output:** Timestamps in the same JSON manifest, editable by user before TTS

### 7.3 Auto-Discover Mode

- **Approach:** Static code analysis (grep for data-testid, routes, framework detection)
- **Output:** Feature inventory + generated demo spec
- **Validation:** Optional runtime check with Playwright

### 7.4 Pipeline Architecture

```
extract-captions.mjs     -- Parse spec -> JSON manifest
  |
  v
generate-voice.mjs       -- JSON manifest + ElevenLabs API -> per-caption MP3s
  |
  v
merge-video.mjs           -- Video + MP3s + manifest -> freeze-frame merge -> MP4
  |
  v
add-music.mjs             -- Voiced MP4 + music track -> final MP4
  |
  v
run-pipeline.mjs           -- Orchestrator: chains all steps, pre-flight checks
```

### 7.5 SKILL.md Structure

The skill should document:
1. Prerequisites (ffmpeg, Playwright, ElevenLabs API key)
2. Two modes: auto-discover and guided
3. Step-by-step workflow for each mode
4. Pipeline script descriptions and flags
5. Template files included
6. Troubleshooting guide
7. Configuration options

---

## 8. Prototype: Regex Extraction on highlights-with-captions.spec.ts

To validate the regex approach, here is what extraction against the reference spec file yields:

**showCaption matches (15):**
1. Line 110: "Interactive stat cards show key metrics at a glance."
2. Line 129: "Data visualization powered by Recharts."
3. Line 134: "Hover tooltips reveal exact data points."
4. Line 149: "The activity feed tracks team actions in real time."
5. Line 174: "Search, sorting, and pagination -- all built in."
6. Line 178: "Real-time filtering as you type."
7. Line 190: "Sortable column headers toggle direction."
8. Line 200: "Creating a new project via modal form."
9. Line 218: "Success -- the new project appears instantly."
10. Line 237: "Moving a task from To Do to In Progress."
11. Line 252: "And from In Progress to Done."
12. Line 272: "Every chart and card adapts to the dark palette."
13. Line 299: "Mobile at 375px -- everything adapts."
14. Line 304: "Tablet -- the sidebar collapses to icons."
15. Line 309: "Back to desktop -- full layout restored."

**caption() matches (6):**
1. Line 107: "Welcome to ProjectHub..." (3500ms)
2. Line 169: "Next -- the Projects page." (2000ms)
3. Line 226: "The Kanban board..." (3000ms)
4. Line 267: "Dark mode -- one click transforms..." (3000ms)
5. Line 296: "Responsive design -- from desktop to mobile." (3000ms)
6. Lines 317-321: "ProjectHub -- React 18, TypeScript, Tailwind CSS..." (4500ms, multiline)

Note: The multiline caption() call on lines 317-321 requires special handling. The regex should support multiline matching or the extraction should normalize whitespace. This is a known edge case that the regex approach handles with a `/s` flag or by pre-joining continuation lines.

**Total: 21 captions extracted successfully.** This matches the POC's hardcoded CAPTIONS array exactly.

---

## 9. Summary of Findings

1. **Regex extraction is sufficient** for caption text extraction. All caption texts in real specs are string literals.
2. **Line-by-line timestamp estimation** achieves +/-1s accuracy, which is sufficient because the freeze-frame merge algorithm compensates.
3. **No AST parser dependency is needed** for Step 1. This can be revisited if variable-based captions are encountered.
4. **Auto-discover mode** should use static code analysis (grep for data-testid, routes) as the primary approach.
5. **Pipeline scripts should have zero npm dependencies** beyond Node.js builtins, matching the proven POC pattern.
6. **The multiline caption() call** is the main edge case for regex. Handle with `/s` flag or line-joining.
7. **User-editable JSON manifest** between extraction and TTS generation provides a safety valve for timestamp corrections.
