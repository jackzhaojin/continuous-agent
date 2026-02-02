---
name: playwright-demo-video
description: |
  Generate polished demo videos from Playwright specs with AI voiceover, captions, and music.
  Use when: creating demo videos for web projects, extracting captions from Playwright specs,
  generating TTS voiceover with ElevenLabs, merging video with freeze-frame timing, adding
  background music, auto-discovering project features to generate demo specs.
  Trigger: "demo video", "playwright demo", "generate demo", "caption extraction",
  "voiceover pipeline", "freeze frame merge", "auto-discover demo".
---

# Playwright Demo Video Skill

Generate end-to-end demo videos (MP4) from Playwright specs with on-screen captions, AI voiceover (ElevenLabs), freeze-frame timing, and background music.

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| ffmpeg + ffprobe | Video/audio processing | `brew install ffmpeg` |
| Node.js 18+ | Pipeline scripts (native fetch) | Required for Playwright |
| Playwright | Video recording | In target project |
| ElevenLabs API key | TTS voice generation | `ELEVENLABS_API_KEY` in `.env` |

## Two Modes

### Mode 1: Guided (User Provides Spec)

User has a Playwright spec with `showCaption()`/`caption()` calls.

1. Extract captions and estimate timestamps from the spec
2. Generate per-caption TTS audio via ElevenLabs (cached)
3. Merge audio with video using freeze-frame algorithm
4. Add background music

### Mode 2: Auto-Discover (Generate Spec from Project)

Read the project codebase to generate a demo spec automatically.
See [references/auto-discover.md](references/auto-discover.md) for detailed patterns.

1. Detect framework from package.json
2. Scan routes, pages, navigation structure
3. Extract data-testid attributes from components
4. Generate Playwright demo spec with captions
5. Run guided mode pipeline on generated spec

## Pipeline Architecture

```
Playwright spec (*.spec.ts)
  |  extract-captions    Parse showCaption()/caption() -> JSON manifest
  v                      Estimate timestamps from waitForTimeout chains
  |  generate-voice      Per-caption ElevenLabs API -> caption_NN.mp3 (cached)
  v
  |  merge-video         Video + audio -> freeze-frame merge -> MP4
  v                      Zero audio overlaps guaranteed
  |  add-music           Voiced MP4 + music -> final MP4 (15% volume, looped)
  v
Final demo.mp4
```

## Caption Extraction

### Supported Patterns

```typescript
showCaption(page, 'Caption text here');        // persists until hide
caption(page, 'Caption text here', 3000);      // show, hold ms, hide
hideCaption(page);                              // fade out
```

### Method: Regex (Not AST)

Regex for text extraction, line-by-line heuristic for timestamps. Validated against 21-caption reference spec with 100% accuracy.

**Why regex:** Caption texts are always string literals. Timestamp estimation is inherently approximate (+/-1s). The freeze-frame merge compensates for drift. Zero dependencies.

**When to upgrade to AST:** If specs use variables for captions (e.g., `const msg = 'Hello'; showCaption(page, msg)`), add `@babel/parser`.

### Regex Patterns

```javascript
const showCaptionRx = /showCaption\(page,\s*['"](.+?)['"]\)/g;
const captionRx     = /caption\(page,\s*['"](.+?)['"](?:,\s*(\d+))?\)/gs;
const hideCaptionRx = /hideCaption\(page\)/g;
```

Note: Use `/s` flag on captionRx for multiline `caption()` calls.

### Timestamp Estimation

Line-by-line sequential heuristic -- maintain a running `currentTimeSec` counter:

| Function | Duration |
|----------|----------|
| `waitForTimeout(N)` | N/1000 s |
| `pause(page, N)` | N/1000 s |
| `scenicPause(page, N)` | N/1000 s (default 1800ms) |
| `quickPause(page, N)` | N/1000 s (default 600ms) |
| `smoothScroll(...)` | 0.8 s |
| `setViewport(...)` | 0.4 s |
| `dragAndDrop(..., {holdMs})` | holdMs*2 + 300 ms |
| `page.goto(...)` | 1.0 s (estimated) |
| `page.waitForLoadState(...)` | 0.5 s (estimated) |
| `page.click(...)` | 0.1 s |
| `page.hover(...)` | 0.1 s |
| `showCaption(...)` | +0.3 s (fade-in) |
| `hideCaption(...)` | +0.3 s (fade-out) |
| `caption(page, text, ms)` | 0.3 + ms/1000 + 0.3 s |

