# Demo Video Pipeline Spec v2

## Overview

Automated pipeline to generate polished demo videos with AI voiceover, background music, and on-screen captions from existing Playwright demo scripts.

---

## Components

| Component | Choice |
|-----------|--------|
| Video source | Playwright webm (with caption overlay baked in) |
| Voice | ElevenLabs, professional female narrator |
| Music | Royalty-free upbeat tech (Pixabay or YouTube Audio Library) |
| Output format | MP4 (H.264) — universal compatibility |
| Captions | Keep on-screen text, voice speaks same content |
| Timing | Respect 2-3s transition pauses from existing demo research |

---

## Existing Assets

### Playwright Demo Scripts
- `demo/highlights.spec.ts` — ~53s highlights demo (no captions)
- `demo/full-tour.spec.ts` — ~3.7m full tour demo (no captions)
- `demo/highlights-with-captions.spec.ts` — 1.4m highlights with 21 on-screen captions
- `demo/full-tour-with-captions.spec.ts` — 4.1m full tour with ~30 on-screen captions

### Caption Scripts (voice source of truth)
- `demo/highlights-captions-script.md` — 21 captions extracted from spec, paste-ready for TTS
- Note: The old `demo/highlights-voiceover.md` has different (longer) prose and does NOT match the on-screen captions

### Recorded Videos
- `demo/videos/highlights-captioned.webm` — 1.4m, 6.6 MB (recorded headless)
- `demo/videos/highlights-captioned.mp4` — 1.4m, 3.2 MB (H.264 conversion)
- `demo/videos/full-tour-captioned.webm` — 4.1m, 15 MB (recorded headless)

### Shared Helpers
- `demo/helpers.ts` — pause(), scenicPause(), smoothScroll(), setViewport(), dragAndDrop()

### Config
- `playwright.demo.config.ts` — headed mode, video recording, 600s timeout
- `playwright.video.config.ts` — headless mode, 1280x800 video, for clean recordings

### npm Scripts
- `npm run video:highlights` — record highlights-captioned headless → webm
- `npm run video:full` — record full-tour-captioned headless → webm

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Generate Video (already done)                            │
├─────────────────────────────────────────────────────────────────┤
│ Run Playwright demo with captions in headless mode               │
│ → npm run video:highlights (or video:full)                       │
│ → Outputs: video.webm in demo/videos/ (captions baked in)        │
│ → Timing: estimated from spec's waitForTimeout calls             │
│   (all pauses are deterministic — no runtime manifest needed)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Extract Captions + Timestamps from Spec                  │
├─────────────────────────────────────────────────────────────────┤
│ Source: showCaption() and caption() calls in *-with-captions.ts  │
│ NOT the old voiceover markdown (different content!)              │
│ → 21 captions for highlights, ~30 for full tour                  │
│ → Timestamps estimated by tracing waitForTimeout chain           │
│ → Output: Array of {id, text, videoStartSec}                     │
│                                                                  │
│ Note: Two caption patterns in the spec:                          │
│   showCaption(page, text) — persists until hideCaption()         │
│   caption(page, text, ms) — shows, holds ms, fades out           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Generate Audio (One API Call Per Caption)                │
├─────────────────────────────────────────────────────────────────┤
│ For each caption (21 calls for highlights):                      │
│ → POST /v1/text-to-speech/{voice_id}                             │
│ → Include previous_text and next_text for voice continuity       │
│ → Receive: audio/mpeg bytes                                      │
│ → Save: caption_01.mp3, caption_02.mp3, etc.                     │
│ → Get duration via ffprobe for each segment                      │
│                                                                  │
│ Cost: ~963 chars × 0.5 credits/char (Turbo v2.5) ≈ 482 credits  │
│ Cache: skip generation if mp3 already exists (re-runnable)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Reconcile Timing (Both Directions Are Easy)             │
├─────────────────────────────────────────────────────────────────┤
│ For each section:                                               │
│                                                                 │
│   audio_duration = from ElevenLabs response                     │
│   visual_duration = from Playwright timing manifest             │
│                                                                 │
│   ┌───────────────────────────────────────────────────────────┐ │
│   │ Audio < Visual → Pad silence (FFmpeg)                     │ │
│   │ Fully automated, no manual intervention                   │ │
│   │ ffmpeg -i section.mp3 -af "apad=whole_dur=X" padded.mp3   │ │
│   └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│   ┌───────────────────────────────────────────────────────────┐ │
│   │ Audio > Visual → Extend Playwright pause, re-run demo     │ │
│   │ Script outputs exactly how much to add:                   │ │
│   │                                                           │ │
│   │ ⚠️ Caption 03 "Data visualization" needs +1.2s            │ │
│   │   Audio: 4.3s | Visual: 3.1s                              │ │
│   │   → Add scenicPause(page, 1200) after showCaption()       │ │
│   │   → Re-run: npm run video:highlights                      │ │
│   └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Output: Timing-adjusted audio segments (or adjustment report)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Concatenate Audio Segments                              │
├─────────────────────────────────────────────────────────────────┤
│ Combine all padded audio segments in order                      │
│ → ffmpeg concat demuxer or filter_complex                       │
│ → Output: voice_track.mp3                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Prepare Background Music                                │
├─────────────────────────────────────────────────────────────────┤
│ Source: Royalty-free upbeat tech track                          │
│ → Loop if needed to match video duration                        │
│ → No ongoing cost, no attribution required (check license)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Final Merge with FFmpeg                                 │
├─────────────────────────────────────────────────────────────────┤
│ Combine: video + voice track + music                            │
│                                                                 │
│ Audio levels:                                                   │
│ → Voice: 100% (full volume)                                     │
│ → Music: ~15% (-18dB, stays under voice)                        │
│                                                                 │
│ Output: demo_final.mp4                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Segmented Audio Generation (Critical)

