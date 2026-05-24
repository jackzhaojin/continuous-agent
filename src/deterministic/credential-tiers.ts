/**
 * Credential Tiers - Tier 3 (Application) Format Helpers
 *
 * The three-tier credential system uses physically separate .env files:
 *   - .env.executive  → Tier 1: Executive loop config (Notion, timing, breakdown)
 *   - .env.worker     → Tier 2: Worker agent auth (Claude SDK, model, tool APIs)
 *   - .env.app        → Tier 3: Application credentials (DB, cache, storage, etc.)
 *
 * Tier 1 and Tier 2 always run Node.js and use dotenv natively.
 * Tier 3 targets arbitrary platforms — they could be Node.js, Python, Docker,
 * bash, iOS, C++, or anything else.
 *
 * This module provides:
 *   1. Parsing .env.app files (KEY=VALUE format)
 *   2. Multi-format export for platform-agnostic injection
 *   3. Validation helpers to detect tier mixing
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';

// ── Known Tier 1 (Executive) variable names ──────────────────────
// These MUST NEVER appear in worker or app env files.
export const TIER1_EXECUTIVE_KEYS = new Set([
  'IDLE_SLEEP_SECONDS',
  'UNHEALTHY_SLEEP_SECONDS',
  'BREAKDOWN_THRESHOLD_TURNS',
  'AUTO_BREAKDOWN_ENABLED',
  'STEP_MIN_TURNS',
  'STEP_TARGET_TURNS',
  'STEP_MAX_TURNS',
  'MAX_TURNS_PER_STEP',
  'NOTION_API_KEY',
  'NOTION_DATABASE_ID',
  'NOTION_MONTHLY_PAGE_ID',
  'NOTION_REPORTING_ENABLED',
  // V3.0 second brain — executive-tier ONLY. Workers never call mem0; they are
  // fed a static Memory Pack in CLAUDE.md. These keys must never reach a worker.
  'V3_MEMORY_ENABLED',
  'V3_MEM0_API_KEY',
  'V3_MEM0_USER_ID',
  'V3_MEM0_TOP_K',
  'V3_MEM0_CONFIDENCE_FLOOR',
  'V3_MEM0_ENV',
  'V3_MEM0_COHORT',
  'V3_MEM_HOOK_POST_RUN',
  'V3_MEM_HOOK_PRE_SPAWN',
  'V3_MEM_HOOK_PRE_WORK',
  'V3_MEM_HOOK_FAIL_DIAG',
  'V3_MEM_HOOK_POST_RETRO',
]);

// ── Known Tier 2 (Worker/Execution) variable names ───────────────
// These MUST NEVER appear in app env files.
export const TIER2_WORKER_KEYS = new Set([
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'MODEL',
  'MAX_TURNS',
  'ELEVENLABS_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'CODEX_API_KEY',
  'MOONSHOT_API_KEY',
  'KIMI_MODEL',
  'KIMI_EXECUTABLE',
  'KIMI_THINKING',
  'KIMI_YOLO_MODE',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'WORKER_VENDOR',
  'CHAT_VENDOR',
  'CHAT_MODEL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
]);

// ── Tier 3 APP_ prefix convention ────────────────────────────────
export const APP_PREFIX = 'APP_';

// ── Types ────────────────────────────────────────────────────────

export interface EnvEntry {
  key: string;
  value: string;
}

export type AppEnvFormat = 'dotenv' | 'json' | 'shell' | 'docker-compose' | 'yaml';

// ── .env file parsing ────────────────────────────────────────────

/**
 * Parse a KEY=VALUE env file into entries.
 * Skips comments and blank lines. Only includes entries with non-empty values.
 */
export function parseEnvFile(filePath: string): EnvEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  return parseEnvContent(content);
}

/**
 * Parse raw KEY=VALUE content into entries.
 */
export function parseEnvContent(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Strip inline comments (only for unquoted values)
    const commentIndex = value.indexOf(' #');
    if (commentIndex > 0) {
      value = value.slice(0, commentIndex).trim();
    }

    if (key && value) {
      entries.push({ key, value });
    }
  }

  return entries;
}

// ── APP_ Prefix Stripping ────────────────────────────────────────

/**
 * Get app credential pairs from a .env.app file.
 * Strips the APP_ prefix so apps get standard variable names.
 * e.g., APP_DATABASE_URL → DATABASE_URL
 *
 * @param filePath Path to the .env.app file
 * @returns Array of {key, value} pairs with APP_ prefix stripped
 */
export function getAppCredentialPairs(filePath: string): EnvEntry[] {
  const entries = parseEnvFile(filePath);
  return entries.map(e => ({
    key: e.key.startsWith(APP_PREFIX) ? e.key.slice(APP_PREFIX.length) : e.key,
    value: e.value,
  }));
}

