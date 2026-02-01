---
title: "[SKILL-BUILD] Playwright Demo Video Skill"
slug: "playwright-demo-skill"
priority: P2
status: pending
complexity: high
created: "2026-02-01"
tags: [skill-build, playwright, demo, video, elevenlabs, ffmpeg]
output_path:
branch:
---

## Problem

We need a Claude Code skill called `playwright-demo` that generates polished demo videos (MP4) from any web project with Playwright. The skill should produce end-to-end demo videos with on-screen captions, AI voiceover (ElevenLabs), freeze-frame timing reconciliation, and background music — all automated.

This pipeline has been proven ad-hoc across 8 sessions (see `references/prompt-log-adhoc-sessions.md`) and built into working scripts (see `references/pipeline-scripts/`). The task is to package this into a reusable Claude Code skill that the executive agent can invoke via the `claude-skill-creator` skill.

**Two operating modes:**

1. **Auto-discover mode**: The skill reads the project codebase, identifies key features and pages, and generates a demo script that showcases all working capabilities.
2. **Guided mode**: The user provides specific instructions on what to demo (e.g., "demo the kanban drag-and-drop and dark mode toggle"), and the skill builds a targeted demo.

**What success looks like:**
- A valid SKILL.md at `.claude/skills/playwright-demo/SKILL.md` with correct frontmatter
- Supporting pipeline scripts that work on any web project with Playwright installed
- End-to-end pipeline: caption spec generation -> video recording -> TTS generation -> freeze-frame merge -> music overlay -> final MP4
- Tested against `/Users/jackjin/dev/harness-v2-test` (the dashboard project where this was originally built)
- ElevenLabs API integration with caching (skip re-generation on re-runs)

## Project Context

### Language/Stack

- **Language**: TypeScript (Playwright specs), Node.js ESM (pipeline scripts)
- **Framework**: Playwright (demo recording), ffmpeg (video/audio processing), ElevenLabs API (TTS)
- **Build system**: npm, Playwright CLI

### Existing Project?

- [x] **Existing project** - Enhancing the continuous-agent skill system

This skill will live at `.claude/skills/playwright-demo/` in the agent codebase. The pipeline scripts it generates will be scaffolded into target projects.

**Proven implementation exists at** `/Users/jackjin/dev/harness-v2-test/demo/` — see `references/` for all source files.

## References & Inputs

### Pipeline Spec (the bible)

- `./references/demo-video-pipeline-spec-v2.md` — Full technical spec covering the 7-step pipeline, timing reconciliation, freeze-frame algorithm, ElevenLabs API patterns, ffmpeg commands, and key insights. **READ THIS FIRST.**

### Prompt Log (how it was built ad-hoc)

- `./references/prompt-log-adhoc-sessions.md` — 8 sessions, 22 prompts documenting the entire journey from concept to working MP4 with voice + music. Shows iteration patterns, decisions made, and problems solved.

### Working Pipeline Scripts

These are the proven implementations from harness-v2-test:

- `./references/pipeline-scripts/generate-highlights-voice.mjs` — V1 TTS generation + adelay merge. 21 per-caption ElevenLabs API calls with caching.
- `./references/pipeline-scripts/merge-highlights-v2.mjs` — V2 freeze-frame merge. Inserts freeze frames where voice needs more time. Zero overlaps. No API calls.
- `./references/pipeline-scripts/add-music.mjs` — Mixes royalty-free background music at 15% volume under existing voice+video.

### Demo Spec Examples

- `./references/demo-specs/highlights-with-captions.spec.ts` — Working Playwright spec with 21 on-screen captions, caption overlay system (showCaption/hideCaption/caption helpers), natural-typing helper.
- `./references/demo-specs/helpers.ts` — Shared Playwright utilities: pause(), scenicPause(), quickPause(), smoothScroll(), setViewport(), dragAndDrop().
- `./references/demo-specs/highlights-captions-script.md` — 21 captions extracted from spec, paste-ready for TTS.

### Config

- `./references/config/playwright.video.config.ts` — Headless recording config (1280x800 video, 600s timeout).

### Git History

- `./references/harness-v2-test-git-history.txt` — 8 commits showing what was built in the target project.

## Definition of Done

