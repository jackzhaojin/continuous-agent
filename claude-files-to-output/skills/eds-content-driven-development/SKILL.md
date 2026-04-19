---
name: eds-content-driven-development
description: Apply a Content Driven Development (CDD) process to AEM Edge Delivery Services development. Use for ALL EDS code changes — new blocks, block modifications, CSS styling, bug fixes, core functionality (scripts.js, styles, etc.), or any JavaScript/CSS work that needs validation. Adapted from Adobe's `content-driven-development` skill (Apache-2.0).
license: Apache-2.0
user-invocable: false
metadata:
  category: skill
---

# Content Driven Development (CDD) for AEM Edge Delivery

You are an orchestrator of the Content Driven Development workflow for AEM Edge Delivery Services. This workflow ensures code is built against real content with author-friendly content models.

**CRITICAL: Never start writing or modifying code without first identifying or creating the content you will use to test your changes.**

## When to Use This Skill

Use CDD for ALL EDS development tasks on an AEM / Edge Delivery project:
- ✅ Creating new blocks
- ✅ Modifying existing blocks (structural or functional changes)
- ✅ Changes to core decoration functionality (scripts.js, styles.css)
- ✅ Bug fixes that require validation
- ✅ Any code that affects how authors create or structure content

Do NOT use for:
- Documentation-only changes
- Configuration changes that don't affect authoring
- Research tasks that don't require making any code changes yet
- Non-EDS projects (even if they're web — use `web-testing` instead)

**Project markers that identify an EDS project:** `fstab.yaml` at repo root, `head.html`, `paths.json`, a `blocks/` directory, or `scripts/aem.js`. If none of these are present, this skill does not apply.

## Philosophy

Content Driven Development prioritizes creating or identifying test content before writing code. This ensures:
- Code is built against real content
- Author-friendly content models
- Validation throughout development

**Optional: Understanding CDD Principles**

Read `resources/cdd-philosophy.md` if:
- User asks "why" questions about content-first approach
- You need to understand reasoning behind CDD decisions
- You're unsure whether to prioritize author vs developer experience

Otherwise: Follow the workflow steps below.

## Step 0: Create a Plan

First thing: write down the work you're about to do. Use the following 8-step checklist as your scaffold. If you're running inside the executive loop, this plan goes into your structured handoff's `what_i_built` once complete.

1. **Start dev server** (if not running) — Success: http://localhost:3000 returns 200
2. **Analyze & plan** — Success: Clear understanding documented + acceptance criteria defined
3. **Design content model** — Success: Content structure documented and validated
4. **Identify/create test content** — Success: Test content accessible covering all scenarios
5. **Implement** — Success: Functionality works across all viewports
6. **Lint & test** — Success: All checks pass
7. **Final validation** — Success: All acceptance criteria met, everything works
8. **Commit & ship** — Success: Work committed via `jack-git-commit`; PR created with preview link (only if the task asks for a PR — do NOT push without explicit instruction)

---

## Step 1: Start Dev Server

**Check if dev server is running:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200` (server running) or connection error (server not running)

**If not running, start it:**

```bash
aem up --no-open --forward-browser-logs
```

**Notes:**
- Run in background if possible (dev server needs to stay running)
- Requires AEM CLI installed globally: `npm install -g @adobe/aem-cli`
- Alternative: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs`

**Common issues:** Port 3000 already in use, AEM CLI not installed, configuration errors.

**After starting, verify:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`

---

## Step 2: Analyze & Plan

Read the task carefully. Capture:
- What the user-visible outcome should look like (screenshots, design files, URLs to match)
- Acceptance criteria — one short sentence per criterion, concrete enough to verify in a browser
- Scope boundary — what's in this step vs. what belongs to later steps

Write this into a short `PLAN.md` or the goal bundle's prior-handoff so the next step can reference it.

---

## Step 3: Design Content Model

**Skip if:** CSS-only changes that don't affect content structure.

Design the table structure (rows, columns, semantic formatting) that authors will use to create content for this block.

**Validate against best practices:**
- Keep rows simple (≤4 cells per row where possible)
- Use semantic formatting (headings, links, strong/em) instead of class strings
- Document what each cell means for the author

---

## Step 4: Identify/Create Test Content

**Goal:** End this step with accessible test content URL(s) covering all test scenarios.

Choose the best path based on your situation:

### Option A: User Provided Test URL(s)

1. Validate URL loads: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/path`
2. Expected: `200`
3. Document URL(s)

### Option B: New Block (No Existing Content)

**Approach 1: CMS Content (Recommended)**
1. Ask the user to create content in their CMS (Google Drive/SharePoint/DA/Universal Editor)
2. Provide the content model from Step 3 as reference
3. Wait for the user to provide URL(s)
4. Validate: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/path` → `200`

**Approach 2: Local HTML (Temporary)**
1. Create HTML file in `drafts/tmp/{block-name}.plain.html`
2. Follow structure from Step 3 content model
3. Read `resources/html-structure.md` for local HTML file format guidance
4. Restart dev server: `aem up --html-folder drafts --no-open --forward-browser-logs`
5. Validate: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/drafts/tmp/{block-name}` → `200`
6. **Note:** User must create CMS content before PR (required for preview link)

### Option C: Existing Block

1. Search for existing content pages containing the block (grep the codebase, check `docs/` if present)
2. If found: validate URLs load, document
3. If not: use Approach 2 from Option B to create local test content

---

## Step 5: Implement

**Invoke:** `eds-building-blocks` skill (ReadFile `.claude/skills/eds-building-blocks/SKILL.md`).

Provide to yourself as input:
- Content model from Step 3 (if applicable)
- Test content URL(s) from Step 4
- Analysis/requirements from Step 2
- Type of changes: new block, existing block modification, CSS-only, core file change, etc.

The building-blocks guidance covers:
- JavaScript decoration patterns (re-use existing DOM elements, semantic HTML)
- CSS scoping to `main .{block-name}` with custom properties and mobile-first media queries
- Iterative browser testing throughout development

---

## Step 6: Lint & Test

```bash
npm run lint
```

If lint errors:
1. Fix issues (`npm run lint:fix` for auto-fixable)
2. Re-run until clean

```bash
npm test
```

Unit tests are optional and only needed for logic-heavy utilities. Browser testing is covered by iterative checks in Step 5 and by the `web-testing` skill's playwright-cli protocol.

---

## Step 7: Final Validation

1. **Review acceptance criteria** from Step 2 — each one verified in a real browser session
2. **Final browser sanity check** — mobile, tablet, desktop viewports; no console errors; no visual regressions
3. **Regression check** — if modifying an existing block, the existing variants still work

---

## Step 8: Commit & Ship

**Commits:** follow the `jack-git-commit` skill (ReadFile `.claude/skills/jack-git-commit/SKILL.md`). Conventional commit format with traceable footers (Goal, Step, Worker). **Never push unless explicitly instructed.**

**If the task explicitly asks for a PR:**

1. Create a feature branch (if not already on one)
2. Stage only the files you worked on — NEVER `git add .`
3. Commit with conventional format per `jack-git-commit`
4. Push to the feature branch only if the user said "push"
5. Create PR including a preview link: `https://{branch}--{repo}--{owner}.aem.page/{path}` (AEM branch preview — required for PSI checks)

**Draft vs. regular PR:**

Create a **draft PR** when only local test content exists for NEW functionality/variants (user must add CMS content before merge).

Create a **regular PR** when all test content exists in CMS and is previewable.

**PR description template:**

```markdown
## Description
Brief description of changes.

Test URLs:
- Before: https://main--{repo}--{owner}.aem.page/{path}
- After:  https://{branch}--{repo}--{owner}.aem.page/{path}

[If only local test content (draft PR):]
This PR is a **draft** pending CMS test content. Next steps:
1. Open local test content in browser: `http://localhost:3000/drafts/tmp/{test-file}`
2. Right-click AEM Sidekick → "View document source" → copy
3. Paste into Word/Google Docs/DA
4. Preview the CMS content, add URL here, mark PR ready for review
```

---

## Anti-Patterns to Avoid

- ❌ Starting with code before understanding the content model
- ❌ Making assumptions about content structure without seeing real examples
- ❌ Creating developer-friendly but author-hostile content models
- ❌ Skipping content creation "to save time" (costs more time later)
- ❌ Styling without scoping to `main .{block-name}` (leaks to other blocks)

## Resources

- **Philosophy:** `resources/cdd-philosophy.md` — Why content-first matters
- **HTML Structure:** `resources/html-structure.md` — Guide for creating local HTML test files

## Attribution

Adapted from `@adobe/skills` plugin `aem/edge-delivery-services/content-driven-development` (Apache-2.0). Modifications: aligned to `jack-git-commit`, removed Cursor-specific attribution, trimmed references to Adobe-internal sister skills not present in this library.