### Why Per-Caption?

Generating one audio file per caption (not per section) enables:
- Precise placement at each caption's video timestamp via ffmpeg adelay
- Easier re-generation if one caption needs tweaking
- No silence padding math — ffmpeg handles gaps automatically
- Natural pauses between captions match existing visual gaps

### API Call Pattern

```javascript
// Node.js — uses native fetch (Node 18+)
const captions = [
  { id: 1, text: 'Welcome to ProjectHub...', startSec: 1.4 },
  { id: 2, text: 'Interactive stat cards...', startSec: 5.3 },
  // ... 21 total for highlights
];

for (let i = 0; i < captions.length; i++) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: captions[i].text,
      model_id: 'eleven_turbo_v2_5',
      previous_text: captions[i-1]?.text,   // Voice continuity
      next_text: captions[i+1]?.text,       // Voice continuity
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  fs.writeFileSync(`caption_${String(i+1).padStart(2,'0')}.mp3`, Buffer.from(await resp.arrayBuffer()));
}
```

### Voice Continuity Parameters

| Parameter | Purpose |
|-----------|---------|
| `previous_text` | Text from prior section — helps AI maintain tone continuity |
| `next_text` | Text from next section — helps AI anticipate pacing |
| `previous_request_ids` | Alternative: pass request IDs instead of text (max 3) |

These parameters ensure the voice sounds like one continuous narration, not choppy disconnected clips.

---

## Pause Handling

### In Voiceover Markdown (Human-Readable)

Use `[pause]` markers in your script:

```markdown
## [0:00] Welcome

Welcome to ProjectHub. [pause] Let's explore the dashboard.

## [0:10] Dashboard Stats

[pause] The dashboard shows your key metrics at a glance.
```

### Transform to SSML Before API Call

The pipeline transforms markers before sending to ElevenLabs:

| Markdown | SSML Output | Duration |
|----------|-------------|----------|
| `[pause]` | `<break time="2s" />` | 2 seconds |
| `[short pause]` | `<break time="1s" />` | 1 second |
| `[long pause]` | `<break time="3s" />` | 3 seconds |

```python
def transform_pauses(text):
    text = text.replace("[long pause]", '<break time="3s" />')
    text = text.replace("[short pause]", '<break time="1s" />')
    text = text.replace("[pause]", '<break time="2s" />')
    return text
```

### SSML Break Tag Rules

- **Max duration**: 3 seconds per break
- **Syntax**: `<break time="1.5s" />` (self-closing tag required)
- **Supported models**: Turbo v2, Flash v2, Multilingual v2
- **Caveat**: Excessive breaks can cause AI to speed up or add artifacts

### Alternative for Eleven V3 Model

V3 uses expressive tags instead of SSML:

```
Welcome to ProjectHub. [pause] Let's explore.
```

