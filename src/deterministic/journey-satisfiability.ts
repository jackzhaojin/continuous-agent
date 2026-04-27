/**
 * Deterministic check: does the worker's output contain a way to actually
 * execute the goal's `definition_of_done_journey`?
 *
 * Why this exists: Phase 5's standard verifier suite (`node_test`,
 * `files_exist`, etc.) is too generic to enforce a journey. A goal can
 * declare a Playwright-shaped journey, the worker can ship 3 of 6
 * deliverables without writing any test, and the verifier suite still
 * accepts it as a "Partial pass" because the missing test artifacts only
 * fail advisory verifiers. This helper closes that gap with a fast
 * deterministic scan: when the journey describes browser interaction, the
 * project must contain at least one of:
 *   - a `playwright.config.{js,ts,mjs,cjs}` anywhere within depth 4
 *   - a `tests/e2e/` (or `test/e2e/`) directory anywhere within depth 4
 *   - a `package.json` whose scripts mention `playwright` or `test:e2e`
 *
 * If none of those exist, the journey cannot be executed and the worker
 * has not finished. The check is deterministic (no LLM call) and runs
 * in milliseconds.
 *
 * The 2026-04-26 azure-star-generator refresh hit exactly this: the
 * journey called for a Playwright walk through a CSV upload and a
 * clipboard assertion; the worker shipped the UI but never wrote the
 * spec, the config, or the test script — and Phase 5 marked it complete.
 */

import { existsSync, readdirSync, readFileSync, type Dirent } from 'fs';
import path from 'path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude',
  'dist',
  'build',
  '.next',
  '.cache',
  '.playwright-cli',
  '.playwright-mcp',
  '.turbo',
  '.vercel',
  'coverage',
]);

/**
 * Heuristic — does the journey text describe browser/UI interaction that
 * needs Playwright (or equivalent) to verify? Backend-only journeys
 * (curl-style API roundtrips with no browser) should NOT trigger this gate
 * since they can be verified without a browser harness.
 */
export function journeyDescribesBrowserInteraction(journey: string | undefined): boolean {
  if (!journey) return false;
  const t = journey.toLowerCase();
  return /\b(browser|click|playwright|chromium|firefox|webkit|navigate|page\.goto|page\.click|upload|select option|submit form|button|input\[|locator|data-testid|render(s|ed|ing)?|ui\b|frontend\b|html\b|dom\b)\b/.test(
    t,
  );
}

interface SatisfiabilityResult {
  ok: boolean;
  reason?: string;
  evidence?: Record<string, unknown>;
}

/**
 * Walk a project tree (depth-limited) and decide whether it contains
 * runnable journey-verification infrastructure.
 */
export function checkJourneySatisfiability(
  projectPath: string,
  journey: string | undefined,
): SatisfiabilityResult {
  if (!journey) return { ok: true };
  if (!existsSync(projectPath)) {
    return { ok: false, reason: `project_path does not exist: ${projectPath}` };
  }
  if (!journeyDescribesBrowserInteraction(journey)) {
    // Non-browser journeys are out of scope for this gate. The standard
    // verifier suite (or a future API-journey gate) should cover those.
    return { ok: true };
  }

  const found = collectArtifacts(projectPath, 4);

  const hasPlaywrightConfig = found.files.some((p) =>
    /(?:^|\/)playwright\.config\.(js|ts|mjs|cjs)$/i.test(p),
  );
  const hasTestsE2eDir = found.dirs.some((p) => /(?:^|\/)tests?\/e2e\/?$/i.test(p));
  const hasPlaywrightScript = found.files
    .filter((p) => /(?:^|\/)package\.json$/.test(p))
    .some((pkgPath) => packageJsonMentionsJourneyTest(pkgPath));

  if (hasPlaywrightConfig || hasTestsE2eDir || hasPlaywrightScript) {
    return {
      ok: true,
      evidence: {
        playwright_config_found: hasPlaywrightConfig,
        tests_e2e_dir_found: hasTestsE2eDir,
        playwright_or_e2e_script_found: hasPlaywrightScript,
      },
    };
  }

  return {
    ok: false,
    reason:
      'definition_of_done_journey describes browser interaction but the project contains ' +
      'no playwright.config.{js,ts,mjs,cjs}, no tests/e2e/ (or test/e2e/) directory, and no ' +
      'package.json script referencing playwright/test:e2e. The journey cannot be executed ' +
      'against the current state of the project — worker shipped without producing the ' +
      'verification artifacts the journey requires.',
    evidence: {
      playwright_config_found: false,
      tests_e2e_dir_found: false,
      playwright_or_e2e_script_found: false,
      files_scanned: found.files.length,
      dirs_scanned: found.dirs.length,
    },
  };
}

function packageJsonMentionsJourneyTest(pkgPath: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg?.scripts;
    if (!scripts || typeof scripts !== 'object') return false;
    for (const [name, body] of Object.entries(scripts as Record<string, unknown>)) {
      if (typeof body !== 'string') continue;
      if (/playwright|test:e2e|e2e:test|test-e2e/i.test(`${name} ${body}`)) return true;
    }
    // devDependencies hint
    const dev = pkg?.devDependencies;
    if (dev && typeof dev === 'object' && '@playwright/test' in dev) return true;
  } catch {
    // unreadable / unparseable — caller will treat as "not found"
  }
  return false;
}

interface CollectedArtifacts {
  files: string[];
  dirs: string[];
}

function collectArtifacts(root: string, maxDepth: number): CollectedArtifacts {
  const files: string[] = [];
  const dirs: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        dirs.push(rel);
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  };

  walk(root, 0);
  return { files, dirs };
}
