---
name: eds-building-blocks
description: Implement AEM Edge Delivery Services blocks and core functionality. Handles block development (new or modified), core functionality changes (scripts.js, styles, delayed.js), or both. Invoked by `eds-content-driven-development` during its implementation step, or directly when a step's deliverable is EDS code. Adapted from Adobe's `building-blocks` skill (Apache-2.0).
license: Apache-2.0
user-invocable: false
metadata:
  category: skill
---

# Building AEM Edge Delivery Blocks

This skill guides you through implementing AEM Edge Delivery blocks following established patterns and best practices. Blocks transform authored content into rich, interactive experiences through JavaScript decoration and CSS styling.

**Preferred flow:** Arrive here via the `eds-content-driven-development` workflow, specifically its Step 5 (Implement). If you jumped straight here without doing content discovery and a content model, stop and read `.claude/skills/eds-content-driven-development/SKILL.md` first — coding against imagined content ships integration bugs.

## When to Use This Skill

This skill handles:

**Block Development:**
- Creating new block files and structure
- Implementing JavaScript decoration
- Adding CSS styling

**Core Functionality:**
- `scripts.js` modifications (decoration, utilities, auto-blocking)
- Global styles (`styles/styles.css`, `styles/lazy-styles.css`)
- Delayed functionality (`scripts/delayed.js`)
- Configuration changes

**Combined:**
- Blocks with supporting core changes (utilities, global styles, etc.)

Prerequisites (verified by CDD if you came through it):
- ✅ Test content exists (in CMS or local drafts)
- ✅ Content model is defined/documented (if applicable)
- ✅ Test content URL is available
- ✅ Dev server is running

## Block Implementation Workflow

Track your progress:
- [ ] Step 1: Find similar blocks for patterns (if new block or major changes)
- [ ] Step 2: Create or modify block structure (files and directories)
- [ ] Step 3: Implement JavaScript decoration (skip if CSS-only)
- [ ] Step 4: Add CSS styling
- [ ] Step 5: Test implementation in the browser via `web-testing` skill (playwright-cli protocol)

**Note:** If your changes require core modifications (utilities in `scripts.js`, global styles, etc.), make those changes first, test them, then return to this workflow. See "When Modifying Core Files" below.

## Step 1: Find Similar Blocks

**When to use:** Creating new blocks or making major structural modifications.

**Skip when:** Making minor modifications to existing blocks (CSS tweaks, small decoration changes).

Search the codebase for similar blocks:
```bash
ls blocks/
```

Review patterns from similar blocks:
- DOM manipulation strategies
- CSS architecture
- Variant handling
- Performance optimizations

## Step 2: Create or Modify Block Structure

### For New Blocks:

1. Create the block directory and files:
   ```bash
   mkdir -p blocks/{block-name}
   touch blocks/{block-name}/{block-name}.js
   touch blocks/{block-name}/{block-name}.css
   ```

2. Basic JavaScript structure:
   ```javascript
   /**
    * decorate the block
    * @param {Element} block the block
    */
   export default async function decorate(block) {
     // Your decoration logic here
   }
   ```

3. Basic CSS structure:
   ```css
   /* All selectors scoped to block */
   main .{block-name} {
     /* block styles */
   }
   ```

### For Existing Blocks:

1. Locate the block directory: `blocks/{block-name}/`
2. Review current implementation:
   ```bash
   # View the initial HTML structure from the server
   curl http://localhost:3000/{test-content-path}
   ```
3. Understand existing decoration logic and styles

## Step 3: Implement JavaScript Decoration

**Essential pattern — re-use existing DOM elements:**

```javascript
export default async function decorate(block) {
  // Platform delivers images as <picture> elements with <source> tags
  const picture = block.querySelector('picture');
  const heading = block.querySelector('h2');

  // Create new structure, re-using existing elements
  const figure = document.createElement('figure');
  figure.append(picture);  // Re-uses picture element

  const wrapper = document.createElement('div');
  wrapper.className = 'content-wrapper';
  wrapper.append(heading, figure);

  block.replaceChildren(wrapper);

  // Only check variants when they affect decoration logic
  // CSS-only variants like 'dark', 'wide' don't need JS
  if (block.classList.contains('carousel')) {
    // Carousel variant needs different DOM structure/behavior
    setupCarousel(block);
  }
}
```