Also supports: `[short pause]`, `[long pause]`

### Punctuation Fallbacks (Less Reliable)

| Technique | Effect |
|-----------|--------|
| `...` (ellipsis) | Adds hesitation/nervousness tone |
| `—` (em-dash) | Short pause |
| `— —` (double dash) | Longer pause |

---

## Silence Padding with FFmpeg

### When Audio is Shorter Than Visual

This is the common case and is fully automated.

**Pad a single segment to exact duration:**
```bash
# Pad section_01.mp3 to exactly 5 seconds
ffmpeg -i section_01.mp3 -af "apad=whole_dur=5" section_01_padded.mp3
```

**Pad with specific silence duration:**
```bash
# Add 2 seconds of silence at the end
ffmpeg -i section_01.mp3 -af "apad=pad_dur=2" section_01_padded.mp3
```

### Generate Silence File

```bash
# Create 2 seconds of silence
ffmpeg -f lavfi -t 2 -i anullsrc=r=44100:cl=stereo silence_2s.mp3
```

### Concatenate Padded Segments

Create a file list (`segments.txt`):
```
file 'section_01_padded.mp3'
file 'section_02_padded.mp3'
file 'section_03_padded.mp3'
```

Then concatenate:
```bash
ffmpeg -f concat -safe 0 -i segments.txt -c copy voice_track.mp3
```

---

## Timing Reconciliation Logic

### Golden Rule: Audio Clips NEVER Overlap

This is the most important constraint. If two audio clips would overlap in time, the pipeline must fix it — never ship overlapping narration.

### Two-Way Pausing (Both Directions)

| Scenario | What Happens | Solution |
|----------|-------------|----------|
| Voice finishes before visual | Natural silence — video keeps playing | No fix needed (automatic) |
| Voice longer than visual gap | Audio would overlap next clip | **Freeze-frame**: ffmpeg pauses video while voice finishes |

### V2 Approach: Freeze Frames (No Re-Recording)

Instead of re-recording the Playwright demo with longer pauses, `merge-highlights-v2.mjs` inserts freeze frames into the existing video via ffmpeg:

```
Rules:
  - Audio clips NEVER overlap
  - Audio starts 500ms before its visual caption (AUDIO_SHIFT = -0.5)
  - Minimum 300ms silence gap between clips (MIN_GAP = 0.3)
  - If a clip would overlap the next → freeze the video to make room
```

**Algorithm**: Walk captions in order. For each one:
1. Calculate ideal audio start = (visual time in new timeline) + AUDIO_SHIFT
2. Calculate earliest possible start = previous clip end + MIN_GAP
3. If earliest > ideal → insert freeze frame of (earliest - ideal) seconds at that point in the video
4. Cumulative freeze time shifts all subsequent visual timestamps forward

**ffmpeg technique**: `trim` + `tpad=stop_mode=clone` + `concat`
- `trim` cuts the video at freeze points
- `tpad=stop_duration=N:stop_mode=clone` repeats the last frame for N seconds
- `concat` rejoins all segments into one continuous video

### Future Iteration: Re-Record with Natural Playwright Pauses

Freeze frames work for static UI moments but look unnatural during animations (charts animating, transitions, drag-and-drop). The proper solution is to feed the freeze-frame analysis back into the Playwright spec:

1. Run `merge-highlights-v2.mjs` in **dry-run/analysis mode** to calculate freeze points and durations
2. Auto-insert `scenicPause(page, N)` calls into the Playwright spec at each freeze point
3. Re-record the video with natural pauses baked in (animations play out fully, no frozen frames)
4. Merge with existing audio clips (no ElevenLabs re-generation needed — cached MP3s still valid)

This pipeline (analyze → patch spec → re-record → merge) is the target workflow for the reusable tool. The freeze-frame approach stays as a fast-iteration fallback for when re-recording isn't worth the time.

**Packaging**: This whole pipeline is a candidate for a Claude Code skill (`.skill`), plugin, or standalone CLI tool. The goal is a single command that takes a captioned Playwright spec + pre-generated audio and produces a final MP4 — handling timestamp estimation, overlap detection, pause injection, video recording, and audio merge end-to-end.

---

## ElevenLabs API Reference

