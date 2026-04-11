---
name: ui-scaffold
description: Generates a React + ShadCN/ui study application with podcast player, quiz, teach-back, and research browser — driven by Stitch design reference
---

# UI Scaffold

Generate or update a React + ShadCN/ui study application for interactive exam preparation, using Stitch HTML screens as visual blueprints.

Build incrementally. At each checkpoint, run `npm run build`. **Fix build errors before proceeding.** Commit each passing checkpoint to git.

## Inputs

- `{{TARGET_DIR}}` — Directory where the React project will be generated.
- `{{MANIFEST_PATH}}` — Path to manifest.json with topic tree, quiz data, podcast metadata.
- `{{TOPIC_TITLE}}` — Human-readable title for the study environment.
- `{{DESIGN_REF_DIR}}` — Path to design reference directory with DESIGN.md and screens/*.html.
- `{{SCAFFOLD_MODE}}` — `bootstrap` (fresh build) or `extend` (incremental update).

## Step 0: Read Design Reference + Manifest

**Before writing any code**, read these files:

1. `{{DESIGN_REF_DIR}}/DESIGN.md` — the full design system (colors, typography, surfaces, components)
2. All 5 screen HTML files in `{{DESIGN_REF_DIR}}/screens/`:
   - `home.html` → Study Command Center (HomePage)
   - `research.html` → Research Browser (ResearchPage)
   - `quiz.html` → Reasoning Arena MCQ (QuizPage)
   - `podcast.html` → Audio Lab (PodcastPage)
   - `teachback.html` → Topic Masterclass (TeachBackPage)
3. `{{MANIFEST_PATH}}` — understand `title`, `topicTree`, `podcastEpisodes`, `quizPath`, `researchDir`

### Design Token Extraction

From DESIGN.md, extract and apply these tokens throughout:

| Token | Value | Usage |
|-------|-------|-------|
| `surface` | `#060e20` | Base background |
| `surface-container` | `#0c1934` | Content areas |
| `surface-container-high` | `#101e3e` | Elevated cards |
| `surface-container-highest` | `#142449` | Active/focused elements |
| `primary` | `#9d8fff` | Accent, links, active states |
| `primary-container` | `#5628fe` | Gradient endpoints, CTAs |
| `secondary` | `#b4d400` | Success, correct answers |
| `tertiary` | `#a1faff` | Highlights, focus glow |
| `error` | `#fd6f85` | Wrong answers, warnings |
| `on-surface` | `#dee5ff` | Primary text |
| `on-surface-variant` | `#9baad6` | Secondary text |
| `outline-variant` | `#38476d` | Ghost borders (15% opacity) |

**Typography**: Space Grotesk for headlines, Inter for body, JetBrains Mono for code/AI processing.
**No 1px borders.** Use tonal shifts, negative space, and edge lighting.
**Glass panels:** `backdrop-filter: blur(20px)` with `surface-variant` at 60% opacity.
**Gradient CTAs:** 45-degree linear gradient from `primary` to `primary-container`.

### Screen-to-Component Mapping

Read each HTML screen file and extract:
- Layout structure (sidebar width, content area, panel arrangement)
- Component patterns (card types, button styles, input treatments)
- Interactive elements (progress bars, answer cards, media controls)
- Data display patterns (metrics, badges, chips)

Map these to shadcn/ui components:
| Stitch HTML Pattern | shadcn/ui Component |
|--------------------|--------------------|
| Answer option cards | RadioGroup + Card |
| Progress bar | Progress |
| Navigation tabs | Tabs / NavigationMenu |
| Topic tree sidebar | Collapsible + Button |
| Metric badges | Badge |
| Glass panels | Card with custom glassmorphism class |
| Input fields | Input / Textarea |
| Action buttons | Button (gradient variant) |
| Episode list | Card list with custom styling |

## Git Protocol

The target directory may be inside a parent monorepo. **Never run `git init` inside the target.** Detect the git root first:

```bash
GIT_ROOT=$(cd {{TARGET_DIR}} && git rev-parse --show-toplevel 2>/dev/null) && echo "GIT_ROOT=$GIT_ROOT" || echo "NO_GIT"
```

For all commit blocks below, use `git -C $GIT_ROOT` (not `cd {{TARGET_DIR}} && git`). If `NO_GIT`, skip git commands.

---

## Mode: Bootstrap vs Extend

### If `{{SCAFFOLD_MODE}}` is `bootstrap`:
Execute all 5 checkpoints below sequentially.

### If `{{SCAFFOLD_MODE}}` is `extend`:
1. Read the existing `{{TARGET_DIR}}/src/` code to understand current state
2. Compare existing components against Stitch HTML screens
3. Identify gaps: missing features, wrong layouts, outdated patterns
4. Make targeted edits — only modify files that need changes
5. Skip Checkpoint 1 (project already exists) and Checkpoint 2 (routing exists)
6. Start from Checkpoint 3 — update manifest loading and pages
7. Run build gate after each set of changes

---

## Checkpoint 1: Project Baseline (bootstrap only)

**Goal:** Vite + React scaffolded, installs complete, build passes.

```bash
cd {{TARGET_DIR}}
npm create vite@latest . -- --template react --yes 2>/dev/null || npx create-vite@latest . --template react
npm install
npm install react-router-dom react-markdown
```

Install Tailwind CSS v4:
```bash
cd {{TARGET_DIR}}
npm install -D tailwindcss @tailwindcss/vite
```

Configure Tailwind — add `@tailwindcss/vite` to `vite.config.js` plugins and add `@import "tailwindcss"` to `src/index.css`.

**Configure the Cognitive Flux theme** in `src/index.css` (after the Tailwind import):

```css
@import "tailwindcss";

@theme {
  --color-surface: #060e20;
  --color-surface-dim: #060e20;
  --color-surface-container: #0c1934;
  --color-surface-container-low: #081329;
  --color-surface-container-high: #101e3e;
  --color-surface-container-highest: #142449;
  --color-surface-bright: #172b54;
  --color-surface-variant: #142449;
  --color-primary: #9d8fff;
  --color-primary-dim: #7157ff;
  --color-primary-container: #5628fe;
  --color-secondary: #b4d400;
  --color-secondary-dim: #a7c500;
  --color-tertiary: #a1faff;
  --color-error: #fd6f85;
  --color-on-surface: #dee5ff;
  --color-on-surface-variant: #9baad6;
  --color-outline: #65759e;
  --color-outline-variant: #38476d;
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

Add Google Fonts to `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Install ShadCN/ui core (invoke `shadcn-ui` skill if available for best practices):
```bash
cd {{TARGET_DIR}}
npx shadcn@latest init --defaults --yes 2>/dev/null || npx shadcn-ui@latest init --defaults
npx shadcn@latest add button card tabs input textarea dialog badge progress radio-group collapsible tooltip
```

**Build gate:**
```bash
cd {{TARGET_DIR}} && npm run build 2>&1
echo "EXIT: $?"
```

Fix any errors. Do not proceed until build exits 0.

**Commit:**
```bash
git -C $GIT_ROOT add {{TARGET_DIR}}
git -C $GIT_ROOT commit -m "chore(scaffold): vite+react baseline with Cognitive Flux theme

- Vite + React template
- Tailwind CSS v4 with Cognitive Flux design tokens
- ShadCN/ui: Button, Card, Tabs, Input, Textarea, Dialog, Badge, Progress, RadioGroup, Collapsible, Tooltip
- Typography: Space Grotesk + Inter + JetBrains Mono
- Dark mode: surface #060e20, primary #9d8fff, secondary #b4d400"
```

---

## Checkpoint 2: App Shell — Routing and Layout

**Goal:** React Router configured, top nav and sidebar render matching the Stitch home screen layout.

**Reference:** Read `{{DESIGN_REF_DIR}}/screens/home.html` for the navigation structure, sidebar layout, and header design.

Create `src/layouts/AppLayout.jsx`:
- Top navigation bar matching the Stitch header: logo area ("AIGENT LOOM" or `{{TOPIC_TITLE}}`), nav links, search icon, user avatar placeholder
- Navigation links: Dashboard `/`, Podcast `/podcast`, Quiz `/quiz`, Teach-Back `/teach-back`, Research `/research`
- Collapsible left sidebar (matching Stitch "NEURAL CORE" sidebar): glassmorphism panel, nav items with Material icons
- `<Outlet />` for page content (right side, fills remaining width)
- Dark mode default (use `surface` background). Light mode toggle in nav bar
- Responsive: sidebar collapses to hamburger on mobile (`md:` breakpoint)
- **Glass panel utility class:** `.glass-panel { background: rgba(20, 36, 73, 0.6); backdrop-filter: blur(20px); }`
- **No 1px borders.** Use tonal background shifts between sidebar and content

Create `src/components/TopicSidebar.jsx`:
- Props: `topicTree`, `selectedTopic`, `onSelectTopic`
- Renders collapsible tree using ShadCN/ui Collapsible. Top-level items are domains, expand to show sub-topics
- Highlights selected topic with primary glow
- Domain items show topic count badge

Update `src/main.jsx` and `src/App.jsx`:
- Wrap with `<BrowserRouter>`
- Define routes: `/` → `<HomePage>`, `/podcast` → `<PodcastPage>`, `/quiz` → `<QuizPage>`, `/teach-back` → `<TeachBackPage>`, `/research` → `<ResearchPage>`
- Wrap all routes in `<AppLayout>`
- Create stub page components

**Build gate:**
```bash
cd {{TARGET_DIR}} && npm run build 2>&1
echo "EXIT: $?"
```

**Commit:**
```bash
git -C $GIT_ROOT add {{TARGET_DIR}}
git -C $GIT_ROOT commit -m "feat(scaffold): app shell with Cognitive Flux nav and glassmorphism sidebar

- React Router v6 with AppLayout
- Glassmorphism sidebar matching Stitch design
- Navigation: Dashboard, Podcast, Quiz, Teach-Back, Research
- Dark theme with Cognitive Flux tokens
- Stub page components for all 5 routes"
```

---

## Checkpoint 3: Manifest Loading + Home Page (Study Command Center)

**Goal:** Manifest loaded, Home page matches the Stitch "Study Command Center" design.

**Reference:** Read `{{DESIGN_REF_DIR}}/screens/home.html` for the layout.

Copy manifest to public directory:
```bash
cp {{MANIFEST_PATH}} {{TARGET_DIR}}/public/manifest.json
```

Create `src/hooks/useManifest.js`:
- `fetch('/manifest.json')` on mount
- Returns `{ manifest, loading, error }`

Create `src/pages/HomePage.jsx` — match the Study Command Center layout:
- **4 Module Hub Cards** (2x2 grid, glassmorphism panels):
  - "Knowledge Graph" (research) — topic count + progress bar showing % read
  - "Reasoning Arena" (quiz) — question count + accuracy percentage
  - "Audio Lab" (podcast) — episode count + total hours
  - "Teach Back" — sessions completed count
  - Each card: gradient accent border on hover, icon, link to corresponding page
- **Resume Session card** — shows last activity with "CONTINUE" button
- **Recent Activity feed** — mixed quiz/research/podcast items with timestamps
- **Study Insights panel** (right side) — mastery gauge, weak areas, study streak

Wire `TopicSidebar` with real topic tree data.

**Build gate + Commit** (same pattern as above)

---

## Checkpoint 4: Podcast + Quiz + Research Pages

**Goal:** Three pages matching their Stitch screen blueprints.

### PodcastPage — matches Audio Lab (`podcast.html`)

**Reference:** Read `{{DESIGN_REF_DIR}}/screens/podcast.html`

Create `src/components/PodcastPlayer.jsx`:
- HTML5 `<audio>` with custom controls matching Stitch: play/pause, skip prev/next, seek bar, time display, speed selector (1x/1.25x/1.5x/2x)
- Episode artwork area
- "AI Insight Check-in" panel (placeholder for future coaching)
- Timestamped notes panel (placeholder)
- Concept cards below player

`PodcastPage`: episode list sidebar + PodcastPlayer

### QuizPage — matches Reasoning Arena MCQ (`quiz.html`)

**Reference:** Read `{{DESIGN_REF_DIR}}/screens/quiz.html`

Create `src/components/QuizCard.jsx`:
- **Progress bar** at top: gradient from secondary to tertiary, "Question X of N"
- **Domain chip** + **difficulty badge** (outlined, sharp corners)
- **Scenario text** in body-lg Inter
- **4 Answer Option Cards** (vertical stack, each a glassmorphism card):
  - Option letter (A/B/C/D) in circle badge with primary color
  - Answer text
  - Use ShadCN/ui RadioGroup — entire card is the radio trigger
  - Hover: subtle primary glow border
  - Selected: primary gradient left-border (2px), elevated background
- **"SUBMIT ANSWER" button** (gradient CTA, disabled until selected)
- **Post-answer explanation panel** (slides in):
  - Correct answer: secondary glow
  - Wrong answer: error glow
  - "NEURAL ANALYSIS" header
  - Explanation text + "Key Concept" callout box
  - "NEXT QUESTION" button

Create `src/components/PerformancePanel.jsx`:
- Right panel (280px): accuracy gauge, questions answered, streak, domain mastery bars, weak areas

`QuizPage`: fetch quiz JSON, shuffle questions, track score + index

### ResearchPage — matches Research Browser (`research.html`)

**Reference:** Read `{{DESIGN_REF_DIR}}/screens/research.html`

Create `src/components/ResearchViewer.jsx`:
- **Three-column layout** (matching Stitch):
  - Left: "KNOWLEDGE GRAPH" topic tree with search/filter, completion dots, domain grouping
  - Center: markdown content viewer (react-markdown), breadcrumb, citation count badge
  - Right: "SYNTHESIS LINKS" panel with related topics and study priority indicators
- **Inline citation rendering:** `[n]` patterns → clickable superscript badges
- Parse Sources section for citation map
- Handle 404s: "Research not yet available"

`ResearchPage`: read `?domain=` query param, pre-select domain

**Build gate + Commit**

---

## Checkpoint 5: Teach-Back Page + Final Polish

**Goal:** All 5 pages complete matching Stitch designs, app fully functional with real AI-powered teach-back evaluation.

### TeachBackPage — matches Topic Masterclass (`teachback.html`)

**Reference:** Read `{{DESIGN_REF_DIR}}/screens/teachback.html` and `{{TARGET_DIR}}/.claude/skills/score-explanation/SKILL.md` (the deposited evaluation skill — use its schema as the source of truth for grading output).

#### Step A: Create `src/components/ApiKeyModal.jsx`

Modal dialog for entering/managing the Claude API key:
- Centered overlay with backdrop blur, glassmorphism styling (bg-surface-container, border-outline-variant)
- Input field for the API key (type=password, toggleable visibility)
- Save button stores key in localStorage under `claude-api-key`
- Cancel button dismisses without saving
- Shows current status (key stored / not stored) with option to clear
- Props: `open`, `onClose`, `onSave`

#### Step B: Create `src/lib/claude-client.js`

Client-side wrapper for Claude API grading calls:

```javascript
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-haiku-4-5'
```

Function: `evaluateExplanation({ apiKey, explanation, topicTitle, researchContent })`

**System prompt:** Port the evaluation dimensions and scoring guidelines from the deposited `score-explanation` skill. The system prompt must instruct Claude to:
- Evaluate completeness (0-100): percentage of key concepts covered
- Evaluate accuracy (0-100): technical correctness of statements
- Classify depth as `"surface"`, `"moderate"`, or `"deep"` (NOT a number)
- List concepts covered well, partially correct, and missing entirely
- Craft a Socratic follow-up question targeting the weakest area
- Write an overall feedback paragraph (2-3 sentences)
- Include coaching principles: "Do not penalize for informal language. Judge understanding, not polish." and "A learner who uses their own examples demonstrates deeper understanding than one who parrots the source material."
- Return ONLY valid JSON — no prose, no markdown fences

**Output JSON schema** (must match the deposited skill):
```json
{
  "completeness": 65,
  "accuracy": 80,
  "depth": "moderate",
  "coveredWell": ["Correctly explained the role of X..."],
  "partiallyCorrect": ["Mentioned caching but did not distinguish..."],
  "missing": ["No mention of consistency trade-offs"],
  "followUpQuestion": "You explained how caching improves performance, but what happens when...",
  "overallFeedback": "You have a solid grasp of the core mechanics but..."
}
```

**Critical implementation details:**
- Headers: `'anthropic-dangerous-direct-browser-access': 'true'` (required for CORS from browser)
- Headers: `'anthropic-version': '2023-06-01'`
- Error handling: 401 → throw `'invalid-api-key'`, 429 → rate limit message, network → connection message
- **Markdown fence stripping** — Claude often wraps JSON in ` ```json ... ``` ` fences even when told not to. Before `JSON.parse`, always strip fences:
  ```javascript
  rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  ```
- Validate and normalize all fields with sensible defaults if missing

#### Step C: Create `src/components/TeachBackInput.jsx`

- Topic selector at top (from tree)
- "Input Module" — large Textarea with glassmorphism styling
- Key/settings icon button in header to open ApiKeyModal
- Microphone icon (disabled) + file attachment (disabled)
- "SUBMIT LOGIC" button (gradient CTA)
- **On submit:**
  1. Check localStorage for `claude-api-key` — if missing, show ApiKeyModal and return
  2. Fetch research content from `/research/{topicId}.md` (graceful 404 handling)
  3. Call `evaluateExplanation()` with key, explanation, topic title, research content
  4. Show loading overlay during API call
  5. On error: if `invalid-api-key` → reopen modal; otherwise → inline error banner
- **Post-submission panels** (powered by real API results):
  - "Node Map" visualization (bar chart placeholder)
  - "Semantic Gaps" tracker — three-tier breakdown: covered well (secondary color), partially correct (tertiary), missing (error color)
  - Grading dashboard: Completeness bar, Accuracy bar, Depth label (surface/moderate/deep)
  - "Follow-Up Question" — Socratic coaching prompt from the API
  - "Overall Feedback" — summary paragraph from the API
  - "Neural Suggestions" — lists items from coveredWell/partiallyCorrect/missing

### Final Polish

Apply consistently across all pages:
- All pages handle loading and error states
- Empty states with helpful text
- Glass panel styling consistent with DESIGN.md
- No 1px borders — use tonal shifts
- Gradient CTAs on all primary buttons
- Typography: Space Grotesk headlines, Inter body
- Accessibility: ARIA labels, keyboard navigation
- Copy assets to public:
  ```bash
  cp {{MANIFEST_PATH}} {{TARGET_DIR}}/public/manifest.json
  cp -r {{TARGET_DIR}}/research {{TARGET_DIR}}/public/research 2>/dev/null || true
  cp -r {{TARGET_DIR}}/podcasts/audio {{TARGET_DIR}}/public/podcasts 2>/dev/null || true
  ```

**Final build gate + Commit**

---

## Component Reference

| Component | File | Stitch Screen | Key Pattern |
|-----------|------|---------------|-------------|
| AppLayout | `src/layouts/AppLayout.jsx` | home.html | Glass sidebar, top nav, dark mode |
| TopicSidebar | `src/components/TopicSidebar.jsx` | research.html | Collapsible tree, completion dots |
| PodcastPlayer | `src/components/PodcastPlayer.jsx` | podcast.html | HTML5 audio, custom controls |
| QuizCard | `src/components/QuizCard.jsx` | quiz.html | RadioGroup answer cards, explanation panel |
| PerformancePanel | `src/components/PerformancePanel.jsx` | quiz.html | Accuracy gauge, domain mastery |
| ResearchViewer | `src/components/ResearchViewer.jsx` | research.html | 3-column, citations, synthesis links |
| TeachBackInput | `src/components/TeachBackInput.jsx` | teachback.html | Real API grading, three-tier gaps, Socratic coaching |
| ApiKeyModal | `src/components/ApiKeyModal.jsx` | teachback.html | Claude API key entry/management |
| claude-client | `src/lib/claude-client.js` | — | Browser-side Claude API wrapper, score-explanation schema |
| useManifest | `src/hooks/useManifest.js` | — | Fetch manifest.json |

## Guidelines

- Generate all files completely. No placeholder TODOs, no mock data with setTimeout.
- Interactive features (teach-back grading, quiz coaching) must use real API calls, not hardcoded responses.
- Every component must render meaningful UI even with empty data.
- Use ShadCN/ui components consistently — no raw HTML buttons/inputs.
- Match the Stitch HTML visual language: glassmorphism, gradient accents, HUD aesthetic.
- Quiz flow: scenario → select answer card → submit → neural analysis reveal.
- Audio: standard HTML5 API only, no external libraries.
- Research: `fetch()` against `/public`, not direct file reads.
- **The build must succeed at every checkpoint.**
- **In extend mode:** read existing code first, make surgical edits, preserve working features.
