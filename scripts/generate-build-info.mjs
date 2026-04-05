#!/usr/bin/env node
/**
 * Generate build-info.json after TypeScript compilation.
 * Called automatically by `npm run build`.
 *
 * Produces dist/build-info.json with version, git hash, and timestamp.
 * The executive loop reads this on startup to log which build is running.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read base version from package.json
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const baseVersion = pkg.version;

// Get git short hash and check for dirty state
let gitHash = 'unknown';
let dirty = false;
try {
  gitHash = execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
  const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf-8' }).trim();
  dirty = status.length > 0;
} catch {
  // Not a git repo or git not available
}

const now = new Date();
const buildTime = now.toISOString();
// Eastern time (handles EDT/EST automatically)
const eastern = now.toLocaleString('sv-SE', { timeZone: 'America/New_York', hour12: false }).replace(/[-: ]/g, '');
// Format: 20260405T155500ET
const buildStamp = eastern.slice(0, 8) + 'T' + eastern.slice(8) + 'ET';
const buildVersion = `${baseVersion}+${gitHash}.${buildStamp}${dirty ? '.dirty' : ''}`;

const buildInfo = {
  version: baseVersion,
  buildVersion,
  gitHash,
  dirty,
  buildTime,
};

const outPath = join(rootDir, 'dist', 'build-info.json');
writeFileSync(outPath, JSON.stringify(buildInfo, null, 2) + '\n');

console.log(`Build: ${buildVersion} (${buildTime})`);