### Endpoint for Segmented Generation

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps
```

### Request (with Continuity Context)

```json
{
  "text": "The dashboard shows your key metrics. <break time=\"1.5s\" /> Click any stat card to drill down.",
  "model_id": "eleven_multilingual_v2",
  "previous_text": "Welcome to ProjectHub.",
  "next_text": "Use the sidebar to navigate between pages.",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}
```

### Response

```json
{
  "audio_base64": "base64_encoded_audio_string",
  "alignment": {
    "characters": ["T", "h", "e", " ", "d", "a", "s", "h", ...],
    "character_start_times_seconds": [0.0, 0.05, 0.09, 0.12, ...],
    "character_end_times_seconds": [0.05, 0.09, 0.12, 0.18, ...]
  }
}
```

### Calculate Segment Duration from Response

```python
def get_audio_duration(alignment):
    """Extract total duration from alignment data"""
    if alignment and alignment.character_end_times_seconds:
        return alignment.character_end_times_seconds[-1]
    return None
```

### Voice Selection

- Voice type: Professional female narrator
- Recommended: Rachel, Elli, Bella
- Use `/v1/voices` endpoint to browse and test

### Model Selection

| Model | Use Case | Pause Support |
|-------|----------|---------------|
| `eleven_multilingual_v2` | Highest quality, 32 languages | SSML `<break>` |
| `eleven_turbo_v2_5` | Low latency (75ms) | SSML `<break>` |
| `eleven_flash_v2_5` | Ultra-low latency | SSML `<break>` |
| `eleven_v3` | Newest, most expressive | `[pause]` tags only |

### Pricing

- Free tier: 10k credits/month (~10 min TTS)
- Starter ($5/mo): 30k credits
- 1 credit ≈ 1 character (Multilingual v2)
- ~0.5 credits/char for Flash/Turbo models

---

## Final Merge Command

```bash
ffmpeg -i video.webm \
       -i voice_track.mp3 \
       -i music_loop.mp3 \
       -filter_complex "[1:a]volume=1.0[voice]; \
                        [2:a]volume=0.15[music]; \
                        [voice][music]amix=inputs=2[aout]" \
       -map 0:v -map "[aout]" \
       -c:v libx264 -c:a aac \
       demo_final.mp4
