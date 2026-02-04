# Tabs Component

## Overview

A tabbed content component for organizing related content into switchable panels. Each tab has a label and a rich-text content area.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `tabs` |
| label | Tabs |
| icon | `LayoutList` |
| description | Tabbed content panels with switchable views |

## Props Schema

```typescript
interface TabsProps {
  tabs: TabItem[];
  variant: 'default' | 'pills' | 'underline' | 'bordered';
  alignment: 'left' | 'center' | 'stretch';
  defaultActiveTab: number;  // 0-indexed
}

interface TabItem {
  id: string;
  label: string;        // Tab label (plain text)
  icon?: string;        // Optional Lucide icon name
  content: string;      // Rich HTML (Tiptap) for the panel
}
```

## Default Props

```json
{
  "tabs": [
    {"id": "tab_1", "label": "Features", "content": "<p>Explore our features...</p>"},
    {"id": "tab_2", "label": "Pricing", "content": "<p>Simple, transparent pricing...</p>"},
    {"id": "tab_3", "label": "FAQ", "content": "<p>Frequently asked questions...</p>"}
  ],
  "variant": "default",
  "alignment": "left",
  "defaultActiveTab": 0
}
```

## Property Editor

Similar structure to Accordion — manages a list of tab items:

- Reorderable tabs via drag handles
- Inline label input per tab
- "Edit Content" button opens rich-text editor modal
- Optional icon selector (Lucide icon picker dropdown)
- Variant selector (visual toggle showing each variant style)
- Alignment selector

## Renderer Variants

### Default
- Horizontal tab bar with bottom border
- Active tab has a colored bottom border (2px, primary color)
- Tab panels below with padding

### Pills
- Tabs rendered as rounded pill buttons
- Active tab has filled background (primary color)
- Inactive tabs have subtle hover state

### Underline
- Minimal tabs with only text
- Active tab has a thick underline that animates (slides) between tabs
- Clean, modern look

### Bordered
- Tab bar has borders around each tab
- Active tab merges with the content panel (no bottom border)
- Content panel has a border on remaining three sides

## Accessibility

- Use `role="tablist"` on the tab bar
- Each tab: `role="tab"`, `aria-selected`, `aria-controls`
- Each panel: `role="tabpanel"`, `aria-labelledby`
- Keyboard: Arrow keys to navigate tabs, Enter/Space to select
- Only the active panel is in the tab order (inactive panels have `tabindex="-1"`)

## Animation

- Content panels: Subtle fade-in transition (opacity 0 → 1, 150ms)
- Underline variant: Sliding underline indicator that moves to the active tab
- No layout shift when switching tabs (panels have minimum height or fixed height option)

## Editor Canvas Behavior

On the canvas, tabs should be interactive — clicking a tab in the canvas switches to that tab's content. This lets authors preview how the tabbed content looks. The currently active tab in the canvas doesn't affect the saved content (all tabs are always saved).
