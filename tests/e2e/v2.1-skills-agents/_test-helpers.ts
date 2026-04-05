/**
 * Shared helpers for v2.1 E2E tests.
 */

import path from 'path';
import { readFileSync } from 'fs';

export const AGENT_ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * Load environment variables from all credential tiers.
 * Checks: .env.executive, .env.worker, .env.app (strips APP_ prefix), .env.backup.local, .env
 * Won't overwrite already-set vars.
 */
export function loadAgentEnv() {
  const envFiles = ['.env.executive', '.env.worker', '.env.backup.local', '.env'];

  for (const envFile of envFiles) {
    try {
      const content = readFileSync(path.join(AGENT_ROOT, envFile), 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([A-Z][A-Z_0-9]*)=(.+)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch { /* ignore */ }
  }

  // .env.app uses APP_ prefix — strip it
  try {
    const content = readFileSync(path.join(AGENT_ROOT, '.env.app'), 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^APP_([A-Z][A-Z_0-9]*)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* ignore */ }
}

export const PASS = '✓';
export const FAIL = '✗';

export function createAssert() {
  const counts = { passed: 0, failed: 0 };

  function assert(condition: boolean, label: string, detail?: string) {
    if (condition) {
      console.log(`  ${PASS} ${label}`);
      counts.passed++;
    } else {
      console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
      counts.failed++;
    }
  }

  return { assert, counts };
}