```

**Audio levels:**
- Voice: 100% (dominant)
- Music: 15% (~-18dB, ambient background)

---

## File Structure (actual)

```
demo/
├── helpers.ts                          # Shared Playwright utilities
├── highlights.spec.ts                  # Highlights demo (no captions)
├── highlights-with-captions.spec.ts    # Highlights demo (21 on-screen captions)
├── highlights-voiceover.md             # OLD long-form narration (does NOT match captions)
├── highlights-captions-script.md       # 21 captions extracted, paste-ready for TTS
├── full-tour.spec.ts                   # Full tour demo (no captions)
├── full-tour-with-captions.spec.ts     # Full tour demo (~30 on-screen captions)
├── full-tour-voiceover.md              # OLD long-form narration
│
├── pipeline/
│   ├── generate-highlights-voice.mjs   # V1: TTS generation + simple merge (calls ElevenLabs)
│   ├── merge-highlights-v2.mjs         # V2: Freeze-frame merge (no API calls, uses cached audio)
│   └── add-music.mjs                   # Mix background music under voice+video → final MP4
│
├── audio/
│   └── highlights/
│       ├── caption_01.mp3              # Per-caption audio from ElevenLabs
│       ├── caption_02.mp3              #   (cached — re-runs skip API calls)
│       └── ... (21 files)
│
├── videos/                             # .gitignored
│   ├── highlights-captioned.webm       # Raw headless recording (6.6 MB)
│   ├── highlights-captioned.mp4        # H.264 conversion (3.2 MB)
│   ├── highlights-with-voice.mp4       # Voice + freeze frames (4.8 MB, 92s)
│   ├── highlights-voice-music-mixed-v1.mp4            # Voice + music + freeze frames (5.1 MB, 92s)
│   └── full-tour-captioned.webm        # Raw headless recording (15 MB)
│
├── music/                              # Royalty-free background tracks (Pixabay CC0)
│   └── upbeat-corporate-technology-191949.mp3  # Grand_Project, 3:03, 256kbps
│
playwright.video.config.ts              # Headless recording config (1280x800)
playwright.demo.config.ts               # Headed live-viewing config
```

---

## Music Options (Royalty-Free)

### Recommended Sources

1. **Pixabay Music** — https://pixabay.com/music/
   - License: CC0, no attribution required
   - Search: "corporate", "technology", "upbeat"

2. **YouTube Audio Library** — https://studio.youtube.com/channel/audio
   - License: Varies, most attribution-free
   - Search: "bright", "corporate", "inspiring"

### Music Specifications

- Genre: Upbeat tech/corporate
- Tempo: 100-120 BPM
- Duration: Match or exceed video length (loop if needed)
- Mix level: ~15% (-16 to -20 dB under voice)

---

## Implementation Phases

### Phase 1: Manual Voice Selection ✅
- Tested Deborah (library voice) in ElevenLabs Studio UI
- Library voices require paid plan for API access
- Fell back to Matilda (premade, free tier) — Knowledgeable, Professional

### Phase 2: Full Highlights POC ✅
- Generated all 21 caption audio files via API in one run
- Built ffmpeg merge with adelay-based timestamp placement
- Output: `highlights-with-voice.mp4` (4.6 MB, 84s)
- ~472 credits used (well within 10k free tier)

### Phase 2.5: Freeze-Frame Timing Fix ✅
- Listening revealed audio overlaps in v1 (captions 18-21 especially)
- Created `merge-highlights-v2.mjs` — freeze-frame approach (no re-recording, no ElevenLabs calls)
- Video pauses (freeze frames) where narration needs more time
- 8 freeze points inserted (7.2s total), new video ~92s
- All gaps ≥ 300ms — zero overlaps in output
- Output: `highlights-with-voice.mp4` (4.8 MB, 92s)

### Phase 3: Full Tour Demo (future)
- Same pipeline, ~30 captions instead of 21
- Trace timestamps from `full-tour-with-captions.spec.ts`
- Reuse same script structure with different CAPTIONS array

### Phase 4: Background Music ✅
- Downloaded "Upbeat Corporate Technology" by Grand_Project from Pixabay (CC0, 3:03, 256kbps)
- Created `demo/pipeline/add-music.mjs` — mixes music at 15% volume under existing voice+video
- ffmpeg: `-stream_loop -1` for looping, `volume=0.15` for level, `amix=duration=first` to trim, `-c:v copy` to skip video re-encode
- Output: `highlights-voice-music-mixed-v1.mp4` (5.1 MB, 92s) — voice dominant, music ambient

### Phase 5: Generalize into Reusable Tool (future)
- See "Toward a Reusable Skill" section below

---

## Workflow Summary (actual, from POC)

```
1. Playwright runs headless → demo/videos/highlights-captioned.webm
   Command: npm run video:highlights

2. Extract captions from showCaption()/caption() calls in spec
   Source: highlights-with-captions.spec.ts → 21 captions
   Output: highlights-captions-script.md (already done)

3. Estimate timestamps by tracing waitForTimeout chain in spec
   All pauses are deterministic — no runtime instrumentation needed

4. For each caption:
   → ElevenLabs API call with previous_text/next_text
   → Save: demo/audio/highlights/caption_NN.mp3
   → Cache: skip if mp3 already exists

5. Analyze: ffprobe each mp3 for duration
   → Report overlaps where audio > gap to next caption

6. FFmpeg merge: video + 21 adelay-positioned audio clips → MP4
   → adelay places each clip at its video timestamp
   → amix combines all 21 streams (normalize=0)
   → apad ensures audio extends to video end
   → -shortest trims to video duration

