# Accordion / FAQ Component

## Overview

A collapsible accordion component for FAQ sections, feature lists, and any content that benefits from a show/hide pattern. Supports multiple items, each with a title and expandable rich-text body.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `accordion` |
| label | Accordion / FAQ |
| icon | `ChevronDown` |
| description | Collapsible sections with titles and expandable content |

## Props Schema

```typescript
interface AccordionProps {
  items: AccordionItem[];
  allowMultipleOpen: boolean;  // Can multiple items be open at once?
  variant: 'default' | 'bordered' | 'separated';
  iconPosition: 'left' | 'right';
}

interface AccordionItem {
  id: string;
  title: string;          // Plain text
  content: string;        // Rich HTML (Tiptap)
  isDefaultOpen: boolean; // Open on page load?
}
```

## Default Props

```json
{
  "items": [
    {"id": "acc_1", "title": "What is PageForge?", "content": "<p>PageForge is a visual page builder...</p>", "isDefaultOpen": true},
    {"id": "acc_2", "title": "How do I get started?", "content": "<p>Sign up for an account and...</p>", "isDefaultOpen": false},
    {"id": "acc_3", "title": "Is there a free plan?", "content": "<p>Yes! PageForge offers a generous free tier...</p>", "isDefaultOpen": false}
  ],
  "allowMultipleOpen": false,
  "variant": "default",
  "iconPosition": "right"
}
```

## Property Editor

The accordion property editor needs a special UI since it manages a list of items:

```
┌─────────────────────────────────┐
│ Accordion Settings              │
│                                 │
│ Variant: [Default ▼]           │
│ Icon Position: [Right ▼]       │
│ Allow Multiple Open: [ ]       │
│                                 │
│ ─── Items ───                   │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ What is PageForge?   [x]│ │
│ │    [Edit Content]           │ │
│ │    [x] Default Open         │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ How do I get started? [x]│ │
│ │    [Edit Content]           │ │
│ │    [ ] Default Open         │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ Is there a free plan? [x]│ │
│ │    [Edit Content]           │ │
│ │    [ ] Default Open         │ │
│ └─────────────────────────────┘ │
│                                 │
│ [+ Add Item]                    │
└─────────────────────────────────┘
```

- Items are reorderable via drag handles
- Each item has an inline title input and a button to open a rich-text editor modal for the content
- Delete button (x) on each item with confirmation if content exists
- "Add Item" appends a new empty item

## Renderer Variants

### Default
- Clean accordion with subtle bottom border between items
- Chevron icon rotates on open/close (animated 200ms)
- Content area smoothly expands/collapses (CSS transition on max-height)

### Bordered
- Each item has a border all around (rounded corners)
- Items are flush against each other (connected borders)
- Active item has a highlighted left border (primary color)

### Separated
- Each item is a separate card with gap between them
- Shadow on hover
- Fully rounded corners per item

## Accessibility

- Use `<details>` and `<summary>` elements OR implement with proper ARIA:
  - `role="region"` on content area
  - `aria-expanded="true|false"` on trigger button
  - `aria-controls` linking trigger to content panel
  - `id` on content panel matching `aria-controls`
- Keyboard navigation: Enter/Space to toggle, Tab to move between items
- Focus visible outlines on trigger buttons

## Animation

- Chevron icon: `transition: transform 200ms ease`
- Content panel: animate height from 0 to auto (use CSS `grid-template-rows: 0fr` → `1fr` trick or JS-measured height)
- No animation if user has `prefers-reduced-motion`
