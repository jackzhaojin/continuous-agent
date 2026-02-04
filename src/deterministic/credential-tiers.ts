/**
 * Credential Tiers - Three-tier environment variable classification
 *
 * Tier 1 (Executive): Keys the executive loop needs to orchestrate work.
 *   Always Node.js. Loop timing, reporting, breakdown config.
 *   Never copied to workers.
 *
 * Tier 2 (Execution Agent): Keys worker agents need to execute tasks.
 *   Always Node.js (Claude Agent SDK today, possibly other agents later).
 *   Agent SDK auth, model, tool-specific APIs. Copied to agent-outputs/.env.
 *
 * Tier 3 (Application): Keys that built applications need.
 *   Platform-agnostic — the target project could be Node.js, Python, Docker,
 *   bash, iOS, C++, or anything else. Prefixed with APP_ in the agent's .env.
 *   Written to agent-outputs/.env.app as a KEY=VALUE transfer file.
 *   Workers (always Node.js) read this file and inject credentials into the
 *   project in whatever format is appropriate (dotenv, docker-compose.yml,
 *   config.py, Xcode scheme, CMakeLists.txt, etc.).
 *
 * Some keys are "shared" across tiers (e.g., ANTHROPIC_API_KEY is needed
 * by both Tier 1 for diagnosis and Tier 2 for worker spawning).
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';

// ── Tier Definitions ──────────────────────────────────────────────

export type CredentialTier = 'executive' | 'execution' | 'application';

interface TierClassification {
  tier: CredentialTier;
  shared_with?: CredentialTier[];
}

/**
 * Static registry of known environment variables and their tier.
 * Variables not in this registry are classified by prefix heuristic.
 */
const KNOWN_VARIABLES: Record<string, TierClassification> = {
  // ── Tier 1: Executive ─────────────────────────────────
  IDLE_SLEEP_SECONDS:        { tier: 'executive' },
  UNHEALTHY_SLEEP_SECONDS:   { tier: 'executive' },
  BREAKDOWN_THRESHOLD_TURNS: { tier: 'executive' },
  AUTO_BREAKDOWN_ENABLED:    { tier: 'executive' },
  MAX_TURNS:                 { tier: 'executive' },
  MAX_TURNS_PER_STEP:        { tier: 'executive' },
  NOTION_API_KEY:            { tier: 'executive' },
  NOTION_DATABASE_ID:        { tier: 'executive' },
  NOTION_MONTHLY_PAGE_ID:    { tier: 'executive' },
  NOTION_REPORTING_ENABLED:  { tier: 'executive' },
  AGENT_OUTPUTS_PATH:        { tier: 'executive' },
  AGENT_PATH:                { tier: 'executive' },
  NODE_ENV:                  { tier: 'executive' },

  // ── Tier 2: Execution Agent (some shared with Tier 1) ─
  CLAUDE_CODE_OAUTH_TOKEN:   { tier: 'execution', shared_with: ['executive'] },
  ANTHROPIC_API_KEY:         { tier: 'execution', shared_with: ['executive'] },
  MODEL:                     { tier: 'execution', shared_with: ['executive'] },
  ELEVENLABS_API_KEY:        { tier: 'execution' },

  // Future execution agent keys:
  // OPENAI_API_KEY:          { tier: 'execution' },
  // GEMINI_API_KEY:          { tier: 'execution' },
};

/**
 * Auto-prefix for application tier: any env var starting with APP_
 * is automatically classified as Tier 3 (application).
 */
const APP_PREFIX = 'APP_';

// ── Classification ────────────────────────────────────────────────

/**
 * Classify a single environment variable by name.
 * 1. Check the static registry
 * 2. Check for APP_ prefix (auto-classified as application)
 * 3. Default to execution tier (safest default — workers can use it)
 */
export function classifyVariable(name: string): TierClassification {
  // Known variable
  if (KNOWN_VARIABLES[name]) {
    return KNOWN_VARIABLES[name];
  }

  // APP_ prefix → application tier
  if (name.startsWith(APP_PREFIX)) {
    return { tier: 'application' };
  }

  // Unknown variables default to execution tier
  // (better to give workers access than to silently withhold a needed key)
  return { tier: 'execution' };
}

/**
 * Check if a variable belongs to (or is shared with) a given tier.
 */
export function variableBelongsToTier(name: string, tier: CredentialTier): boolean {
  const classification = classifyVariable(name);

  // Direct match
  if (classification.tier === tier) return true;

  // Shared with this tier
  if (classification.shared_with?.includes(tier)) return true;

  return false;
}

// ── Env File Parsing & Generation ─────────────────────────────────

interface EnvEntry {
  key: string;
  value: string;
  comment?: string;  // Preceding comment lines (for preservation)
}

/**
 * Parse a .env file into structured entries, preserving comments.
 */
export function parseEnvFile(filePath: string): EnvEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: EnvEntry[] = [];
  let pendingComment = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (reset pending comment)
    if (!trimmed) {
      pendingComment = '';
      continue;
    }

    // Accumulate comments
    if (trimmed.startsWith('#')) {
      pendingComment += (pendingComment ? '\n' : '') + line;
      continue;
    }

    // Parse KEY=VALUE
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      entries.push({
        key,
        value,
        comment: pendingComment || undefined,
      });
      pendingComment = '';
    }
  }

  return entries;
}

