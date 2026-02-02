/**
 * Demo Helper Utilities
 *
 * Interaction-only utilities for demo scripts. These helpers provide
 * human-readable wrappers for common Playwright actions with pacing
 * appropriate for live demo viewing. They contain zero test assertions.
 */
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Pause helpers – descriptive wrappers for timing control
// ---------------------------------------------------------------------------

/**
 * Pause execution for a specified duration.
 * Wraps page.waitForTimeout() with a descriptive name for demo readability.
 */
export async function pause(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Scenic pause – gives the viewer time to absorb content on screen.
 * Default: 1800ms (within the 1500–2000ms range per spec).
 */
export async function scenicPause(page: Page, ms: number = 1800): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Quick pause – short transition beat between rapid actions.
 * Default: 600ms (within the 500–800ms range per spec).
 */
export async function quickPause(page: Page, ms: number = 600): Promise<void> {
  await page.waitForTimeout(ms);
}

// ---------------------------------------------------------------------------
// Scroll helper
// ---------------------------------------------------------------------------

/**
 * Smoothly scrolls an element into view using native smooth scroll behavior
 * rather than Playwright's instant jump.
 */
export async function smoothScroll(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, selector);
  // Allow the smooth scroll animation to complete
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// Viewport helper
// ---------------------------------------------------------------------------

/**
 * Sets the browser viewport size with a small delay afterward so React
 * has time to re-render responsive layouts.
 */
export async function setViewport(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  // Small delay for React re-render settling after resize
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// Drag-and-drop helper
// ---------------------------------------------------------------------------

/**
 * Reliable HTML5 native drag-and-drop using the manual mouse event sequence.
 * This approach (hover → mousedown → move → hover target → drop) has been
 * proven reliable in this project's Task 13 Kanban DnD tests.
 *
 * @param page       Playwright Page instance
 * @param source     Selector for the drag source element
 * @param target     Selector for the drop target element
 * @param options    Optional overrides for step count and hold delay
 */
export async function dragAndDrop(
  page: Page,
  source: string,
  target: string,
  options: { steps?: number; holdMs?: number } = {},
): Promise<void> {
  const { steps = 10, holdMs = 100 } = options;

  const sourceEl = page.locator(source);
  const targetEl = page.locator(target);

  // Get bounding boxes
  const sourceBBox = await sourceEl.boundingBox();
  const targetBBox = await targetEl.boundingBox();

  if (!sourceBBox || !targetBBox) {
    throw new Error(
      `dragAndDrop: could not get bounding box for source="${source}" or target="${target}"`,
    );
  }

  const sourceCenter = {
    x: sourceBBox.x + sourceBBox.width / 2,
    y: sourceBBox.y + sourceBBox.height / 2,
  };
  const targetCenter = {
    x: targetBBox.x + targetBBox.width / 2,
    y: targetBBox.y + targetBBox.height / 2,
  };

  // Perform the drag sequence
  await page.mouse.move(sourceCenter.x, sourceCenter.y);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);

  // Smooth move to target in steps
  await page.mouse.move(targetCenter.x, targetCenter.y, { steps });
  await page.waitForTimeout(holdMs);

  await page.mouse.up();
  // Brief settle after drop
  await page.waitForTimeout(300);
}