/**
 * Get app credential names with APP_ prefix stripped.
 * Useful for telling workers what credentials are available.
 */
export function getAvailableAppCredentialNames(filePath: string): string[] {
  return getAppCredentialPairs(filePath).map(e => e.key);
}

// ── Multi-Format Export (Tier 3 is platform-agnostic) ────────────
//
// Tier 1 and 2 are always Node.js, so they only need dotenv format.
// Tier 3 targets arbitrary platforms, so we provide multiple output
// formats. The .env.app file is the canonical KEY=VALUE transfer
// format. Workers read it and convert to whatever the project needs.

/**
 * Format app credentials for a specific project platform.
 *
 * Workers call this when they know what kind of project they're building
 * and need to inject Tier 3 credentials in the right format.
 *
 * Supported formats:
 *   - dotenv:         KEY=VALUE (Node.js, Python with python-dotenv, Ruby, etc.)
 *   - json:           {"KEY": "VALUE"} (any language can parse JSON)
 *   - shell:          export KEY="VALUE" (bash scripts, sourced configs)
 *   - docker-compose: YAML environment block for docker-compose.yml
 *   - yaml:           Flat YAML key: "value" (Kubernetes, Helm, generic config)
 */
export function formatAppEnv(pairs: EnvEntry[], format: AppEnvFormat): string {
  if (pairs.length === 0) return '';

  switch (format) {
    case 'dotenv':
      return pairs.map(p => `${p.key}=${p.value}`).join('\n') + '\n';

    case 'json': {
      const obj: Record<string, string> = {};
      for (const p of pairs) obj[p.key] = p.value;
      return JSON.stringify(obj, null, 2) + '\n';
    }

    case 'shell':
      return pairs.map(p => `export ${p.key}="${escapeShellValue(p.value)}"`).join('\n') + '\n';

    case 'docker-compose':
      // Indented for use inside a docker-compose.yml `environment:` block
      return pairs.map(p => `      - ${p.key}=${p.value}`).join('\n') + '\n';

    case 'yaml':
      return pairs.map(p => `${p.key}: "${escapeYamlValue(p.value)}"`).join('\n') + '\n';

    default:
      return pairs.map(p => `${p.key}=${p.value}`).join('\n') + '\n';
  }
}

// ── Tier Isolation Validation ────────────────────────────────────

export interface TierLeakageResult {
  clean: boolean;
  leaks: Array<{ key: string; foundInTier: string; belongsToTier: string }>;
}

/**
 * Check a worker env file for Tier 1 (executive) key leakage.
 * Returns clean:true if no executive keys are found in the worker env.
 */
export function checkWorkerEnvForLeaks(workerEnvPath: string): TierLeakageResult {
  const entries = parseEnvFile(workerEnvPath);
  const leaks: TierLeakageResult['leaks'] = [];

  for (const entry of entries) {
    if (TIER1_EXECUTIVE_KEYS.has(entry.key)) {
      leaks.push({
        key: entry.key,
        foundInTier: 'worker',
        belongsToTier: 'executive',
      });
    }
  }

  return { clean: leaks.length === 0, leaks };
}

/**
 * Check an app env file for Tier 1 or Tier 2 key leakage.
 * Returns clean:true if no executive/worker keys are found in the app env.
 */
export function checkAppEnvForLeaks(appEnvPath: string): TierLeakageResult {
  const entries = parseEnvFile(appEnvPath);
  const leaks: TierLeakageResult['leaks'] = [];

  for (const entry of entries) {
    if (TIER1_EXECUTIVE_KEYS.has(entry.key)) {
      leaks.push({
        key: entry.key,
        foundInTier: 'app',
        belongsToTier: 'executive',
      });
    }
    if (TIER2_WORKER_KEYS.has(entry.key)) {
      leaks.push({
        key: entry.key,
        foundInTier: 'app',
        belongsToTier: 'worker',
      });
    }
  }

  return { clean: leaks.length === 0, leaks };
}

/**
 * Resolve the effective env file for a given tier.
 * Checks for the tiered file first, falls back to legacy .env.
 *
 * @param projectRoot Root directory containing env files
 * @param tier Which tier to resolve
 * @returns Absolute path to the env file, or null if none found
 */
export function resolveEnvFile(
  projectRoot: string,
  tier: 'executive' | 'worker' | 'app'
): string | null {
  const tierMap = {
    executive: ['.env.executive', '.env'],
    worker: ['.env.worker', '.env'],
    app: ['.env.app'],
  };

  for (const candidate of tierMap[tier]) {
    const fullPath = path.join(projectRoot, candidate);
    if (existsSync(fullPath)) return fullPath;
  }

  return null;
}

// ── Internal helpers ─────────────────────────────────────────────

/** Escape a value for safe use inside double-quoted shell strings */
function escapeShellValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

/** Escape a value for safe use inside double-quoted YAML strings */
function escapeYamlValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
