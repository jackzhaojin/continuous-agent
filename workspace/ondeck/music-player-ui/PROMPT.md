---
title: Spotify-Inspired Music Player UI
slug: music-player-ui
priority: P3
status: pending
complexity: medium
created: 2026-01-28
tags: [react, tailwind, frontend, ui-ux, media-player, layout]
output_path:
branch:
---

## Problem

Build a music player interface inspired by Spotify/Apple Music that demonstrates complex layout composition — a three-panel layout (sidebar, main content, now-playing bar) with rich interactive controls. No actual audio playback; the focus is on UI state management, polish, and the feel of a real media application.

## Definition of Done

- [ ] React + Tailwind project scaffolded with Vite
- [ ] Three-panel layout: sidebar (playlists), main content (track list), bottom now-playing bar
- [ ] Sidebar with playlist list, "Liked Songs" section, and create playlist button
- [ ] Main content: album/playlist header (image, title, description, play button) + track table
- [ ] Track table with columns: #, Title (+ artist), Album, Duration — row hover highlight
- [ ] Now-playing bar pinned to bottom: album art thumbnail, track info, playback controls, progress bar, volume
- [ ] Playback controls: previous, play/pause toggle, next, shuffle, repeat — all with hover states
- [ ] Progress bar: clickable to seek, shows elapsed/total time
- [ ] Volume slider with mute toggle icon (speaker icon changes by level)
- [ ] Click a track to "play" it (updates now-playing bar, highlights active track in list)
- [ ] Playlist switching updates main content area
- [ ] Smooth transitions between views
- [ ] Dark theme by default (Spotify-style dark palette)
- [ ] Responsive: sidebar collapses on mobile, now-playing bar simplifies
- [ ] All mock data: 3+ playlists with 8+ tracks each, realistic artist/album names
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Vite + React + TypeScript + Tailwind CSS
- State: React Context for "player state" (current track, playing/paused, progress, volume, queue)
- Mock data: Typed interfaces for Playlist, Track, Album with realistic music metadata
- Progress bar: CSS width percentage, useInterval for simulated playback progress (1s tick)
- Layout: CSS Grid for three-panel (sidebar fixed width, main fluid, bottom fixed height)
- Album art: Gradient placeholders with initials or abstract patterns
- Hover micro-interactions: button scale, row background, control icon color change
- No audio element needed — all state is simulated

## Agent Notes

This task is ready for execution — no open questions remain. Complex layout but well-scoped with clear component boundaries.