**Skill Structure**:
- [ ] `.claude/skills/playwright-demo/SKILL.md` exists with valid frontmatter (name, description)
- [ ] SKILL.md documents both modes (auto-discover and guided)
- [ ] SKILL.md includes step-by-step workflow instructions
- [ ] Scripts in `scripts/` are executable (chmod +x)

**Pipeline Scripts (scaffolded by skill into target projects)**:
- [ ] Caption extraction script — parses showCaption()/caption() calls from any Playwright spec, estimates timestamps from waitForTimeout chain
- [ ] TTS generation script — per-caption ElevenLabs API calls with caching, voice continuity (previous_text/next_text)
- [ ] Freeze-frame merge script — inserts video pauses where voice needs time, zero audio overlaps
- [ ] Music overlay script — mixes royalty-free track at configurable volume
- [ ] Orchestrator script — runs full pipeline end-to-end

**Templates**:
- [ ] Caption overlay system template (CSS + showCaption/hideCaption/caption functions)
- [ ] Demo helpers template (pause, scenicPause, smoothScroll, setViewport, dragAndDrop)
- [ ] Playwright video recording config template

**Validation**:
- [ ] `quick_validate.py` passes on the skill (use claude-skill-creator's validator)
- [ ] Pipeline produces working MP4 when tested against harness-v2-test

**Key Constraints from POC**:
- [ ] Audio clips NEVER overlap (golden rule)
- [ ] Audio starts 500ms before visual caption (AUDIO_SHIFT = -0.5)
- [ ] Minimum 300ms silence gap between clips (MIN_GAP = 0.3)
- [ ] ElevenLabs calls are cached (skip if mp3 exists and non-empty)
- [ ] Freeze frames via ffmpeg trim + tpad=stop_mode=clone + concat
- [ ] Voice continuity via previous_text/next_text on every API call

## Approach

Use the `claude-skill-creator` skill to build this. The skill should:

1. **SKILL.md**: Document the full workflow, both modes, prerequisites (ffmpeg, Playwright, ElevenLabs API key), and step-by-step instructions.

2. **Caption overlay system**: Provide a reusable template for injecting captions into any Playwright spec. The CSS gradient overlay, showCaption/hideCaption/caption functions, and natural-typing helper should be generic.

3. **Pipeline scripts**: Generalize the harness-v2-test implementations:
   - Replace hardcoded CAPTIONS arrays with AST-based extraction from any spec file
   - Make voice ID, model ID, and music path configurable
   - Keep the adelay + amix ffmpeg strategy (proven to work)
   - Keep the freeze-frame algorithm (proven to handle timing mismatches)

4. **Two modes**:
   - **Auto-discover**: Read the project (routes, components, data-testid attributes), generate a highlights spec covering major features, then run the full pipeline.
   - **Guided**: Accept user description of what to demo, generate a targeted spec, then run the full pipeline.

5. **Testing**: Run against `/Users/jackjin/dev/harness-v2-test` to validate the full pipeline produces a working MP4.

## Constraints

### What the Agent CAN Do

- Read all reference files in `./references/`
- Create `.claude/skills/playwright-demo/` with SKILL.md, scripts/, templates/
- Install dependencies in target project (Playwright, ffmpeg check)
- Run Playwright specs for video recording
- Call ElevenLabs API (use cached audio when possible — minimize API calls)
- Run ffmpeg commands for video processing
- Test against harness-v2-test project

### What the Agent CANNOT Do

- Push to remote repository
- Spend more than necessary on ElevenLabs (free tier: 10k credits/month)
- Modify the agent codebase outside `.claude/skills/playwright-demo/`
- Deploy or publish the skill externally

### Prerequisites the skill should document

- `ffmpeg` and `ffprobe` installed (e.g., `brew install ffmpeg`)
- `ELEVENLABS_API_KEY` in project `.env` (or `ELEVAN_LABS_API_KEY` — support both spellings)
- Playwright installed in the target project
- A running dev server for the web app being demoed

## Open Questions

- Should the auto-discover mode use Playwright's accessibility tree to find interactive elements, or rely on data-testid attributes?
- Should the skill generate a separate "highlights" (1-2 min) and "full tour" (4+ min) by default, or just one demo?
- Should we bundle a default royalty-free music track with the skill, or always download one?

## Steps

<!-- Pre-defined in TASKS.json -->
