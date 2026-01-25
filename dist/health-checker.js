import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
/**
 * Check GitHub CLI authentication status
 */
async function checkGitHubCLI() {
    try {
        const { stdout } = await execAsync('gh auth status 2>&1');
        return {
            name: 'github-cli',
            status: 'pass',
            message: 'GitHub CLI authenticated'
        };
    }
    catch (error) {
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
async function checkDiskSpace() {
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
    }
    catch (error) {
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
function checkNodeVersion() {
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
 * Run all health checks and return overall status
 */
export async function checkHealth() {
    const checks = [];
    // Run all checks
    checks.push(await checkGitHubCLI());
    checks.push(await checkDiskSpace());
    checks.push(checkNodeVersion());
    // Determine overall status
    const failCount = checks.filter(c => c.status === 'fail').length;
    let overall;
    if (failCount === 0) {
        overall = 'healthy';
    }
    else if (failCount < checks.length) {
        overall = 'degraded';
    }
    else {
        overall = 'unhealthy';
    }
    return {
        overall,
        checks,
        timestamp: new Date().toISOString()
    };
}
//# sourceMappingURL=health-checker.js.map