7. Output: demo/videos/highlights-with-voice.mp4
```

---

## POC Build-Out: What Was Built

### Architecture Decisions

**Per-caption audio, not per-section or monolithic.**
Each of the 21 captions gets its own ElevenLabs API call and MP3 file. This is more API calls than a monolithic approach but enables:
- Independent timestamp placement via ffmpeg `adelay`
- Re-generation of individual captions without affecting others
- Cached MP3 files — re-runs skip API calls entirely (zero credits on retry)
- Natural voice continuity via `previous_text`/`next_text` params

**Static timestamp estimation, not runtime instrumentation.**
All Playwright pauses are deterministic (`waitForTimeout(N)`), so timestamps can be calculated by tracing the spec's pause chain without running it. This avoids modifying the spec or adding timing infrastructure. The estimates proved accurate enough for the POC — minor overlaps in the responsive section (rapid-fire captions) are barely noticeable.

**ffmpeg adelay + amix, not concat/silence-padding.**
Instead of building a voice track by interleaving silence files with audio clips, each caption is an independent ffmpeg input stream delayed to its video timestamp. The `amix` filter combines all 21 streams. This is simpler than silence-gap math and handles overlaps gracefully (voice clips blend naturally when they overlap).

**Caption text = voice script (not voiceover markdown).**
The old `highlights-voiceover.md` has long-form paragraphs written for a different spec. The captions baked into `highlights-with-captions.spec.ts` are the actual on-screen text. The voice reads exactly what the viewer sees — keeping captions and voice in sync conceptually, not just temporally.

### Pipeline Script: `demo/pipeline/generate-highlights-voice.mjs`

**Language**: Node.js ESM (no dependencies beyond Node 20 builtins)

**External tools**: `ffmpeg` + `ffprobe` (installed via Homebrew)

**3-step pipeline**:

| Step | What | Cost |
|------|------|------|
| 1. Generate audio | 21 ElevenLabs API calls, cached per-caption | ~472 credits (one-time) |
| 2. Analyze durations | `ffprobe` each MP3, report overlaps | Free |
| 3. Merge | `ffmpeg` adelay + amix + H.264 encode | Free |

**Key implementation details**:

```
API endpoint:  POST /v1/text-to-speech/{voice_id}
Voice:         Matilda (XrExE9yKIg1WjnnlVkGX) — premade, free tier
Model:         eleven_turbo_v2_5 (~0.5 credits/char)
Output:        audio/mpeg (MP3, 44100 Hz, mono, 128 kbps)
Continuity:    previous_text + next_text on every call
Caching:       Skip API call if caption_NN.mp3 exists and non-empty
```

**ffmpeg filter strategy**:

```
[1]adelay=1400|1400,aformat=sample_rates=44100:channel_layouts=mono[a1];
[2]adelay=5500|5500,aformat=sample_rates=44100:channel_layouts=mono[a2];
...
[a1][a2]...[a21]amix=inputs=21:normalize=0,apad=pad_dur=3[voice]
```

- `adelay=N|N` — delay audio start by N ms (left|right channels, mono so same value)
- `aformat` — normalize sample rate/channels across all inputs
- `amix=inputs=21:normalize=0` — mix without volume normalization (since clips don't overlap much)
- `apad=pad_dur=3` — pad 3s silence at end so audio covers full video
- `-shortest` — final output length = video duration

### What Worked Well

1. **Caching** — most valuable feature for iteration. Regenerating only the merge step (adjust timestamps, re-encode) costs zero API credits.
2. **Voice continuity** — `previous_text`/`next_text` makes Matilda sound like one continuous narration, not 21 disconnected clips.
3. **Static timing** — tracing `waitForTimeout` chains gave timestamps within ±1s of actual. Good enough that voice and visual captions feel synchronized.
4. **adelay approach** — simpler than silence-gap interleaving. Each caption is independent — easy to adjust one timestamp without cascading changes.

### Known Limitations (POC)

1. **Timestamps are estimated** — derived by manually tracing the spec's pause chain. Variable-duration operations (`page.goto`, `waitForLoadState`) introduce ±0.5-1s drift. For production, instrument the spec to emit actual timestamps.
2. **Overlapping captions — FIXED in V2** — V1 had overlaps in the responsive section (captions 18-21). V2 `merge-highlights-v2.mjs` fixes this with freeze frames — 8 freeze points, 7.2s total, zero overlaps. Freeze frames look fine for static UI but would look odd during animations (future fix: re-record with longer pauses).
3. ~~No background music~~ — **FIXED** in Phase 4. `add-music.mjs` mixes a Pixabay CC0 track at 15% volume under the voiced video.
4. **Free tier voice limitation** — library voices (like Deborah) require a paid plan. Premade voices (Matilda) work fine but selection is limited.
5. **Hardcoded captions array** — the script has the 21 captions and timestamps baked in. A generalized version should extract these automatically from the spec file.

---

## Toward a Reusable Skill

The POC proves the pipeline works. To turn this into a reusable Claude Code skill or standalone tool, these are the generalization points:

### Inputs a Skill Would Accept

```
Required:
  --spec <path>     Playwright spec with showCaption()/caption() calls
  --video <path>    Pre-recorded .webm from headless Playwright run