**For complete JavaScript guidelines** — advanced DOM manipulation patterns, data fetching and module loading, performance optimization, helper functions from `aem.js`, code style and linting rules — read `resources/js-guidelines.md`.

## Step 4: Add CSS Styling

**Essential patterns — scoped, responsive, using custom properties:**

```css
/* All selectors MUST be scoped to block */
main .my-block {
  /* Use CSS custom properties for consistency */
  background-color: var(--background-color);
  color: var(--text-color);
  font-family: var(--body-font-family);
  max-width: var(--max-content-width);

  /* Mobile-first styles (default) */
  padding: 1rem;
  flex-direction: column;
}

main .my-block h2 {
  font-family: var(--heading-font-family);
  font-size: var(--heading-font-size-m);
}

main .my-block .item {
  display: flex;
  gap: 1rem;
}

/* Tablet and up */
@media (width >= 600px) {
  main .my-block {
    padding: 2rem;
  }
}

/* Desktop and up */
@media (width >= 900px) {
  main .my-block {
    flex-direction: row;
    padding: 4rem;
  }
}

/* Variants — most are CSS-only */
main .my-block.dark {
  background-color: var(--dark-color);
  color: var(--clr-white);
}
```

**For complete CSS guidelines** — all available CSS custom properties, modern CSS features (grid, logical properties), performance optimization, naming conventions, common patterns and anti-patterns — read `resources/css-guidelines.md`.

**Note on iterative validation:** While building, test changes in your browser as you go (load test content URL, check console, verify layout and functionality). The `web-testing` skill covers comprehensive visual testing with playwright-cli.

## Step 5: Test Implementation

Invoke the `web-testing` skill (ReadFile `.claude/skills/web-testing/SKILL.md`) to run the playwright-cli verification protocol:
- Pre-flight: existing site loads
- Post-build: your new/modified block renders, no console errors
- Journey check: the flow still works end-to-end
- `tests/e2e/journey.spec.ts` extended if your block adds a new user-reachable path

---

## When Modifying Core Files

If your changes require modifying core files (`scripts.js`, `styles.css`, `delayed.js`):

**Common core files:**
- **scripts.js** — Decoration utilities, auto-blocking logic, page loading
- **styles/styles.css** — Global styles (eager), CSS custom properties
- **styles/lazy-styles.css** — Global styles (lazy loaded)
- **scripts/delayed.js** — Marketing, analytics, third-party integrations

**Key principles:**

1. **Make core changes first** (before block changes that depend on them)
2. **Test core changes independently** with existing content before using them in blocks
3. **Consider impact** — core changes can affect multiple blocks/pages
4. **Test thoroughly** — verify no regressions in existing functionality
5. **Keep it minimal** — only add what's necessary
6. **Document with code comments** — most core changes don't need separate docs
7. **NEVER modify `scripts/aem.js`** — it's platform-provided and upgradable

**Testing core changes:**
- Test with existing content URLs that use affected functionality
- For auto-blocking: test pages that should/shouldn't trigger it
- For global styles: test across multiple blocks and pages
- Check console for errors
- Verify responsive behavior

**For detailed patterns:**
- JavaScript: `resources/js-guidelines.md`
- CSS: `resources/css-guidelines.md`

---

## Reference Materials

- `resources/js-guidelines.md` — Complete JavaScript patterns and best practices
- `resources/css-guidelines.md` — Complete CSS patterns and best practices

## Attribution

Adapted from `@adobe/skills` plugin `aem/edge-delivery-services/building-blocks` (Apache-2.0). Modifications: routed test step through our `web-testing` skill, removed references to Adobe-internal sister skills not present in this library.
