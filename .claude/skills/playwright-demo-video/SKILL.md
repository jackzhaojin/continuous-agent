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

## When to Use

- User says "create a demo video", "generate a demo", "playwright demo"
- User wants to convert a Playwright spec into a narrated video
- User wants to add voiceover to an existing video recording
- User wants to auto-discover project features and generate a demo spec
- User wants to extract captions from a Playwright test file

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

**Steps:**

1. Copy templates into the target project:
   - `templates/caption-overlay.ts` -- caption CSS + functions
   - `templates/demo-helpers.ts` -- pause/scroll/viewport/dragAndDrop helpers
   - `templates/playwright.video.config.ts` -- video recording config
2. Record the video: `npx playwright test --config=playwright.video.config.ts --grep @demo`
3. Run the pipeline:
   ```bash
   node scripts/run-pipeline.mjs \
     --spec path/to/demo.spec.ts \
     --video path/to/recording.webm \
     --music path/to/background.mp3 \
     --output-dir ./demo-output
   ```

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

## Pipeline Scripts

All scripts live in `scripts/` and use Node.js builtins only (zero npm dependencies).

### scripts/extract-captions.mjs

Parse spec file, output JSON manifest with captions and estimated timestamps.

```bash
node scripts/extract-captions.mjs <spec-file> [options]

Options:
  --output, -o <path>      Output JSON manifest path (default: captions.json)
  --show-fn <name>         Custom showCaption function name
  --caption-fn <name>      Custom caption function name
  --hide-fn <name>         Custom hideCaption function name
  --dry-run                Print manifest to stdout
```

**Supported caption patterns:**
```typescript
showCaption(page, 'Caption text here');        // persists until hide
caption(page, 'Caption text here', 3000);      // show, hold ms, hide
hideCaption(page);                              // fade out
```

**Timestamp estimation:** Line-by-line sequential heuristic tracking all timing functions. Accuracy: +/-1 second. See [references/RESEARCH.md](references/RESEARCH.md) for algorithm details.

**Output format:**
```json
[
  { "id": 1, "text": "Welcome to the dashboard.", "startSec": 1.4, "type": "caption", "line": 107 },
  { "id": 2, "text": "Interactive stat cards.", "startSec": 5.5, "type": "showCaption", "line": 110 }
]
```

The manifest is user-editable before TTS generation -- the safety valve for timestamp corrections.

### scripts/generate-voice.mjs

Per-caption ElevenLabs TTS with caching and voice continuity.

```bash
node scripts/generate-voice.mjs <manifest.json> [options]

Options:
  --output-dir, -d <dir>   Audio output directory (default: ./audio)
  --voice-id <id>          ElevenLabs voice ID (default: Matilda)
  --model <id>             ElevenLabs model (default: eleven_turbo_v2_5)
  --api-key <key>          API key (overrides ELEVENLABS_API_KEY env)
  --dry-run                Print plan without API calls
  --force                  Regenerate all, ignore cache
```

Features:
- **Caching:** Skips generation if `caption_NN.mp3` exists and non-empty
- **Voice continuity:** Sends `previous_text`/`next_text` with every API call
- **Retry:** 3 attempts with exponential backoff (1s, 2s, 4s)
- **Cost estimate:** Prints total character count and credit estimate before starting

### scripts/merge-video.mjs

Freeze-frame merge algorithm (generalized from merge-highlights-v2.mjs).

```bash
node scripts/merge-video.mjs --video <video> --manifest <manifest.json> --audio-dir <dir> [options]

Options:
  --output, -o <path>      Output video path (default: demo-with-voice.mp4)
  --audio-shift <sec>      Voice before visual caption (default: -0.5)
  --min-gap <sec>          Min silence between clips (default: 0.3)
  --crf <n>                Video quality (default: 20)
  --dry-run                Print ffmpeg command only
```