/**
 * Filter env entries to only those belonging to the specified tiers.
 */
export function filterEnvEntries(entries: EnvEntry[], tiers: CredentialTier[]): EnvEntry[] {
  return entries.filter(entry =>
    tiers.some(tier => variableBelongsToTier(entry.key, tier))
  );
}

/**
 * Generate .env file content from entries.
 * Only includes entries that have a non-empty value.
 */
export function generateEnvContent(entries: EnvEntry[], options?: { includeEmpty?: boolean }): string {
  const lines: string[] = [];

  for (const entry of entries) {
    // Skip entries with no value unless includeEmpty is set
    if (!entry.value && !options?.includeEmpty) continue;

    if (entry.comment) {
      lines.push(entry.comment);
    }
    lines.push(`${entry.key}=${entry.value}`);
    lines.push('');  // Blank line separator
  }

  return lines.join('\n');
}

// ── High-Level API ────────────────────────────────────────────────

/**
 * Read the main .env file and return entries filtered for worker use.
 * Workers get Tier 2 (execution) + Tier 3 (application) credentials.
 * Tier 1 (executive-only) keys like Notion, loop timing are excluded.
 */
export function getWorkerEnv(envFilePath: string): string {
  const entries = parseEnvFile(envFilePath);
  const workerEntries = filterEnvEntries(entries, ['execution', 'application']);
  return generateEnvContent(workerEntries);
}

/**
 * Read the main .env file and return entries filtered for application use.
 * Applications get Tier 3 (application) credentials only.
 * These are the APP_* prefixed keys.
 */
export function getAppEnv(envFilePath: string): string {
  const entries = parseEnvFile(envFilePath);
  const appEntries = filterEnvEntries(entries, ['application']);

  // Strip the APP_ prefix when writing to .env.app
  // so apps can use standard variable names (e.g., DATABASE_URL instead of APP_DATABASE_URL)
  const strippedEntries = appEntries.map(entry => ({
    ...entry,
    key: entry.key.startsWith(APP_PREFIX) ? entry.key.slice(APP_PREFIX.length) : entry.key,
  }));

  return generateEnvContent(strippedEntries);
}

/**
 * Get a summary of available credentials by tier.
 * Useful for informing workers about what app credentials are available.
 */
export function getAvailableCredentialsSummary(envFilePath: string): {
  executive: string[];
  execution: string[];
  application: string[];
} {
  const entries = parseEnvFile(envFilePath);
  const withValues = entries.filter(e => e.value);  // Only entries with actual values

  return {
    executive: withValues
      .filter(e => variableBelongsToTier(e.key, 'executive'))
      .map(e => e.key),
    execution: withValues
      .filter(e => variableBelongsToTier(e.key, 'execution'))
      .map(e => e.key),
    application: withValues
      .filter(e => variableBelongsToTier(e.key, 'application'))
      .map(e => e.key),
  };
}

/**
 * Get app credential names with the APP_ prefix stripped.
 * Workers can tell apps which credentials are available by standard names.
 * e.g., APP_DATABASE_URL → DATABASE_URL
 */
export function getAvailableAppCredentialNames(envFilePath: string): string[] {
  const entries = parseEnvFile(envFilePath);
  return entries
    .filter(e => e.value && variableBelongsToTier(e.key, 'application'))
    .map(e => e.key.startsWith(APP_PREFIX) ? e.key.slice(APP_PREFIX.length) : e.key);
}

// ── Multi-Format Export (Tier 3 is platform-agnostic) ─────────────
//
// Tier 1 and 2 are always Node.js, so they only need dotenv format.
// Tier 3 targets arbitrary platforms, so we provide multiple output
// formats. The .env.app file at agent-outputs/ root is the canonical
// KEY=VALUE transfer format. Workers read it and convert to whatever
// the project needs using these helpers.

export type AppEnvFormat = 'dotenv' | 'json' | 'shell' | 'docker-compose' | 'yaml';

/**
 * Get Tier 3 (application) credentials as key-value pairs.
 * APP_ prefix is stripped. Only entries with values are included.
 * This is the raw data — use formatAppEnv() to render to a specific format.
 */
export function getAppCredentialPairs(envFilePath: string): Array<{ key: string; value: string }> {
  const entries = parseEnvFile(envFilePath);
  return entries
    .filter(e => e.value && variableBelongsToTier(e.key, 'application'))
    .map(e => ({
      key: e.key.startsWith(APP_PREFIX) ? e.key.slice(APP_PREFIX.length) : e.key,
      value: e.value,
    }));
}

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
export function formatAppEnv(pairs: Array<{ key: string; value: string }>, format: AppEnvFormat): string {
  if (pairs.length === 0) return '';

  switch (format) {
    case 'dotenv':
      return pairs.map(p => `${p.key}=${p.value}`).join('\n') + '\n';

    case 'json':
      const obj: Record<string, string> = {};
      for (const p of pairs) obj[p.key] = p.value;
      return JSON.stringify(obj, null, 2) + '\n';

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

/** Escape a value for safe use inside double-quoted shell strings */
function escapeShellValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

/** Escape a value for safe use inside double-quoted YAML strings */
function escapeYamlValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
