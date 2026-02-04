# Embed Component

## Overview

A flexible embed component for inserting arbitrary third-party content: HTML iframes, code snippets, maps, social media posts, or any embeddable content via URL or raw HTML.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `embed` |
| label | Embed / HTML |
| icon | `Code` |
| description | Embed external content, maps, social posts, or custom HTML |

## Props Schema

```typescript
interface EmbedProps {
  mode: 'url' | 'html' | 'preset';
  url?: string;                    // For mode='url' — generates an iframe
  html?: string;                   // For mode='html' — raw HTML
  preset?: 'google-map' | 'twitter' | 'instagram' | 'codepen' | 'figma';
  presetConfig?: Record<string, string>;  // Preset-specific config
  title: string;                   // Accessible title for iframe
  aspectRatio: '16:9' | '4:3' | '1:1' | 'auto';
  maxWidth: 'sm' | 'md' | 'lg' | 'full';
  height?: number;                 // Fixed height in px (for mode='html')
  sandbox: boolean;                // Enable iframe sandbox (security)
}
```

## Default Props

```json
{
  "mode": "url",
  "url": "",
  "title": "Embedded content",
  "aspectRatio": "16:9",
  "maxWidth": "lg",
  "sandbox": true
}
```

## Property Editor

```
┌─────────────────────────────────┐
│ Embed Settings                  │
│                                 │
│ Mode:                           │
│ (•) URL (iframe)                │
│ ( ) Custom HTML                 │
│ ( ) Preset                      │
│                                 │
│ ── URL Mode ──                  │
│ URL: [https://..._____________] │
│ Title: [Embedded content______] │
│ Aspect Ratio: [16:9 ▼]        │
│ Max Width: [Large ▼]           │
│ [x] Sandbox (recommended)       │
│                                 │
│ ── OR Preset Mode ──            │
│ [Google Maps] [Twitter]         │
│ [Instagram]   [CodePen]         │
│ [Figma]                         │
│                                 │
│ ── OR HTML Mode ──              │
│ ┌─────────────────────────────┐ │
│ │ <div class="custom">       │ │
│ │   <!-- your HTML here -->  │ │
│ │ </div>                     │ │
│ └─────────────────────────────┘ │
│ Height: [400] px                │
└─────────────────────────────────┘
```

## Presets

### Google Maps
Config: `{ placeQuery: string }` or `{ lat: string, lng: string, zoom: string }`
```html
<iframe
  src="https://www.google.com/maps/embed/v1/place?key=API_KEY&q={placeQuery}"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
/>
```
Note: Google Maps embed doesn't require an API key for simple place embeds via the share URL.

### Twitter/X Post
Config: `{ tweetUrl: string }`
- Use the Twitter oEmbed endpoint to get embed HTML
- Or: render the tweet URL and load Twitter's widget.js script

### Instagram Post
Config: `{ postUrl: string }`
- Use Instagram oEmbed endpoint
- Load Instagram embed.js script

### CodePen
Config: `{ penUrl: string, defaultTab: 'html' | 'css' | 'js' | 'result' }`
```html
<iframe
  src="https://codepen.io/{user}/embed/{penId}?default-tab={defaultTab}"
  loading="lazy"
/>
```

### Figma
Config: `{ fileUrl: string }`
```html
<iframe
  src="https://www.figma.com/embed?embed_host=pageforge&url={fileUrl}"
  loading="lazy"
/>
```

## Security

### Sandbox Attribute

When `sandbox: true` (default), iframes get:
```html
<iframe sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
```

This prevents:
- Top-level navigation (hijacking the page)
- Accessing parent window
- Auto-playing media without user interaction

### HTML Mode Safety

For `mode='html'`:
- Display a warning in the property editor: "Custom HTML is rendered as-is. Only use trusted content."
- Admin-only: Only users with admin role can add or edit embed components in HTML mode
- Authors see embed components as read-only on the canvas
- HTML is rendered in a sandboxed iframe (srcdoc) to isolate from the page:

```html
<iframe
  srcdoc="{sanitized HTML}"
  sandbox="allow-scripts"
  title="{title}"
/>
```

## Renderer

### URL Mode
```html
<figure class="embed-wrapper" style="max-width: {maxWidth}; aspect-ratio: {aspectRatio};">
  <iframe
    src="{url}"
    title="{title}"
    loading="lazy"
    sandbox="{sandbox ? 'allow-scripts allow-same-origin allow-popups allow-forms' : undefined}"
    style="width: 100%; height: 100%; border: 0; border-radius: 0.5rem;"
  />
</figure>
```

### HTML Mode
```html
<figure class="embed-wrapper" style="max-width: {maxWidth}; height: {height}px;">
  <iframe
    srcdoc="{html}"
    title="{title}"
    sandbox="allow-scripts"
    style="width: 100%; height: 100%; border: 0;"
  />
</figure>
```

## Editor Canvas Behavior

- URL mode: Show a placeholder with the URL displayed and a "Load Preview" button (don't auto-load iframes in the editor for performance)
- HTML mode: Show the raw HTML in a code block view
- Preset mode: Show the preset icon and config summary
- Click to select and edit props in the property panel
