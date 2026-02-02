import { defineConfig } from '@playwright/test';

/**
 * Video recording Playwright configuration.
 *
 * Runs captioned demo scripts in headless mode (no browser chrome) with
 * explicit video size matching the viewport for pixel-perfect recordings.
 *
 * Output: WebM files in test-results/ — look for the .webm file inside
 * the test-specific folder.
 *
 * Usage:
 *   npx playwright test --config=playwright.video.config.ts --grep @highlights-captioned
 *   npx playwright test --config=playwright.video.config.ts --grep @full-tour-captioned
 */
export default defineConfig({
  testDir: './demo',

  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,

  /* Generous timeouts for demo pacing */
  timeout: 600_000,
  expect: { timeout: 120_000 },

  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',

    /* Headless — no browser chrome in the recording */
    headless: true,

    /* Record video at full viewport resolution */
    video: {
      mode: 'on',
      size: { width: 1280, height: 800 },
    },

    /* Match the video size */
    viewport: { width: 1280, height: 800 },

    trace: 'off',
    actionTimeout: 30_000,
  },

  projects: [
    {
      name: 'video',
      use: {
        /* Chromium without Desktop Chrome device defaults that could override viewport */
        browserName: 'chromium',
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