**Golden Rules:**
1. Audio clips NEVER overlap
2. Audio starts 500ms before visual caption (`AUDIO_SHIFT = -0.5`)
3. Minimum 300ms silence gap between clips (`MIN_GAP = 0.3`)
4. Freeze frames via ffmpeg `trim` + `tpad=stop_mode=clone` + `concat`

### scripts/add-music.mjs

Background music overlay.

```bash
node scripts/add-music.mjs --video <voiced.mp4> --music <music.mp3> [options]

Options:
  --output, -o <path>      Output path (default: demo-final.mp4)
  --volume <0-1>           Music volume (default: 0.15 = 15%)
  --fade-out <sec>         Fade music before end (default: 3s)
  --no-loop                Do not loop music
  --dry-run                Print command only
```

Music at 15% volume, looped if shorter than video, `-c:v copy` for fast processing.
Music source: [Pixabay Music](https://pixabay.com/music/) (CC0, no attribution required).

### scripts/run-pipeline.mjs

Orchestrator that chains all steps with pre-flight checks.

```bash
node scripts/run-pipeline.mjs --spec <spec.ts> --video <video.webm> [options]

Options:
  --spec, -s <path>        Playwright spec with caption calls
  --video, -v <path>       Recorded video file
  --music <path>           Background music (optional)
  --output-dir, -d <dir>   Working directory (default: ./demo-output)
  --output, -o <path>      Final output path
  --skip-voice             Use existing audio files
  --skip-music             Skip music overlay
  --dry-run                Print plan without executing
  (+ all options from individual scripts)
```

Pre-flight checks: ffmpeg, ffprobe, Node.js version, ElevenLabs API key.

## Templates

Copy these into your target project.

### templates/caption-overlay.ts

Caption CSS + `showCaption`/`hideCaption`/`caption` functions. The pipeline's extract-captions.mjs parses these function calls, so the naming convention matters.

### templates/demo-helpers.ts

Demo pacing utilities: `pause`, `scenicPause`, `quickPause`, `smoothScroll`, `setViewport`, `naturalType`, `dragAndDrop`. Each has documented internal timing that extract-captions.mjs uses for timestamp estimation.

### templates/playwright.video.config.ts

Playwright config optimized for video recording: headless mode, 1280x800 viewport, generous timeouts, sequential execution, auto-start dev server.

## Caption Extraction Details

### Method: Regex (Not AST)

Regex for text extraction, line-by-line heuristic for timestamps. Validated against 21-caption reference spec with 100% accuracy.

**Why regex:** Caption texts are always string literals. Timestamp estimation is inherently approximate (+/-1s). The freeze-frame merge compensates for drift. Zero dependencies.

**When to upgrade to AST:** If specs use variables for captions (e.g., `const msg = 'Hello'; showCaption(page, msg)`), add `@babel/parser`.

### Timestamp Estimation Constants

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

## Error Handling

### Pre-Flight (Fail Fast)

1. Verify ffmpeg/ffprobe installed
2. Verify ElevenLabs API key set (if voice requested)
3. Verify spec file and video file exist
4. Verify Node.js 18+ (native fetch required)

### Extraction (Degrade Gracefully)

1. Zero captions: warn, suggest `--show-fn`/`--caption-fn` overrides
2. Negative timestamps: clamp to 0
3. Non-monotonic: warn, offer linear interpolation
4. Multiline caption(): handled automatically by whitespace normalization

### Pipeline (Retry or Report)

1. ElevenLabs failure: retry 3x with exponential backoff (1s, 2s, 4s)
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
- Audio clips never overlap in the final video

## On Failure

1. **Regex misses captions**: Check function names; try `--show-fn`, `--caption-fn` overrides
2. **Timestamps far off**: Review helper timing constants; edit JSON manifest before TTS
3. **Auto-discover empty**: Check data-testid attributes; fall back to guided mode
4. **ffmpeg errors**: Run `ffmpeg -version`; check input file formats; try `--dry-run`
5. **ElevenLabs errors**: Check API key and credits; use `--dry-run` to verify manifest first
6. **Audio overlaps**: Increase `--min-gap`; reduce caption density in spec
