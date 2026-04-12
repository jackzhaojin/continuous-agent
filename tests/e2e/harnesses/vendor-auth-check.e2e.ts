/**
 * E2E test — Vendor credential validation for harness CLI.
 *
 *   npx tsx tests/e2e/harnesses/vendor-auth-check.e2e.ts
 *
 * Validates that the harness CLI can authenticate each vendor using
 * CLI-based login (no API keys required):
 *   - Claude: CLAUDE_CODE_OAUTH_TOKEN in .env.worker or env
 *   - Codex: ~/.codex/auth.json (from `codex login`)
 *   - Kimi: ~/.kimi/ session (from `kimi login`)
 *
 * This test does NOT make live API calls — it only checks that the
 * local credential files and env vars are in place so harness runs
 * won't fail at the auth gate.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

import { getAgentWorkerProviderForVendor, resetProviders } from '../../../src/core/vendor/vendor-registry.js';

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${label}`);
    console.log(`      ${(err as Error).message}`);
    failed++;
  }
}

function loadWorkerEnv(): void {
  const root = resolve(import.meta.dirname, '../../..');
  for (const envFile of ['.env.worker', '.env']) {
    try {
      const content = readFileSync(join(root, envFile), 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch { /* file may not exist */ }
  }
}

function main(): void {
  console.log('\n=== Vendor Auth Check (Harness CLI) ===\n');

  loadWorkerEnv();

  // ── Claude ────────────────────────────────────────────────
  console.log('[Claude]');

  check('CLAUDE_CODE_OAUTH_TOKEN is set', () => {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    assert.ok(token && token.length > 10, 'Token missing or too short');
  });

  check('Claude provider validateAuth passes', () => {
    resetProviders();
    const provider = getAgentWorkerProviderForVendor('claude');
    const auth = provider.validateAuth();
    assert.ok(auth.valid, `Auth failed: ${auth.error}`);
  });

  // ── Codex ─────────────────────────────────────────────────
  console.log('\n[Codex]');

  const codexAuthPath = join(homedir(), '.codex', 'auth.json');

  check('~/.codex/auth.json exists', () => {
    assert.ok(existsSync(codexAuthPath), `Not found: ${codexAuthPath}`);
  });

  check('~/.codex/auth.json has valid credentials', () => {
    const raw = readFileSync(codexAuthPath, 'utf8');
    const auth = JSON.parse(raw);
    const hasKey = !!(auth.OPENAI_API_KEY || auth.tokens);
    assert.ok(hasKey, 'No OPENAI_API_KEY or tokens in auth.json');
  });

  check('Codex CLI is installed', () => {
    const version = execSync('codex --version 2>&1', { encoding: 'utf8' }).trim();
    assert.ok(version.includes('codex'), `Unexpected version output: ${version}`);
  });

  // Note: Codex provider.validateAuth() only checks env vars, not CLI login.
  // The harness CLI has a fallback for ~/.codex/auth.json (cli.ts:270+).
  // We test the file-based check here since that's the real auth path.

  // ── Kimi ──────────────────────────────────────────────────
  console.log('\n[Kimi]');

  check('Kimi CLI is installed', () => {
    const version = execSync('kimi --version 2>&1', { encoding: 'utf8' }).trim();
    assert.ok(version.includes('kimi'), `Unexpected version output: ${version}`);
  });

  check('Kimi provider validateAuth passes (CLI login)', () => {
    resetProviders();
    const provider = getAgentWorkerProviderForVendor('kimi-cli');
    const auth = provider.validateAuth();
    assert.ok(auth.valid, `Auth failed: ${auth.error}`);
  });

  check('Kimi wire provider validateAuth passes', () => {
    resetProviders();
    const provider = getAgentWorkerProviderForVendor('kimi-wire');
    const auth = provider.validateAuth();
    assert.ok(auth.valid, `Auth failed: ${auth.error}`);
  });

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ Some vendor credentials are missing.');
    console.log('Fix: run `codex login` and/or `kimi login`, ensure .env.worker has CLAUDE_CODE_OAUTH_TOKEN');
    process.exit(1);
  }

  console.log('\n✅ All vendor credentials are valid for harness runs.');
  console.log('  • Claude: OAuth token from .env.worker');
  console.log('  • Codex: CLI login (~/.codex/auth.json)');
  console.log('  • Kimi: CLI login (kimi --version + validateAuth)');
}

main();
