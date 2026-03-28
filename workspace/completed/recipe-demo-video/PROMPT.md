---
title: Create demo video for Recipe Discovery Platform
slug: recipe-demo-video
status: complete
priority: P2
complexity: high
created: "2026-02-02"
tags:
  - demo-video
  - playwright
  - elevenlabs
  - nextjs
output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-29/1769685367609
---

## Problem

The Recipe Discovery Platform is a fully built Next.js app with auth, recipe search, filtering, and more. We need a polished demo video showcasing its features — with Playwright-driven recording, AI voiceover (ElevenLabs), on-screen captions, and freeze-frame timing.

**What success looks like:**
- A finished MP4 demo video showing the app's key features in action
- AI-narrated voiceover with on-screen captions synced to actions
- Any blocking bugs encountered during recording are fixed (but no UI polish)

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: Next.js 16 with App Router, Tailwind CSS v4, shadcn/ui, Drizzle ORM
- **Build system**: npm

### Existing Project?

- [x] **Existing project** - Enhancing/modifying

The app is at `recipe-discovery-platform/` inside the project directory. It has:
- User auth (login/register)
- Recipe search and discovery
- Recipe detail pages
- Filtering by cuisine, dietary preferences, cooking time
- Responsive design

## Approach

Use the **playwright-demo-video** skill (available via `Skill` tool) in **Mode 2: Auto-Discover**.

1. **Fix any blocking bugs** — If the app doesn't start or has broken pages, fix them first. No UI polish, just make it functional.
2. **Auto-discover features** — Let the skill analyze the app and generate a Playwright demo spec
3. **Record** — Run the Playwright spec with video recording enabled
4. **Pipeline** — Run the full pipeline: extract captions, generate ElevenLabs voiceover, merge with freeze-frames, add background music

### Key details:
- The app is inside `recipe-discovery-platform/` subdirectory
- ElevenLabs API key is available as `ELEVENLABS_API_KEY` in `.env` at the ai-sandbox root
- Use `npx playwright install chromium` if Playwright browsers aren't installed
- The app needs `npm install` and `npm run dev` to start
- **PostgreSQL is running** in Docker on localhost:5432 (user/password/recipe_discovery) with seeded data
- Previous attempts produced a white video because the DB wasn't running — it is now
- Delete the old demo-video.mp4 and demo-output/ before re-recording

## Definition of Done

**Build**:
- [x] App starts without errors (`npm run dev`)
- [ ] Any blocking bugs fixed

**Functionality**:
- [ ] Playwright demo spec generated covering key features
- [ ] Video recorded successfully via Playwright
- [ ] Captions extracted from spec
- [ ] ElevenLabs voiceover generated
- [ ] Final MP4 produced with voiceover + captions + freeze-frames

**Output**:
- [ ] Final video file exists in project directory
- [ ] Git committed with clean status

## Constraints

### What the Agent CAN Do

- Fix bugs that prevent the app from running or being demoed
- Install dependencies (npm install, playwright install)
- Generate and run Playwright specs
- Call ElevenLabs API for TTS
- Use ffmpeg for video processing

### What the Agent CANNOT Do

- Deploy to production
- Spend more than $20 on ElevenLabs API calls
- Polish UI/UX beyond what's needed for the demo to work
