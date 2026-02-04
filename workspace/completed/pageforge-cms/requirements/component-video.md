# Video Embed Component

## Overview

A video component that supports YouTube, Vimeo, and self-hosted video embedding. Renders responsive video players with optional overlays and captions.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `video` |
| label | Video |
| icon | `Play` |
| description | Embed YouTube, Vimeo, or self-hosted video |

## Props Schema

```typescript
interface VideoProps {
  source: 'youtube' | 'vimeo' | 'url';
  videoId?: string;           // YouTube or Vimeo video ID
  url?: string;               // Direct video URL (for self-hosted)
  posterImage?: string;       // Thumbnail/poster image URL (from media library)
  title: string;              // Accessible title
  caption?: string;           // Optional caption below video
  autoPlay: boolean;
  muted: boolean;
  loop: boolean;
  showControls: boolean;
  aspectRatio: '16:9' | '4:3' | '21:9' | '1:1';
  maxWidth: 'sm' | 'md' | 'lg' | 'full';  // Constrain width
}
```

## Default Props

```json
{
  "source": "youtube",
  "videoId": "dQw4w9WgXcQ",
  "title": "Video Title",
  "caption": "",
  "autoPlay": false,
  "muted": false,
  "loop": false,
  "showControls": true,
  "aspectRatio": "16:9",
  "maxWidth": "lg"
}
```

## Property Editor

```
┌─────────────────────────────────┐
│ Video Settings                  │
│                                 │
│ Source: (•) YouTube             │
│         ( ) Vimeo               │
│         ( ) Direct URL          │
│                                 │
│ Video ID / URL:                 │
│ [dQw4w9WgXcQ_______________]   │
│ [Preview]                       │
│                                 │
│ Title: [Video Title_________]   │
│ Caption: [__________________]   │
│                                 │
│ Poster Image: [Choose Image]    │
│                                 │
│ Aspect Ratio: [16:9 ▼]        │
│ Max Width: [Large ▼]           │
│                                 │
│ [ ] Auto Play                   │
│ [ ] Muted (required for AP)     │
│ [ ] Loop                        │
│ [x] Show Controls               │
└─────────────────────────────────┘
```

### URL Parsing

When a user pastes a full YouTube/Vimeo URL, auto-detect and extract the video ID:
- `https://www.youtube.com/watch?v=ABC123` → source: youtube, videoId: ABC123
- `https://youtu.be/ABC123` → source: youtube, videoId: ABC123
- `https://vimeo.com/123456789` → source: vimeo, videoId: 123456789
- Any other URL → source: url, url: full URL

## Renderer

### YouTube Embed
```html
<iframe
  src="https://www.youtube-nocookie.com/embed/{videoId}?autoplay={0|1}&mute={0|1}&loop={0|1}&controls={0|1}"
  title="{title}"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  loading="lazy"
/>
```

Use `youtube-nocookie.com` for privacy-enhanced mode.

### Vimeo Embed
```html
<iframe
  src="https://player.vimeo.com/video/{videoId}?autoplay={0|1}&muted={0|1}&loop={0|1}"
  title="{title}"
  allow="autoplay; fullscreen; picture-in-picture"
  loading="lazy"
/>
```

### Self-Hosted Video
```html
<video
  src="{url}"
  poster="{posterImage}"
  autoPlay={autoPlay}
  muted={muted}
  loop={loop}
  controls={showControls}
  playsInline
>
  <source src="{url}" type="video/mp4" />
  Your browser does not support the video tag.
</video>
```

### Responsive Wrapper

All video embeds are wrapped in a responsive container:
```css
.video-wrapper {
  position: relative;
  width: 100%;
  max-width: var(--max-width);
  aspect-ratio: var(--aspect-ratio);
  margin: 0 auto;
}

.video-wrapper iframe,
.video-wrapper video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0.5rem;
}
```

### Poster/Thumbnail Overlay

If `posterImage` is set (and autoPlay is false):
- Show the poster image with a centered play button overlay
- Clicking the play button loads the actual video player (lazy loading)
- This improves page load performance (no iframe until user interacts)

## Accessibility

- `title` attribute on iframe for screen readers
- Caption rendered as `<figcaption>` within a `<figure>` wrapper
- Auto-play requires muted (browsers block unmuted autoplay)
- Respect `prefers-reduced-motion` — disable autoplay

## Editor Canvas Behavior

- On the canvas, show a static thumbnail preview (don't load the actual video iframe to avoid performance issues)
- Show the video source icon (YouTube/Vimeo/Play) overlaid on the thumbnail
- Click to select the component and edit props
- "Preview" mode loads the actual video player
