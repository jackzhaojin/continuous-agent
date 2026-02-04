# Carousel / Image Gallery Component

## Overview

A slideshow component for image galleries, testimonial sliders, or any content that benefits from a paginated horizontal scroll. Supports auto-play, navigation arrows, dot indicators, and multiple layout modes.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `carousel` |
| label | Carousel / Gallery |
| icon | `Images` |
| description | Image slideshow with navigation and auto-play |

## Props Schema

```typescript
interface CarouselProps {
  slides: CarouselSlide[];
  variant: 'full' | 'cards' | 'thumbnails';
  autoPlay: boolean;
  autoPlayInterval: number;  // Seconds between slides (3-15)
  showArrows: boolean;
  showDots: boolean;
  showCaptions: boolean;
  pauseOnHover: boolean;
  loop: boolean;             // Loop back to start after last slide
  aspectRatio: '16:9' | '4:3' | '1:1' | 'auto';
}

interface CarouselSlide {
  id: string;
  imageUrl: string;          // From media library
  alt: string;
  caption?: string;
  link?: string;             // Optional click-through URL
}
```

## Default Props

```json
{
  "slides": [
    {"id": "slide_1", "imageUrl": "https://picsum.photos/1200/600?random=1", "alt": "Slide 1", "caption": "Beautiful landscape"},
    {"id": "slide_2", "imageUrl": "https://picsum.photos/1200/600?random=2", "alt": "Slide 2", "caption": "City skyline"},
    {"id": "slide_3", "imageUrl": "https://picsum.photos/1200/600?random=3", "alt": "Slide 3", "caption": "Mountain view"}
  ],
  "variant": "full",
  "autoPlay": true,
  "autoPlayInterval": 5,
  "showArrows": true,
  "showDots": true,
  "showCaptions": true,
  "pauseOnHover": true,
  "loop": true,
  "aspectRatio": "16:9"
}
```

## Property Editor

```
┌─────────────────────────────────┐
│ Carousel Settings               │
│                                 │
│ Variant: [Full Width ▼]        │
│ Aspect Ratio: [16:9 ▼]        │
│                                 │
│ [x] Auto Play                   │
│   Interval: [5] seconds        │
│   [x] Pause on Hover           │
│ [x] Show Arrows                │
│ [x] Show Dots                  │
│ [x] Show Captions              │
│ [x] Loop                       │
│                                 │
│ ─── Slides ───                  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ [img] Slide 1       [x] │ │
│ │    Caption: [Beautiful...]  │ │
│ │    Link: [_______________]  │ │
│ │    [Change Image]           │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ [img] Slide 2       [x] │ │
│ │    ...                      │ │
│ └─────────────────────────────┘ │
│                                 │
│ [+ Add Slide]                   │
└─────────────────────────────────┘
```

- "Change Image" opens the media library image picker
- Slides are reorderable via drag handles
- Thumbnail preview of each slide image in the list

## Renderer Variants

### Full Width
- Single slide fills the full component width
- Navigation arrows on left/right edges (semi-transparent overlay)
- Dot indicators centered below
- Caption overlaid at bottom with gradient backdrop

### Cards
- Shows 3 slides at once (1 on mobile) as cards
- Peek: adjacent slides are partially visible at the edges
- Click arrows to scroll one card at a time
- Active card is slightly elevated (shadow)

### Thumbnails
- Main large image on top
- Row of clickable thumbnail images below
- Clicking a thumbnail switches the main image
- Active thumbnail has a border highlight

## Animation

- Slide transitions: CSS `transform: translateX()` with 400ms ease
- Fade variant option: opacity transition instead of slide
- Dot indicators: animate width/opacity for active state
- Auto-play: smooth continuous cycling with pause on hover/focus
- Respect `prefers-reduced-motion`: disable auto-play and use instant transitions

## Accessibility

- `role="region"` with `aria-roledescription="carousel"`
- `aria-label="Image gallery"` or custom label
- Each slide: `role="group"`, `aria-roledescription="slide"`, `aria-label="Slide N of M"`
- Navigation buttons: proper `aria-label` ("Previous slide", "Next slide")
- Dot indicators: `role="tablist"` with `role="tab"` per dot
- Pause button for auto-play (required for WCAG 2.2.2)
- Keyboard: arrow keys for slides, Enter/Space on dots and arrows

## Editor Canvas Behavior

On the canvas, the carousel is interactive:
- Arrows work for navigating slides
- Auto-play is disabled in the editor
- Click a slide to select the carousel component
- The current slide index is shown for reference
