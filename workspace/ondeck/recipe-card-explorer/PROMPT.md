---
title: Recipe Discovery App UI
slug: recipe-card-explorer
priority: P3
status: pending
complexity: medium
created: 2026-01-28
tags: [react, tailwind, frontend, ui-ux, cards, filtering]
output_path:
branch:
---

## Problem

Build a recipe browsing/discovery interface that demonstrates card-based layouts, filtering interactions, and modal detail views. All data is mock. Focus is on smooth interaction design — instant search filtering, tag-based navigation, and a polished detail modal that feels native.

## Definition of Done

- [ ] React + Tailwind project scaffolded with Vite
- [ ] Grid of recipe cards (12+ recipes) with food image placeholder, title, cook time, difficulty badge
- [ ] Search bar with instant client-side filtering (debounced, highlights matches)
- [ ] Category tag bar (Breakfast, Lunch, Dinner, Dessert, Snack) with multi-select filter
- [ ] Difficulty badges: Easy (green), Medium (yellow), Hard (red) with Tailwind color coding
- [ ] Cook time indicator with clock icon
- [ ] Card hover effect: subtle lift + shadow transition
- [ ] Click card opens modal with full recipe detail: hero image, ingredient list, numbered steps
- [ ] Modal has smooth open/close animation (scale + fade)
- [ ] "Favorite" heart toggle on cards with filled/outline state
- [ ] Responsive: 1 col mobile, 2 col tablet, 3-4 col desktop
- [ ] Empty state when no recipes match filter ("No recipes found — try different filters")
- [ ] All mock data with realistic recipe names, ingredients, and step descriptions
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Vite + React + TypeScript + Tailwind CSS
- Mock data: 15+ recipes with typed Recipe interface (id, title, category, difficulty, cookTime, ingredients, steps, imageUrl)
- Image placeholders: Use gradient backgrounds or placeholder service with food category
- Filtering: useMemo for derived filtered list, useTransition for non-blocking filter updates
- Modal: Portal-based with backdrop blur, focus trap, Escape to close
- Animations: Tailwind transition utilities for hover, custom keyframes for modal enter/exit
- Layout: CSS Grid with auto-fill and minmax for responsive card grid
- Favorites: localStorage persistence for heart toggle state

## Agent Notes

This task is ready for execution — no open questions remain. The scope is well-defined and medium complexity.
