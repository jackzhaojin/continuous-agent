---
title: Full-Stack Music Player Platform
slug: music-player-ui
status: complete
priority: P3
complexity: high
created: 2026-01-28T00:00:00.000Z
tags:
  - react
  - nextjs
  - tailwind
  - frontend
  - ui-ux
  - media-player
  - layout
  - api
  - database
  - authentication
  - full-stack
  - responsive
  - animation
output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-29/1769683759694/music-player
branch: null
---

## Problem

Build a full-stack music player platform inspired by Spotify/Apple Music. This is a multi-page Next.js application with user authentication, a REST API for playlist and track management, a SQLite database for persistence, and a rich interactive three-panel UI. The focus is on end-to-end full-stack delivery — from database schema to polished frontend — demonstrating complex layout composition, API design, auth flows, and state management across the entire stack.

## Definition of Done

### Authentication & User System
- [ ] Login and registration pages with email/password
- [ ] Session-based authentication with JWT tokens stored in httpOnly cookies
- [ ] Protected routes — redirect to login if unauthenticated
- [ ] User profile page showing username, email, playlists created, total tracks saved

### Database & Schema
- [ ] SQLite database with better-sqlite3 (or Prisma + SQLite)
- [ ] Schema: Users, Playlists, Tracks, PlaylistTracks (many-to-many), UserLibrary
- [ ] Seed script that populates 5+ playlists with 10+ tracks each, with realistic artist/album metadata
- [ ] Migrations or schema initialization script

### API Endpoints
- [ ] POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- [ ] GET /api/playlists — list user's playlists
- [ ] POST /api/playlists — create playlist (title, description)
- [ ] GET /api/playlists/:id — get playlist with tracks
- [ ] PUT /api/playlists/:id — update playlist metadata
- [ ] DELETE /api/playlists/:id — delete playlist
- [ ] POST /api/playlists/:id/tracks — add track to playlist
- [ ] DELETE /api/playlists/:id/tracks/:trackId — remove track
- [ ] GET /api/search?q= — search tracks by title/artist/album
- [ ] POST /api/library/save/:trackId — save track to user library
- [ ] GET /api/library — get user's saved tracks

### Frontend UI
- [ ] Three-panel layout: sidebar (playlists), main content (track list), bottom now-playing bar
- [ ] Sidebar with playlist list, "Liked Songs" section, create playlist button, and search
- [ ] Main content: album/playlist header (image, title, description, play button) + track table
- [ ] Track table with columns: #, Title (+ artist), Album, Duration — row hover highlight
- [ ] Now-playing bar pinned to bottom: album art thumbnail, track info, playback controls, progress bar, volume
- [ ] Playback controls: previous, play/pause toggle, next, shuffle, repeat — all with hover states
- [ ] Progress bar: clickable to seek, shows elapsed/total time
- [ ] Volume slider with mute toggle icon (speaker icon changes by level)
- [ ] Click a track to "play" it (updates now-playing bar, highlights active track in list)
- [ ] Playlist switching updates main content area
- [ ] Search page with results grouped by tracks, playlists, artists
- [ ] Create playlist modal with title and optional description
- [ ] Dark theme by default (Spotify-style dark palette)
- [ ] Responsive: sidebar collapses on mobile, now-playing bar simplifies
- [ ] Smooth transitions between views and component state changes

### Integration & Polish
- [ ] All frontend pages fetch data from the API (no hardcoded mock data in components)
- [ ] Optimistic UI updates for save/unsave and playlist operations
- [ ] Error states and loading skeletons for all async operations
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Next.js 14 App Router + TypeScript + Tailwind CSS
- Database: SQLite via better-sqlite3 (zero-config, file-based)
- Auth: Custom JWT implementation with bcrypt password hashing
- State: React Context for player state (current track, playing/paused, progress, volume, queue)
- API: Next.js Route Handlers in app/api/
- Layout: CSS Grid for three-panel (sidebar fixed width, main fluid, bottom fixed height)
- Album art: Gradient placeholders with initials or abstract patterns
- Hover micro-interactions: button scale, row background, control icon color change
- No actual audio playback — progress is simulated with useInterval (1s tick)

## Agent Notes

This is a complex full-stack task requiring database setup, API implementation, authentication, and rich UI. Expect 6-8 implementation steps.

