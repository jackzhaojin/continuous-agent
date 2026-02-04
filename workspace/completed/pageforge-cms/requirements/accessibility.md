# Accessibility Requirements

## Overview

PageForge must meet WCAG 2.1 Level AA compliance for both the admin dashboard (CMS interface) and the public-facing rendered pages. Accessibility is not an afterthought — it must be built into every component from the start.

## Dashboard Accessibility

### Keyboard Navigation

The entire CMS dashboard must be fully keyboard-navigable:

- All interactive elements (buttons, links, inputs, dropdowns) must be reachable via Tab
- Tab order follows visual reading order (left to right, top to bottom)
- Focus indicators are always visible (never `outline: none` without a replacement)
- Focus style: 2px blue outline with 2px offset (`outline: 2px solid #3B82F6; outline-offset: 2px`)

### Page Editor Keyboard Support

See `advanced-editor.md` for the full keyboard shortcut map. Additional requirements:

- Component palette items are navigable via arrow keys
- Property panel form fields follow standard tab order
- Modal dialogs trap focus (Tab cycles within the modal)
- Escape closes modals and dropdown menus
- Skip links: "Skip to canvas", "Skip to properties" at the top of the editor

### Screen Reader Support

- All images have `alt` text (including component thumbnails in the palette)
- Form fields have associated `<label>` elements (no placeholder-only fields)
- Error messages are announced via `aria-live="assertive"`
- Success notifications via `aria-live="polite"`
- Status changes (saving, published) announced via live regions
- Dynamic content updates (canvas changes) announced appropriately

### Color Contrast

- All text meets WCAG AA contrast ratio:
  - Normal text: 4.5:1 minimum
  - Large text (18px+ or 14px+ bold): 3:1 minimum
- Interactive element states (hover, focus, active) maintain contrast
- Status badges and indicators don't rely solely on color — include icons or text labels
- The theme color picker in site settings should warn if selected colors have poor contrast

### Motion and Animation

- Respect `prefers-reduced-motion` media query globally
- When reduced motion is preferred:
  - Disable carousel auto-play
  - Use instant transitions instead of animated ones
  - Disable parallax effects
  - Accordion/tab content changes are instant
- Include a toggle in user settings: "Reduce motion" (overrides OS setting)

## Public Page Accessibility

### Semantic HTML

All rendered components must use proper semantic HTML:

| Component | Semantic Structure |
|-----------|-------------------|
| Header | `<header>`, `<nav>` |
| Footer | `<footer>`, `<nav>` |
| Hero | `<section>` with `<h1>` or `<h2>` |
| Text Block | Semantic headings (h2-h6), `<p>`, `<ul>`, `<ol>` via Tiptap |
| Image | `<figure>`, `<img>` with alt, `<figcaption>` |
| Accordion | `<details>`/`<summary>` or ARIA pattern (see component spec) |
| Tabs | ARIA tablist/tab/tabpanel pattern |
| Carousel | ARIA carousel pattern with pause control |
| Form | `<form>`, `<fieldset>`, `<legend>`, `<label>` |
| Video | `<figure>`, `<iframe>` with title or `<video>` |
| Card Grid | `<ul>` with `<li>` items or `<section>` with headings |
| Breadcrumbs | `<nav aria-label="Breadcrumb">`, `<ol>` |

### Heading Hierarchy

- Public pages must have a logical heading hierarchy (h1 → h2 → h3, no skipping)
- Only one `<h1>` per page (typically from the Hero or page title)
- The page editor should show a warning if heading hierarchy is broken
- Text Block component's Tiptap editor should enforce this (start at h2 within content)

### Image Accessibility

- All images require `alt` text
- Media library stores `alt_text` per media item
- When an image is used in a component, the component's property panel shows the alt text field
- Decorative images (backgrounds, spacers) use `alt=""` and `role="presentation"`
- Image component without alt text shows a warning badge in the editor

### Link Accessibility

- Links must have descriptive text (no "click here" or "read more" without context)
- External links: add `aria-label` with "(opens in new tab)" when `target="_blank"`
- Also add `rel="noopener noreferrer"` for external links

### Form Accessibility

See `component-form.md` for detailed form accessibility requirements:
- All fields have labels
- Error messages linked via `aria-describedby`
- Required fields marked with `aria-required`
- Form submission feedback via live regions

### Skip Navigation

Every public page includes a skip navigation link as the first focusable element:
```html
<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 ...">
  Skip to main content
</a>
```

### Language

- `<html lang="en">` (or configured language from site settings)
- If content includes text in another language, use `lang` attribute on the containing element

## Testing Requirements

### Automated Testing

Add the following accessibility checks to the build/validation process:

1. **eslint-plugin-jsx-a11y** — Catches common JSX accessibility issues at build time
2. **axe-core** — Run on rendered pages to catch WCAG violations

### Manual Testing Checklist

Each component should be tested for:
- [ ] Can be reached and operated via keyboard only
- [ ] Screen reader announces element purpose and state correctly
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Focus is visible and logical
- [ ] No content is lost when zoomed to 200%
- [ ] Works with browser text-size increase (up to 200%)
- [ ] No ARIA violations (validated with axe-core)

## Accessibility Panel in Editor

Add an "Accessibility" tab in the editor sidebar that shows:

1. **Page Audit**: Run axe-core on the current page content and display results
2. **Heading Outline**: Visual tree of the heading hierarchy (h1 → h2 → h3)
3. **Image Audit**: List all images and their alt text status (present, missing, empty)
4. **Link Audit**: List all links and flag issues (generic text, missing labels)
5. **Color Contrast Checker**: Input foreground/background colors, get contrast ratio
6. **Overall Score**: Summary accessibility score (based on automated checks)

This panel helps authors identify and fix accessibility issues before publishing.
