---
name: playwright-demo-video
description: |
  Generate polished demo videos from Playwright specs with AI voiceover, captions, and music.
  Use when: creating demo videos for web projects, extracting captions from Playwright specs,
  generating TTS voiceover with ElevenLabs, merging video with freeze-frame timing, adding
  background music. Trigger: "demo video", "playwright demo", "generate demo", "caption
  extraction", "voiceover pipeline", "freeze frame merge".
---

# Playwright Demo Video Skill

Generate end-to-end demo videos (MP4) from Playwright specs with on-screen captions, AI voiceover (ElevenLabs), freeze-frame timing reconciliation, and background music.

## When to Use

- Creating demo videos for web applications with Playwright
- Extracting captions and timestamps from Playwright spec files
- Generating TTS voiceover audio synchronized to video
- Building a full video pipeline: record -> caption -> voice -> merge -> music
- Auto-discovering project features to generate demo specs

## Prerequisites

| Tool | Purpose | Installation |
|------|---------|-------------|
| ffmpeg + ffprobe | Video/audio processing | `brew install ffmpeg` (macOS) |
| Node.js 18+ | Pipeline scripts (native fetch) | Required for Playwright |
| Playwright | Video recording | Already in target project |
| ElevenLabs API key | Text-to-speech voice generation | Set `ELEVENLABS_API_KEY` in `.env` |

## Two Operating Modes

### Mode 1: Guided (User Provides Spec)

User has an existing Playwright spec with `showCaption()`/`caption()` calls.

1. Extract captions and estimate timestamps from the spec
2. Generate per-caption TTS audio via ElevenLabs (with caching)
3. Merge audio with video using freeze-frame algorithm
4. Overlay background music

### Mode 2: Auto-Discover (Generate Spec from Project)

Skill reads the project codebase and generates a demo spec.

1. Detect framework (React, Next.js, Vue) from package.json
2. Scan for routes, pages, and navigation structure
3. Extract data-testid attributes from components
4. Group elements into demo-worthy features
5. Generate a Playwright demo spec with captions
6. Run the guided mode pipeline on the generated spec

## Pipeline Architecture

```
Playwright spec (*.spec.ts)
  |
  v
extract-captions         Parse showCaption()/caption() calls -> JSON manifest
  |                      Estimate timestamps from waitForTimeout chains
  v
generate-voice           Per-caption ElevenLabs API -> caption_NN.mp3
  |                      Cached: skip if mp3 exists and non-empty
  v
merge-video              Video + audio -> freeze-frame merge -> MP4
  |                      Zero audio overlaps guaranteed
  v
add-music                Voiced MP4 + music track -> final MP4
  |                      Music at 15% volume, looped to match duration
  v
Final demo.mp4
```

## Caption Extraction Approach

### Supported Caption Patterns

The skill extracts captions from two function patterns found in Playwright specs:

```typescript
// Pattern 1: Show caption (persists until hide)
showCaption(page, 'Caption text here');

// Pattern 2: Show, hold for ms, then hide
caption(page, 'Caption text here', 3000);

// Pattern 3: Hide current caption
hideCaption(page);
```

### Extraction Method: Regex (Chosen Over AST)

**Decision: Use regex for caption text extraction, line-by-line heuristic for timestamp estimation.**

Rationale (validated against reference spec with 21 captions, 100% extraction accuracy):

| Factor | Regex | @babel/parser | ts-morph |
|--------|-------|---------------|----------|
| Dependencies | Zero | ~2.5 MB | ~8 MB |
| Caption text extraction | Excellent (all literals) | Excellent | Excellent |
| Timestamp estimation | Good enough (+/-1s) | Marginal improvement | Marginal improvement |
| Handles multiline | With /s flag | Yes | Yes |
| Setup complexity | None | Moderate | High |

**Why regex is sufficient:**
1. Caption texts are always string literals (never variables or template literals)
2. Timestamp estimation is inherently approximate (+/-1s is acceptable)
3. The freeze-frame merge algorithm compensates for any remaining timing drift
4. User can manually adjust the JSON manifest before TTS generation

**When to upgrade to AST:** If specs use variables for caption text (e.g., `const msg = 'Hello'; showCaption(page, msg)`), add `--ast-parse` flag using @babel/parser.

### Timestamp Estimation Algorithm

Line-by-line sequential heuristic that sums all timing calls:

| Function | Duration Added |
|----------|---------------|
| `waitForTimeout(N)` | N/1000 seconds |
| `pause(page, N)` | N/1000 seconds |
| `scenicPause(page, N)` | N/1000 seconds (default 1800ms) |
| `quickPause(page, N)` | N/1000 seconds (default 600ms) |
| `smoothScroll(...)` | 0.8 seconds (internal 800ms) |
| `setViewport(...)` | 0.4 seconds (internal 400ms) |
| `dragAndDrop(..., {holdMs})` | holdMs*2 + 300ms |
| `page.goto(...)` | 1.0 seconds (estimated) |
| `page.waitForLoadState(...)` | 0.5 seconds (estimated) |
| `page.click(...)` | 0.1 seconds (estimated) |
| `page.hover(...)` | 0.1 seconds (estimated) |
| `showCaption(...)` | 0.3 seconds (internal fade-in) |
| `hideCaption(...)` | 0.3 seconds (internal fade-out) |
| `caption(page, text, ms)` | 0.3 + ms/1000 + 0.3 seconds |

**Accuracy: +/-1 second**, validated against the POC's 21-caption highlights spec.

