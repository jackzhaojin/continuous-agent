import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { runIntegrityVerifier } from './verifiers/index.js';

const execAsync = promisify(exec);

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  timestamp: string;
}

/**
 * Check GitHub CLI authentication status
 */
async function checkGitHubCLI(): Promise<HealthCheck> {
  try {
    await execAsync('gh auth status 2>&1');
    return {
      name: 'github-cli',
      status: 'pass',
      message: 'GitHub CLI authenticated'
    };
  } catch (error) {
    return {
      name: 'github-cli',
      status: 'fail',
      message: error instanceof Error ? error.message : 'GitHub CLI not authenticated'
    };
  }
}

/**
 * Check available disk space
 */
async function checkDiskSpace(): Promise<HealthCheck> {
  try {
    const { stdout } = await execAsync('df -h .');
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      // parts format: Filesystem Size Used Avail Use% Mounted
      const usePercent = parseInt(parts[4]?.replace('%', '') || '0', 10);
      const available = parts[3] || 'unknown';

      if (usePercent > 90) {
        return {
          name: 'disk-space',
          status: 'fail',
          message: `Disk usage critical: ${usePercent}% used, ${available} available`
        };
      }

      return {
        name: 'disk-space',
        status: 'pass',
        message: `Disk usage: ${usePercent}% used, ${available} available`
      };
    }

    return {
      name: 'disk-space',
      status: 'fail',
      message: 'Unable to parse disk space output'
    };
  } catch (error) {
    return {
      name: 'disk-space',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Failed to check disk space'
    };
  }
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): HealthCheck {
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split('.')[0], 10);

  if (majorVersion >= 18) {
    return {
      name: 'node-version',
      status: 'pass',
      message: `Node.js ${version}`
    };
  }

  return {
    name: 'node-version',
    status: 'fail',
    message: `Node.js ${version} - requires >= 18.0.0`
  };
}

/**
 * Check reference integrity (registry and filesystem consistency)
 */
async function checkReferenceIntegrity(): Promise<HealthCheck> {
  try {
    const report = await runIntegrityVerifier();

    if (report.overall === 'PASS') {
      return {
        name: 'reference-integrity',
        status: 'pass',
        message: 'Reference registry and filesystem are consistent'
      };
    }

    // Collect issues
    const issues: string[] = [];
    if (report.orphans.length > 0) {
      issues.push(`${report.orphans.length} orphan(s)`);
    }
    if (report.missing.length > 0) {
      issues.push(`${report.missing.length} missing`);
    }

    return {
      name: 'reference-integrity',
      status: 'fail',
      message: `Reference integrity issues: ${issues.join(', ')}`
    };
  } catch (error) {
    return {
      name: 'reference-integrity',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Reference integrity check failed'
    };
  }
}

/**
 * Housekeep completed bundles that are still in in-progress/.
 * Scans in-progress/P{0-4}/ for bundles with status: complete in PROMPT.md
 * frontmatter and moves them to completed/.
 * DETERMINISTIC: File I/O only.
 */
export async function housekeepCompletedBundles(): Promise<string[]> {
  const workspaceDir = path.join(process.cwd(), 'workspace');
  const moved: string[] = [];

  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    const priorityDir = path.join(workspaceDir, 'in-progress', priority);
    if (!existsSync(priorityDir)) continue;

    let entries;
    try {
      entries = await readdir(priorityDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const promptPath = path.join(priorityDir, entry.name, 'PROMPT.md');
      if (!existsSync(promptPath)) continue;

      try {
        const content = await readFile(promptPath, 'utf-8');
        // Check for status: complete in frontmatter
        const statusMatch = content.match(/^status:\s*['"]?complete['"]?\s*$/mi);
        if (!statusMatch) continue;

        const completedDir = path.join(workspaceDir, 'completed');
        const destPath = path.join(completedDir, entry.name);

        if (existsSync(destPath)) continue; // Already exists in completed/

        await mkdir(completedDir, { recursive: true });
        await rename(path.join(priorityDir, entry.name), destPath);
        moved.push(entry.name);
        console.log(`[HealthCheck] Housekeep: moved completed bundle "${entry.name}" from in-progress/${priority}/ to completed/`);
      } catch {
        // Ignore individual bundle errors
      }
    }
  }

  return moved;
}

/**
 * Run all health checks and return overall status
 */
export async function checkHealth(): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];

  // Run all checks
  checks.push(await checkGitHubCLI());
  checks.push(await checkDiskSpace());
  checks.push(checkNodeVersion());
  checks.push(await checkReferenceIntegrity());

  // Housekeep completed bundles still sitting in in-progress/
  try {
    const movedBundles = await housekeepCompletedBundles();
    if (movedBundles.length > 0) {
      console.log(`[HealthCheck] Housekeeping: moved ${movedBundles.length} completed bundle(s) to completed/`);
    }
  } catch (e) {
    console.log(`[HealthCheck] Housekeeping failed (non-blocking): ${e}`);
  }

  // Determine overall status
  const failCount = checks.filter(c => c.status === 'fail').length;
  let overall: 'healthy' | 'degraded' | 'unhealthy';

  if (failCount === 0) {
    overall = 'healthy';
  } else if (failCount < checks.length) {
    overall = 'degraded';
  } else {
    overall = 'unhealthy';
  }

  return {
    overall,
    checks,
    timestamp: new Date().toISOString()
  };
}
