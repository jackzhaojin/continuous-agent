/**
 * Highlights Demo with Captions
 *
 * Same walkthrough as highlights.spec.ts but with an on-screen caption overlay
 * that narrates each section in real time. Designed for screen recordings where
 * no separate voice-over is needed.
 *
 * Run: npx playwright test demo/highlights-with-captions.spec.ts --headed
 *
 * @tags @highlights-captioned
 */
import { test, type Page } from '@playwright/test';
import {
  pause,
  scenicPause,
  quickPause,
  smoothScroll,
  setViewport,
  dragAndDrop,
} from './helpers';

// ---------------------------------------------------------------------------
// Caption overlay system
// ---------------------------------------------------------------------------

const CAPTION_CSS = [
  'position:fixed',
  'bottom:0',
  'left:0',
  'right:0',
  'z-index:99999',
  'padding:20px 40px 28px',
  'background:linear-gradient(transparent 0%,rgba(0,0,0,0.15) 15%,rgba(0,0,0,0.82) 100%)',
  'color:#fff',
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  'font-size:20px',
  'font-weight:500',
  'line-height:1.4',
  'text-align:center',
  'letter-spacing:0.01em',
  'text-shadow:0 1px 3px rgba(0,0,0,0.5)',
  'pointer-events:none',
  'opacity:0',
  'transition:opacity 0.3s ease',
].join(';');

/** Show caption text. Persists until next show or hide. Re-injects overlay if lost after navigation. */
async function showCaption(page: Page, text: string): Promise<void> {
  await page.evaluate(([t, css]: string[]) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      el.style.cssText = css;
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = '1';
  }, [text, CAPTION_CSS]);
  await page.waitForTimeout(300);
}

/** Fade out current caption. */
async function hideCaption(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) el.style.opacity = '0';
  });
  await page.waitForTimeout(300);
}

/** Show caption, hold for duration, then fade out. */
async function caption(page: Page, text: string, ms = 3000): Promise<void> {
  await showCaption(page, text);
  await page.waitForTimeout(ms);
  await hideCaption(page);
}

// ---------------------------------------------------------------------------
// Natural-typing helper — types text character by character
// ---------------------------------------------------------------------------
async function naturalType(page: Page, selector: string, text: string): Promise<void> {
  const el = page.locator(selector);
  await el.click();
  for (const char of text) {
    await el.press(char === ' ' ? 'Space' : char);
    await page.waitForTimeout(60 + Math.random() * 80);
  }
}

// ---------------------------------------------------------------------------
// HIGHLIGHTS DEMO WITH CAPTIONS
// ---------------------------------------------------------------------------