## Key Constraints (Golden Rules from POC)

1. **Audio clips NEVER overlap** -- the most important constraint
2. **Audio starts 500ms before visual caption** (AUDIO_SHIFT = -0.5)
3. **Minimum 300ms silence gap between clips** (MIN_GAP = 0.3)
4. **ElevenLabs calls are cached** -- skip if mp3 exists and non-empty
5. **Freeze frames via ffmpeg** -- trim + tpad=stop_mode=clone + concat
6. **Voice continuity** -- previous_text/next_text on every API call

## Auto-Discover Mode Research

### Discovery Pipeline

```
Step 1: Scan project structure
  - Check package.json for framework (react, next, vue, angular)
  - Find route definitions (React Router, Next.js pages/app, file-based)
  - Find component files (*.tsx, *.vue, *.svelte)

Step 2: Extract interactive elements
  - Grep for data-testid attributes across all component files
  - Group by page/route
  - Categorize: navigation, forms, tables, buttons, toggles, charts, draggable

Step 3: Build feature inventory
  - Map elements to feature categories
  - Prioritize by demo impact: charts > tables > forms > buttons
  - Estimate demo time per feature

Step 4: Generate demo spec
  - Template: imports, viewport setup, goto, sections per feature
  - Each section: navigate, interact, caption
  - Include caption overlay system from template
  - Include timing pauses for demo pacing
```

### Feature Detection Patterns

| Feature | Detection Pattern | Reliability |
|---------|------------------|-------------|
| Routes | `<Route path=`, Next.js pages/app dirs | High |
| Navigation | `data-testid="nav-*"`, `<nav>` | High |
| Forms | `<form>`, `<input>`, `type="submit"` | High |
| Tables | `<table>`, `<th>`, sortable headers | High |
| Charts | Recharts/Chart.js/D3 imports | High |
| Dark mode | `data-testid="*toggle*"`, theme patterns | Medium |
| Drag-and-drop | `draggable="true"`, DnD library imports | High |
| Responsive | Tailwind responsive classes, media queries | Medium |

### Auto-Discover Challenges

| Challenge | Mitigation |
|-----------|-----------|
| No data-testid attributes | Fall back to role/text locators; suggest adding test IDs |
| Auth-gated pages | Prompt user for login steps or skip gated pages |
| Dynamic data | Use whatever data is present in dev mode |
| Complex SPA routing | Support React Router, Next.js, Vue Router patterns |

## Output Formats

### Caption Manifest (JSON)

```json
[
  { "id": 1, "text": "Welcome to the dashboard.", "startSec": 1.4, "type": "caption", "line": 107 },
  { "id": 2, "text": "Interactive stat cards.", "startSec": 5.5, "type": "showCaption", "line": 110 }
]
```

This manifest is user-editable before TTS generation -- the safety valve for timestamp corrections.

### Feature Inventory (Auto-Discover)

```json
{
  "framework": "react",
  "routes": ["/", "/projects", "/tasks"],
  "features": [
    { "category": "charts", "elements": ["dashboard-charts"], "demoTime": 8 },
    { "category": "table", "elements": ["projects-table"], "demoTime": 12 }
  ]
}
```

## Error Handling

### Pre-Flight Checks (Fail Fast)

1. Verify ffmpeg and ffprobe are installed and accessible
2. Verify ElevenLabs API key is set (if voice generation requested)
3. Verify input spec file exists and is readable
4. Verify video file exists (if provided)
5. Verify target project has Playwright installed

### Extraction Errors (Degrade Gracefully)

1. Zero captions found: warn user, suggest checking function names, offer `--function-names` override
2. Negative timestamps: clamp to 0
3. Non-monotonic timestamps: warn user, offer linear interpolation
4. Multiline caption() call: handle with /s flag or line-joining

### Pipeline Errors (Retry or Report)

1. ElevenLabs API failure: retry up to 3 times with exponential backoff
2. ffmpeg failure: capture stderr, display with suggested fixes
3. ffprobe failure: use estimated duration from text length

## Reference Files

All reference materials are in the parent goal bundle:

- **Pipeline spec**: `workspace/in-progress/P1/playwright-demo-skill/references/demo-video-pipeline-spec-v2.md`
- **Example spec**: `workspace/in-progress/P1/playwright-demo-skill/references/demo-specs/highlights-with-captions.spec.ts`
- **Helpers**: `workspace/in-progress/P1/playwright-demo-skill/references/demo-specs/helpers.ts`
- **Pipeline scripts**: `workspace/in-progress/P1/playwright-demo-skill/references/pipeline-scripts/`
- **Video config**: `workspace/in-progress/P1/playwright-demo-skill/references/config/playwright.video.config.ts`
- **Research findings**: `.claude/skills/playwright-demo-video/RESEARCH.md`

## Success Criteria

- Caption extraction matches all showCaption/caption calls in the spec
- Timestamp estimates are within +/-1 second of actual video timing
- JSON manifest is produced and editable
- Auto-discover identifies major features from project structure
- Pipeline produces a working MP4 with synchronized voice and captions

## On Failure

1. **Regex misses captions**: Check function names match; try `--show-fn`, `--caption-fn` overrides
2. **Timestamps are far off**: Review helper function timing constants; adjust in the JSON manifest
3. **Auto-discover finds nothing**: Verify project has data-testid attributes; fall back to guided mode
4. **ffmpeg errors**: Verify installation with `ffmpeg -version`; check input file formats
5. **ElevenLabs errors**: Verify API key; check credit balance; use `--dry-run` flag
