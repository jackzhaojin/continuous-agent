# Card Grid Component

## Overview

A responsive grid of cards for showcasing features, team members, products, services, or any collection of items. Each card has an image, title, description, and optional link.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `card-grid` |
| label | Card Grid |
| icon | `LayoutGrid` |
| description | Responsive grid of cards with images and text |

## Props Schema

```typescript
interface CardGridProps {
  cards: CardItem[];
  columns: 2 | 3 | 4;
  variant: 'default' | 'horizontal' | 'minimal' | 'overlay';
  gap: 'sm' | 'md' | 'lg';
  showImages: boolean;
  imageAspectRatio: '16:9' | '4:3' | '1:1' | 'auto';
  equalHeight: boolean;   // Force all cards to same height
}

interface CardItem {
  id: string;
  imageUrl?: string;      // From media library
  imageAlt?: string;
  title: string;
  description: string;    // Plain text or short HTML
  linkUrl?: string;
  linkText?: string;      // e.g., "Learn more"
  badge?: string;         // Optional badge label (e.g., "New", "Popular")
  icon?: string;          // Lucide icon name (alternative to image)
}
```

## Default Props

```json
{
  "cards": [
    {
      "id": "card_1",
      "imageUrl": "https://picsum.photos/400/300?random=1",
      "imageAlt": "Feature 1",
      "title": "Easy to Use",
      "description": "Drag and drop components to build beautiful pages in minutes.",
      "linkUrl": "#",
      "linkText": "Learn more"
    },
    {
      "id": "card_2",
      "imageUrl": "https://picsum.photos/400/300?random=2",
      "imageAlt": "Feature 2",
      "title": "Fully Responsive",
      "description": "Every page looks great on desktop, tablet, and mobile.",
      "linkUrl": "#",
      "linkText": "Learn more"
    },
    {
      "id": "card_3",
      "imageUrl": "https://picsum.photos/400/300?random=3",
      "imageAlt": "Feature 3",
      "title": "Version History",
      "description": "Every change is tracked. Restore any previous version instantly.",
      "linkUrl": "#",
      "linkText": "Learn more"
    }
  ],
  "columns": 3,
  "variant": "default",
  "gap": "md",
  "showImages": true,
  "imageAspectRatio": "16:9",
  "equalHeight": true
}
```

## Property Editor

```
┌─────────────────────────────────┐
│ Card Grid Settings              │
│                                 │
│ Columns: [3 ▼]                 │
│ Variant: [Default ▼]           │
│ Gap: (sm) (•md) (lg)           │
│ [x] Show Images                 │
│ Aspect Ratio: [16:9 ▼]        │
│ [x] Equal Height                │
│                                 │
│ ─── Cards ───                   │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ [img] Easy to Use   [x] │ │
│ │    Desc: [Drag and drop...] │ │
│ │    Link: [#___] [Learn more]│ │
│ │    Badge: [____________]    │ │
│ │    [Change Image]           │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ [img] Responsive     [x] │ │
│ │    ...                      │ │
│ └─────────────────────────────┘ │
│                                 │
│ [+ Add Card]                    │
└─────────────────────────────────┘
```

- Cards are reorderable via drag handles
- Image picker for each card (opens media library modal)
- Alternative: icon picker if no image is used (toggle between image and icon mode)

## Renderer Variants

### Default (Vertical)
- Standard card layout: image on top, content below
- Rounded corners, subtle shadow
- Hover: slight lift (translateY -2px) and deeper shadow
- Link rendered as a text link at the bottom of the card

### Horizontal
- Image on the left (40%), content on the right (60%)
- Good for team member bios or feature highlights
- On mobile: stacks vertically

### Minimal
- No card border or shadow
- Image with rounded corners
- Title and description below with clean typography
- Subtle separator line between cards

### Overlay
- Image fills the entire card
- Title and description overlaid at the bottom with gradient backdrop
- Text is white/light colored
- Hover: slight zoom on image (scale 1.05)

## Responsive Behavior

| Viewport | Columns Shown |
|----------|---------------|
| Desktop (>= 1024px) | As configured (2/3/4) |
| Tablet (768-1023px) | min(configured, 2) |
| Mobile (< 768px) | 1 |

Use CSS Grid: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`

## Animation

- Cards fade in with stagger (each card delayed by 100ms) when scrolled into view
- Use Intersection Observer for scroll-triggered animation
- Hover transitions: 200ms ease for shadow and transform
- Respect `prefers-reduced-motion`

## Accessibility

- Cards with links: entire card is clickable (use CSS trick with `::after` pseudo-element stretched over the card)
- Focus visible outline on card links
- Images have `alt` text
- Badge content read by screen readers