Accuracy: +/-1 second. See [references/RESEARCH.md](references/RESEARCH.md) for full algorithm pseudocode and validation data.

### Output: Caption Manifest (JSON)

```json
[
  { "id": 1, "text": "Welcome to the dashboard.", "startSec": 1.4, "type": "caption", "line": 107 },
  { "id": 2, "text": "Interactive stat cards.", "startSec": 5.5, "type": "showCaption", "line": 110 }
]
```

User-editable before TTS generation -- the safety valve for timestamp corrections.

## Golden Rules (from POC)

1. **Audio clips NEVER overlap** -- most important constraint
2. **Audio starts 500ms before visual caption** (`AUDIO_SHIFT = -0.5`)
3. **Minimum 300ms silence gap between clips** (`MIN_GAP = 0.3`)
4. **ElevenLabs calls are cached** -- skip if mp3 exists and non-empty
5. **Freeze frames via ffmpeg** -- `trim` + `tpad=stop_mode=clone` + `concat`
6. **Voice continuity** -- `previous_text`/`next_text` on every API call

## Pipeline Scripts (Zero NPM Dependencies)

All scripts use Node.js builtins only (`fs`, `path`, `child_process`, native `fetch`).

See [references/pipeline-patterns.md](references/pipeline-patterns.md) for ffmpeg command patterns and ElevenLabs API patterns extracted from the POC.

### extract-captions.mjs

Parse spec file, output JSON manifest with captions and estimated timestamps.

### generate-voice.mjs

For each caption in manifest: ElevenLabs API call with `previous_text`/`next_text` for continuity. Cache: skip if `caption_NN.mp3` exists and non-empty.

### merge-video.mjs

Freeze-frame merge algorithm:
1. Load audio durations via ffprobe
2. Walk captions in order, calculate ideal vs earliest audio start
3. If overlap detected, insert freeze frame at that point
4. Build ffmpeg filter: `trim` + `tpad` + `concat` for video, `adelay` + `amix` for audio

### add-music.mjs

Mix background music at 15% volume under voiced video. `-stream_loop -1` for looping, `amix=duration=first` to trim, `-c:v copy` to skip video re-encode.

## Error Handling

### Pre-Flight (Fail Fast)

1. Verify ffmpeg/ffprobe installed
2. Verify ElevenLabs API key set (if voice requested)
3. Verify spec file and video file exist

### Extraction (Degrade Gracefully)

1. Zero captions: warn, suggest `--show-fn`/`--caption-fn` overrides
2. Negative timestamps: clamp to 0
3. Non-monotonic: warn, offer linear interpolation
4. Multiline caption(): handle with `/s` flag

### Pipeline (Retry or Report)

1. ElevenLabs failure: retry 3x with exponential backoff
2. ffmpeg failure: capture stderr, suggest fixes
3. ffprobe failure: estimate duration from text length

## Reference Files

- **Full research findings**: [references/RESEARCH.md](references/RESEARCH.md) -- AST vs regex analysis, prototype results, algorithm pseudocode
- **Auto-discover patterns**: [references/auto-discover.md](references/auto-discover.md) -- framework detection, feature scanning, spec generation
- **Pipeline patterns**: [references/pipeline-patterns.md](references/pipeline-patterns.md) -- ffmpeg commands, ElevenLabs API, freeze-frame algorithm

## Success Criteria

- Caption extraction matches all showCaption/caption calls in the spec
- Timestamp estimates within +/-1 second of actual video timing
- JSON manifest produced and editable
- Auto-discover identifies major features from project structure
- Pipeline produces working MP4 with synchronized voice and captions

## On Failure

1. **Regex misses captions**: Check function names; try `--show-fn`, `--caption-fn` overrides
2. **Timestamps far off**: Review helper timing constants; edit JSON manifest
3. **Auto-discover empty**: Check data-testid attributes; fall back to guided mode
4. **ffmpeg errors**: `ffmpeg -version`; check input formats
5. **ElevenLabs errors**: Check API key and credits; use `--dry-run`
