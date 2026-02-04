---
title: Fix app bugs and re-record demo video for Recipe Discovery Platform
slug: recipe-demo-video-v2
status: complete
priority: P2
complexity: high
created: "2026-02-03"
tags:
  - demo-video
  - playwright
  - elevenlabs
  - nextjs
  - bugfix
output_path: /Users/jackjin/dev/agent-outputs/projects/nextjs/2026-01-29/1769685367609
---

## Problem

The previous demo video recording failed because the app has runtime errors. The video showed a Next.js "Runtime Error" page instead of actual app content. The voiceover was fine but the visual content was broken.

**Known bugs to fix FIRST:**
1. `images.unsplash.com` is not configured in `next.config.js` — causes "Invalid src prop" Runtime Error when recipe cards try to load Unsplash images
2. Any other runtime errors discovered during pre-recording health check

**What success looks like:**
- All app bugs fixed so every page renders without errors
- A demo video where the VISUAL CONTENT matches the VOICEOVER narration
- No error pages, no blank screens, no "no data" states in the video

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: Next.js 16 with App Router, Tailwind CSS v4, shadcn/ui, Drizzle ORM
- **Build system**: npm

### Existing Project?

- [x] **Existing project** - Enhancing/modifying

The app is at `recipe-discovery-platform/` inside the project directory. It has user auth, recipe CRUD, search, filtering, favorites.

## Approach

### Phase 1: Fix App Bugs

1. Add `images.unsplash.com` to `next.config.js` image remote patterns
2. Start the dev server (`npm run dev`) and visit EVERY route:
   - `/` (home/dashboard)
   - `/login` and `/register`
   - `/recipes` (all recipes)
   - `/recipes/[id]` (recipe detail — pick one from DB)
   - `/search`
   - `/favorites`
   - `/profile`
   - `/recipes/new`
3. Take screenshots or verify each page renders real content (not errors)
4. Fix any additional bugs found
5. Commit all fixes

### Phase 2: Record Demo Video

Use the **playwright-demo-video** skill (available via `Skill` tool).

**CRITICAL: Follow the Visual Verification (MANDATORY) section in the skill.**

1. Run the pre-recording health check — verify every route renders content
2. Delete old demo specs if they use `.catch(() => {})` on interactions
3. Write a new demo spec with proper assertions (no silent failures)
4. Record with Playwright
5. Run the full pipeline: extract captions, generate ElevenLabs voiceover, merge with freeze-frames
6. Run post-recording validation: extract frames, check pixel variance, verify bitrate > 50 kb/s

### Key details:
- The app is inside `recipe-discovery-platform/` subdirectory
- ElevenLabs API key is available as `ELEVENLABS_API_KEY` in the project `.env`
- **PostgreSQL is running** in Docker on localhost:5432 (user/password/recipe_discovery) with seeded data (3 recipes, 2 users)
- Test credentials: chef@example.com / password123
- Use `npx playwright install chromium` if Playwright browsers aren't installed
- Previous demo specs exist in `recipe-discovery-platform/demo/` — review them but rewrite if they use `.catch(() => {})`

## Definition of Done

**Bug fixes:**
- [ ] `next.config.js` configured for Unsplash images
- [ ] All routes render without runtime errors
- [ ] App starts cleanly with `npm run dev`

**Video quality:**
- [ ] Demo video shows actual app content (not error pages)
- [ ] Voiceover narration matches what's visible on screen
- [ ] Video bitrate > 50 kb/s (not a blank recording)
- [ ] Post-recording frame extraction shows real content at 25%, 50%, 75% marks

**Output:**
- [ ] Final MP4 exists in project directory
- [ ] Git committed with clean status

## Constraints

### What the Agent CAN Do

- Fix bugs that prevent the app from running or being demoed
- Install dependencies
- Generate and run Playwright specs
- Call ElevenLabs API for TTS
- Use ffmpeg for video processing

### What the Agent CANNOT Do

- Deploy to production
- Spend more than $20 on ElevenLabs API calls
- Major UI redesigns — just fix what's broken
