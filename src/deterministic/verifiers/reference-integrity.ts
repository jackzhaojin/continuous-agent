/**
 * Reference Integrity Verifier
 *
 * Per PRD Reference Management Addendum Part 8:
 * Ensures registry and filesystem never disagree.
 * Run after every reference operation and periodically.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface IntegrityCheckResult {
  check_name: string;
  result: 'PASS' | 'FAIL';
  message: string;
  details: Record<string, unknown>;
}

export interface IntegrityReport {
  ts: string;
  overall: 'PASS' | 'FAIL';
  checks: IntegrityCheckResult[];
  orphans: string[];
  missing: string[];
}

const REFERENCES_BASE = path.join(process.cwd(), 'references');
const REGISTRY_PATH = path.join(REFERENCES_BASE, 'reference-registry.yaml');

interface Reference {
  id: string;
  mode: 'A' | 'B' | 'C';
  source_path?: string;  // Explicit path from registry (relative to repo root or absolute)
}

interface Registry {
  references?: Reference[];
}

/**
 * Load the reference registry
 */
function loadRegistry(): Registry | null {
  try {
    if (!existsSync(REGISTRY_PATH)) {
      return null;
    }
    const content = readFileSync(REGISTRY_PATH, 'utf-8');
    return yaml.load(content) as Registry;
  } catch {
    return null;
  }
}

/**
 * List directories in a folder
 */
function listDirs(folderPath: string): string[] {
  try {
    if (!existsSync(folderPath)) {
      return [];
    }
    return readdirSync(folderPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

/**
 * Check: No orphan sources (every folder in sources/ must have registry entry)
 */
export function checkNoOrphanSources(): IntegrityCheckResult {
  const registry = loadRegistry();
  const sourcesDir = path.join(REFERENCES_BASE, 'sources');
  const dirs = listDirs(sourcesDir);

  const registeredIds = new Set(
    registry?.references?.filter(r => r.mode === 'A' || r.mode === 'B')
      .map(r => r.id) || []
  );

  const orphans = dirs.filter(d => !registeredIds.has(d));

  return {
    check_name: 'no_orphan_sources',
    result: orphans.length === 0 ? 'PASS' : 'FAIL',
    message: orphans.length === 0
      ? 'All sources have registry entries'
      : `Orphan sources: ${orphans.join(', ')}`,
    details: { orphans, checked: dirs.length },
  };
}

/**
 * Check: No orphan patches (every folder in patches/ must have Mode B entry)
 */
export function checkNoOrphanPatches(): IntegrityCheckResult {
  const registry = loadRegistry();
  const patchesDir = path.join(REFERENCES_BASE, 'patches');
  const dirs = listDirs(patchesDir);

  const modeBIds = new Set(
    registry?.references?.filter(r => r.mode === 'B').map(r => r.id) || []
  );

  const orphans = dirs.filter(d => !modeBIds.has(d));

  return {
    check_name: 'no_orphan_patches',
    result: orphans.length === 0 ? 'PASS' : 'FAIL',
    message: orphans.length === 0
      ? 'All patches have Mode B registry entries'
      : `Orphan patches: ${orphans.join(', ')}`,
    details: { orphans, checked: dirs.length },
  };
}

/**
 * Check: No orphan forks (every folder in forks/ must have Mode C entry)
 */
export function checkNoOrphanForks(): IntegrityCheckResult {
  const registry = loadRegistry();
  const forksDir = path.join(REFERENCES_BASE, 'forks');
  const dirs = listDirs(forksDir);

  const modeCIds = new Set(
    registry?.references?.filter(r => r.mode === 'C').map(r => r.id) || []
  );

  const orphans = dirs.filter(d => !modeCIds.has(d));

  return {
    check_name: 'no_orphan_forks',
    result: orphans.length === 0 ? 'PASS' : 'FAIL',
    message: orphans.length === 0
      ? 'All forks have Mode C registry entries'
      : `Orphan forks: ${orphans.join(', ')}`,
    details: { orphans, checked: dirs.length },
  };
}

/**
 * Check: No missing folders (every registry entry must have corresponding folder)
 * Uses source_path from registry when available, falls back to convention-based paths.
 */
export function checkNoMissingFolders(): IntegrityCheckResult {
  const registry = loadRegistry();
  const missing: string[] = [];

  if (registry?.references) {
    for (const ref of registry.references) {
      let expectedPath: string;

      // Prefer explicit source_path from registry (may be relative to repo root)
      if (ref.source_path) {
        expectedPath = path.isAbsolute(ref.source_path)
          ? ref.source_path
          : path.join(process.cwd(), ref.source_path);
      } else {
        // Fallback to convention-based paths
        switch (ref.mode) {
          case 'A':
          case 'B':
            expectedPath = path.join(REFERENCES_BASE, 'sources', ref.id);
            break;
          case 'C':
            expectedPath = path.join(REFERENCES_BASE, 'forks', ref.id);
            break;
          default:
            continue;
        }
      }

      if (!existsSync(expectedPath)) {
        missing.push(ref.id);
      }
    }
  }

  return {
    check_name: 'no_missing_folders',
    result: missing.length === 0 ? 'PASS' : 'FAIL',
    message: missing.length === 0
      ? 'All registry entries have corresponding folders'
      : `Missing folders: ${missing.join(', ')}`,
    details: { missing },
  };
}

/**
 * Run all integrity checks
 */
export async function runIntegrityVerifier(): Promise<IntegrityReport> {
  const checks: IntegrityCheckResult[] = [
    checkNoOrphanSources(),
    checkNoOrphanPatches(),
    checkNoOrphanForks(),
    checkNoMissingFolders(),
  ];

  const orphans = checks
    .filter(c => c.check_name.includes('orphan') && c.result === 'FAIL')
    .flatMap(c => (c.details.orphans as string[]) || []);

  const missing = checks
    .filter(c => c.check_name === 'no_missing_folders' && c.result === 'FAIL')
    .flatMap(c => (c.details.missing as string[]) || []);

  const overall = checks.every(c => c.result === 'PASS') ? 'PASS' : 'FAIL';

  return {
    ts: new Date().toISOString(),
    overall,
    checks,
    orphans,
    missing,
  };
}
