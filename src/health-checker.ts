import { exec } from 'child_process';
import { promisify } from 'util';
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
    const { stdout } = await execAsync('gh auth status 2>&1');
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
 * Run all health checks and return overall status
 */
export async function checkHealth(): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];

  // Run all checks
  checks.push(await checkGitHubCLI());
  checks.push(await checkDiskSpace());
  checks.push(checkNodeVersion());
  checks.push(await checkReferenceIntegrity());

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