test('@highlights-captioned Project Management Dashboard — Highlights with Captions', async ({ page }) => {
  // =========================================================================
  // SETUP
  // =========================================================================
  await setViewport(page, 1280, 800);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // =========================================================================
  // SECTION 1: Dashboard Landing
  // =========================================================================

  await caption(page, 'Welcome to ProjectHub — a modern project management dashboard.', 3500);

  // Hover over stat cards to show interactivity
  await showCaption(page, 'Interactive stat cards show key metrics at a glance.');
  const statCards = [
    '[data-testid="stat-total-projects"]',
    '[data-testid="stat-active-tasks"]',
    '[data-testid="stat-team-members"]',
    '[data-testid="stat-completed-tasks"]',
  ];

  for (const card of statCards) {
    await page.hover(card);
    await quickPause(page, 600);
  }
  await pause(page, 1000);
  await hideCaption(page);

  // =========================================================================
  // SECTION 2: Charts & Activity Feed
  // =========================================================================

  await showCaption(page, 'Data visualization powered by Recharts.');
  await smoothScroll(page, '[data-testid="dashboard-charts"]');
  await scenicPause(page, 2000);

  // Hover over the line chart to trigger tooltips
  await showCaption(page, 'Hover tooltips reveal exact data points.');
  const chartsSection = page.locator('[data-testid="dashboard-charts"]');
  const chartsBBox = await chartsSection.boundingBox();
  if (chartsBBox) {
    for (let i = 0; i < 5; i++) {
      const x = chartsBBox.x + (chartsBBox.width * 0.1) + (chartsBBox.width * 0.35 * i) / 4;
      const y = chartsBBox.y + chartsBBox.height * 0.4;
      await page.mouse.move(x, y);
      await pause(page, 400);
    }
  }
  await scenicPause(page, 1500);
  await hideCaption(page);

  // Activity feed
  await showCaption(page, 'The activity feed tracks team actions in real time.');
  await smoothScroll(page, 'main');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
  });
  await scenicPause(page, 2000);
  await hideCaption(page);

  // Scroll back to top
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await pause(page, 800);

  // =========================================================================
  // SECTION 3: Projects Page
  // =========================================================================

  await caption(page, 'Next — the Projects page.', 2000);

  await page.click('[data-testid="nav-projects"]');
  await page.waitForLoadState('networkidle');

  await showCaption(page, 'Search, sorting, and pagination — all built in.');
  await scenicPause(page, 2000);

  // Search
  await showCaption(page, 'Real-time filtering as you type.');
  const searchInput = page.locator('input[aria-label="Search projects"]');
  await searchInput.click();
  await pause(page, 400);
  await naturalType(page, 'input[aria-label="Search projects"]', 'Website');
  await scenicPause(page, 1500);

  await searchInput.clear();
  await hideCaption(page);
  await pause(page, 600);

  // Sort
  await showCaption(page, 'Sortable column headers toggle direction.');
  await page.click('th:has-text("Name")');
  await pause(page, 800);
  await page.click('th:has-text("Name")');
  await pause(page, 800);
  await page.click('th:has-text("Status")');
  await scenicPause(page, 1200);
  await hideCaption(page);

  // Create new project
  await showCaption(page, 'Creating a new project via modal form.');
  await page.click('button:has-text("New Project")');
  await pause(page, 800);

  const nameInput = page.locator('input[placeholder="Enter project name"]');
  await nameInput.click();
  await pause(page, 300);
  for (const char of 'Analytics Dashboard v2') {
    await nameInput.press(char === ' ' ? 'Space' : char);
    await page.waitForTimeout(60 + Math.random() * 80);
  }
  await pause(page, 500);

  const dateInput = page.locator('input[type="date"]');
  await dateInput.fill('2025-06-30');
  await pause(page, 600);

  await page.click('button[type="submit"]:has-text("Create Project")');
  await showCaption(page, 'Success — the new project appears instantly.');
  await scenicPause(page, 2500);
  await hideCaption(page);

  // =========================================================================
  // SECTION 4: Kanban Board — Drag & Drop
  // =========================================================================

  await caption(page, 'The Kanban board — drag-and-drop task management.', 3000);

  await page.click('[data-testid="nav-tasks"]');
  await page.waitForLoadState('networkidle');
  await scenicPause(page, 1500);

  // Drag To Do → In Progress
  const todoCards = page.locator('[data-testid="kanban-column-todo"] article[draggable="true"]');
  const todoCount = await todoCards.count();

  if (todoCount > 0) {
    await showCaption(page, 'Moving a task from To Do to In Progress.');
    await dragAndDrop(
      page,
      '[data-testid="kanban-column-todo"] article[draggable="true"]:first-of-type',
      '[data-testid="kanban-column-in-progress"]',
      { steps: 15, holdMs: 150 },
    );
    await scenicPause(page, 1800);
  }

  // Drag In Progress → Done
  const ipCards = page.locator('[data-testid="kanban-column-in-progress"] article[draggable="true"]');
  const ipCount = await ipCards.count();

  if (ipCount > 0) {
    await showCaption(page, 'And from In Progress to Done.');
    await dragAndDrop(
      page,
      '[data-testid="kanban-column-in-progress"] article[draggable="true"]:first-of-type',
      '[data-testid="kanban-column-done"]',
      { steps: 15, holdMs: 150 },
    );
    await scenicPause(page, 1800);
  }
  await hideCaption(page);

  // =========================================================================
  // SECTION 5: Dark Mode Toggle
  // =========================================================================

  await caption(page, 'Dark mode — one click transforms the entire interface.', 3000);

  await page.click('[data-testid="theme-toggle"]');
  await scenicPause(page, 1500);

  await showCaption(page, 'Every chart and card adapts to the dark palette.');
  await page.click('[data-testid="nav-dashboard"]');
  await page.waitForLoadState('networkidle');
  await scenicPause(page, 2500);

  await smoothScroll(page, '[data-testid="dashboard-charts"]');
  await scenicPause(page, 2000);
  await hideCaption(page);

  // Scroll back to top
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await pause(page, 800);

  // Toggle back to light mode
  await page.click('[data-testid="theme-toggle"]');
  await scenicPause(page, 1500);

  // =========================================================================
  // SECTION 6: Responsive Design
  // =========================================================================

  await caption(page, 'Responsive design — from desktop to mobile.', 3000);

  // Resize to mobile
  await showCaption(page, 'Mobile at 375px — everything adapts.');
  await setViewport(page, 375, 800);
  await scenicPause(page, 2500);

  // Resize to tablet
  await showCaption(page, 'Tablet — the sidebar collapses to icons.');
  await setViewport(page, 768, 800);
  await scenicPause(page, 1800);

  // Resize back to desktop
  await showCaption(page, 'Back to desktop — full layout restored.');
  await setViewport(page, 1280, 800);
  await scenicPause(page, 2000);
  await hideCaption(page);

  // =========================================================================
  // OUTRO
  // =========================================================================
  await caption(
    page,
    'ProjectHub — React 18, TypeScript, Tailwind CSS. No backend required. Thanks for watching.',
    4500,
  );
});