Optional:
  --voice <id>      ElevenLabs voice ID (default: Matilda)
  --model <id>      ElevenLabs model (default: eleven_turbo_v2_5)
  --music <path>    Background music track
  --output <path>   Output .mp4 path
```

### Automated Caption + Timestamp Extraction

The hardest generalization: parsing `showCaption(page, 'text')` and `caption(page, 'text', ms)` calls from an arbitrary spec file and computing their timestamps.

**Approach 1: Static AST analysis**
- Parse the spec with a TypeScript AST parser (ts-morph or @babel/parser)
- Walk the AST for `showCaption`, `caption`, `hideCaption` calls
- Sum all `waitForTimeout` / `pause` / `scenicPause` durations between them
- Handles the deterministic case (all pauses are explicit ms values)
- Fails on dynamic durations (loops with variable iteration counts, network waits)

**Approach 2: Runtime instrumentation**
- Monkey-patch `showCaption`/`caption`/`hideCaption` to log `{ caption, timestamp }` to a JSON file
- Run the spec once (headless, with video recording)
- Parse the timing JSON alongside the recorded video
- Handles any spec complexity but requires running it

**Approach 3: Hybrid (recommended)**
- Use static analysis for the common case (simple spec with explicit pauses)
- Fall back to runtime instrumentation if static analysis can't resolve timestamps
- Let the user manually adjust timestamps in the generated config if needed

### Skill Workflow

```
User: /demo-voice --spec demo/highlights-with-captions.spec.ts

Skill:
  1. Parse spec → extract captions + estimate timestamps
  2. Show user: "Found 21 captions. Estimated ~472 credits. Proceed?"
  3. Generate audio (with caching)
  4. Merge with video
  5. Report: "Output: demo/videos/highlights-with-voice.mp4 (4.6 MB)"
```

### Two Merge Modes

The reusable tool should support both approaches and let the user choose:

| Mode | When to Use | Tradeoff |
|------|-------------|----------|
| `--freeze-frames` (default) | Fast iteration, static UI, no re-recording | Frozen frames look odd during animations |
| `--rerecord` | Final polish, animated demos | Requires re-running Playwright (~1-2 min) |

In `--rerecord` mode, the tool would:
1. Calculate freeze points from audio durations
2. Patch the Playwright spec with `scenicPause()` calls
3. Re-run the spec headless to produce a new .webm
4. Merge the new video with cached audio

### Packaging Options

This pipeline is a candidate for multiple packaging formats — to be decided based on how reusable it needs to be:

- **Claude Code skill** (`.skill`) — lowest friction, invoked via `/demo-voice`, has access to full conversation context
- **Claude Code plugin** — if it needs MCP tools or persistent config
- **Standalone CLI tool** — if it should work outside Claude Code (e.g., in CI/CD)

### What the Skill Should NOT Do

- **Generate the Playwright spec** — that's a separate concern (the harness or manual authoring)
- **Record the video** — user should run `npm run video:*` first (too project-specific to automate generically), unless `--rerecord` mode is used
- **Choose voice/model** — expose as config, don't auto-pick
- **Handle paid-tier features** — stick to premade voices by default, let user override with library voice ID if they have a paid plan

---

## Key Insights

1. **Caption text = voice script** — the on-screen captions ARE the narration, not the old voiceover markdown
2. **One API call per caption** — enables independent timestamp placement and cached re-runs
3. **Audio must NEVER overlap** — this is the golden rule. If clips would overlap, freeze the video (or in future iterations, add Playwright pauses and re-record)
4. **Two-way pausing**: voice waits for visual (natural silence), visual waits for voice (freeze frames or spec pauses)
5. **Freeze frames via ffmpeg** — `trim` + `tpad=stop_mode=clone` + `concat` can pause video without re-recording. Works for static UI; future iteration should re-record with natural Playwright pauses for animated moments (feed freeze analysis back into the spec, re-run headless)
6. **Voice continuity via previous_text/next_text** — makes segmented clips sound continuous
7. **Static timestamp estimation works** — all Playwright pauses are deterministic; manual trace gives ±1s accuracy
8. **Caching is critical** — re-runs cost zero API credits; iterate on timestamps and merge freely
9. **adelay > silence-padding** — simpler, independent per-caption, no cascading math
10. **Free tier is viable** — 944 chars × 0.5 credits/char ≈ 472 credits out of 10,000/month
