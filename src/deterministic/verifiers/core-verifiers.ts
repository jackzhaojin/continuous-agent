/**
 * Core Verifiers - The proof engine
 *
 * Per PRD: Verifiers are triggered deterministically but evaluated agentically.
 * They produce PASS/FAIL + evidence, enabling honest capability assessment.
 *
 * No verifier = not proven. Self-report does not count.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface VerifierResult {
  verifier_id: string;
  result: 'PASS' | 'FAIL';
  message: string;
  evidence: Record<string, unknown>;
  duration_ms: number;
}

export interface VerifierConfig {
  project_path: string;
  timeout_ms?: number;
}

/**
 * Verifier 1: git_status_clean
 * Checks that the git working tree is clean (no uncommitted changes)
 */
export async function verifyGitStatusClean(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: project_path,
      timeout: config.timeout_ms || 10000,
    });

    const isClean = stdout.trim() === '';
    const changedFiles = stdout.trim().split('\n').filter(Boolean);

    return {
      verifier_id: 'git_status_clean',
      result: isClean ? 'PASS' : 'FAIL',
      message: isClean ? 'Working tree is clean' : `${changedFiles.length} uncommitted changes`,
      evidence: {
        clean: isClean,
        changed_files: changedFiles.slice(0, 10), // Limit to 10
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      verifier_id: 'git_status_clean',
      result: 'FAIL',
      message: `Git check failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence: { error: true },
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Verifier 2: commit_exists
 * Checks that at least one commit exists in the repo
 */
export async function verifyCommitExists(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  try {
    const { stdout } = await execAsync('git log --oneline -5', {
      cwd: project_path,
      timeout: config.timeout_ms || 10000,
    });

    const commits = stdout.trim().split('\n').filter(Boolean);
    const hasCommits = commits.length > 0;

    return {
      verifier_id: 'commit_exists',
      result: hasCommits ? 'PASS' : 'FAIL',
      message: hasCommits ? `Found ${commits.length} recent commits` : 'No commits found',
      evidence: {
        commit_count: commits.length,
        recent_commits: commits.slice(0, 5),
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      verifier_id: 'commit_exists',
      result: 'FAIL',
      message: `Git log failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence: { error: true },
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Verifier 3: files_exist
 * Checks that required files exist
 */
export async function verifyFilesExist(
  config: VerifierConfig,
  requiredFiles: string[]
): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  const results: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const file of requiredFiles) {
    const fullPath = path.join(project_path, file);
    const exists = existsSync(fullPath);
    results[file] = exists;
    if (!exists) {
      missing.push(file);
    }
  }

  const allExist = missing.length === 0;

  return {
    verifier_id: 'files_exist',
    result: allExist ? 'PASS' : 'FAIL',
    message: allExist ? `All ${requiredFiles.length} required files exist` : `Missing: ${missing.join(', ')}`,
    evidence: {
      files_checked: results,
      missing,
    },
    duration_ms: Date.now() - start,
  };
}

/**
 * Verifier 4: node_install
 * Checks that npm install/ci succeeds
 */
export async function verifyNodeInstall(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  // Check if package.json exists
  const packageJsonPath = path.join(project_path, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      verifier_id: 'node_install',
      result: 'FAIL',
      message: 'No package.json found',
      evidence: { package_json_exists: false },
      duration_ms: Date.now() - start,
    };
  }

  try {
    // Use npm ci for reproducible installs, fall back to npm install
    const { stdout, stderr } = await execAsync('npm ci || npm install', {
      cwd: project_path,
      timeout: config.timeout_ms || 120000, // 2 min timeout
    });

    return {
      verifier_id: 'node_install',
      result: 'PASS',
      message: 'npm install succeeded',
      evidence: {
        stdout: stdout.slice(-500),
        stderr: stderr.slice(-500),
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      verifier_id: 'node_install',
      result: 'FAIL',
      message: `npm install failed: ${errorMsg.slice(0, 200)}`,
      evidence: {
        error: errorMsg.slice(0, 1000),
      },
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Verifier 5: node_build
 * Checks that npm run build succeeds
 */
export async function verifyNodeBuild(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  // Check if build script exists
  const packageJsonPath = path.join(project_path, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      verifier_id: 'node_build',
      result: 'FAIL',
      message: 'No package.json found',
      evidence: { package_json_exists: false },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (!packageJson.scripts?.build) {
      return {
        verifier_id: 'node_build',
        result: 'FAIL',
        message: 'No build script in package.json',
        evidence: { has_build_script: false },
        duration_ms: Date.now() - start,
      };
    }
  } catch (e) {
    return {
      verifier_id: 'node_build',
      result: 'FAIL',
      message: 'Failed to parse package.json',
      evidence: { parse_error: true },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: project_path,
      timeout: config.timeout_ms || 300000, // 5 min timeout
    });

    return {
      verifier_id: 'node_build',
      result: 'PASS',
      message: 'Build succeeded',
      evidence: {
        stdout: stdout.slice(-500),
        stderr: stderr.slice(-500),
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      verifier_id: 'node_build',
      result: 'FAIL',
      message: `Build failed: ${errorMsg.slice(0, 200)}`,
      evidence: {
        error: errorMsg.slice(0, 1000),
      },
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Verifier 6: node_test
 * Checks that npm test succeeds (if tests exist)
 */
export async function verifyNodeTest(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  const packageJsonPath = path.join(project_path, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      verifier_id: 'node_test',
      result: 'FAIL',
      message: 'No package.json found',
      evidence: { package_json_exists: false },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (!packageJson.scripts?.test || packageJson.scripts.test === 'echo "Error: no test specified" && exit 1') {
      // No tests configured - this is a PASS with note
      return {
        verifier_id: 'node_test',
        result: 'PASS',
        message: 'No test script configured (acceptable for MVP)',
        evidence: { has_test_script: false, note: 'No tests to run' },
        duration_ms: Date.now() - start,
      };
    }
  } catch (e) {
    return {
      verifier_id: 'node_test',
      result: 'FAIL',
      message: 'Failed to parse package.json',
      evidence: { parse_error: true },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const { stdout, stderr } = await execAsync('npm test', {
      cwd: project_path,
      timeout: config.timeout_ms || 120000, // 2 min timeout
    });

    return {
      verifier_id: 'node_test',
      result: 'PASS',
      message: 'Tests passed',
      evidence: {
        stdout: stdout.slice(-500),
        stderr: stderr.slice(-500),
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      verifier_id: 'node_test',
      result: 'FAIL',
      message: `Tests failed: ${errorMsg.slice(0, 200)}`,
      evidence: {
        error: errorMsg.slice(0, 1000),
      },
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Verifier 7: lint_pass
 * Checks that linting passes (if configured)
 */
export async function verifyLintPass(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  const packageJsonPath = path.join(project_path, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      verifier_id: 'lint_pass',
      result: 'PASS',
      message: 'No package.json - linting not applicable',
      evidence: { package_json_exists: false },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (!packageJson.scripts?.lint) {
      return {
        verifier_id: 'lint_pass',
        result: 'PASS',
        message: 'No lint script configured',
        evidence: { has_lint_script: false },
        duration_ms: Date.now() - start,
      };
    }
  } catch (e) {
    return {
      verifier_id: 'lint_pass',
      result: 'FAIL',
      message: 'Failed to parse package.json',
      evidence: { parse_error: true },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const { stdout, stderr } = await execAsync('npm run lint', {
      cwd: project_path,
      timeout: config.timeout_ms || 60000, // 1 min timeout
    });

    return {
      verifier_id: 'lint_pass',
      result: 'PASS',
      message: 'Linting passed',
      evidence: {
        stdout: stdout.slice(-500),
        stderr: stderr.slice(-500),
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      verifier_id: 'lint_pass',
      result: 'FAIL',
      message: `Linting failed: ${errorMsg.slice(0, 200)}`,
      evidence: {
        error: errorMsg.slice(0, 1000),
      },
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Verifier 8: docs_checklist
 * Checks that basic documentation exists
 */
export async function verifyDocsChecklist(config: VerifierConfig): Promise<VerifierResult> {
  const start = Date.now();
  const { project_path } = config;

  const checks: Record<string, boolean> = {};
  const issues: string[] = [];

  // Check README exists
  const readmePath = path.join(project_path, 'README.md');
  checks['readme_exists'] = existsSync(readmePath);
  if (!checks['readme_exists']) {
    issues.push('Missing README.md');
  }

  // Check README has content
  if (checks['readme_exists']) {
    const content = readFileSync(readmePath, 'utf-8');
    checks['readme_has_content'] = content.length > 50;
    if (!checks['readme_has_content']) {
      issues.push('README.md is too short (< 50 chars)');
    }

    // Check for run instructions
    const hasRunInstructions =
      content.toLowerCase().includes('npm run') ||
      content.toLowerCase().includes('how to run') ||
      content.toLowerCase().includes('getting started') ||
      content.toLowerCase().includes('installation');
    checks['has_run_instructions'] = hasRunInstructions;
    if (!hasRunInstructions) {
      issues.push('README missing run instructions');
    }
  }

  const allPassing = issues.length === 0;

  return {
    verifier_id: 'docs_checklist',
    result: allPassing ? 'PASS' : 'FAIL',
    message: allPassing ? 'Documentation checklist passed' : `Issues: ${issues.join(', ')}`,
    evidence: {
      checks,
      issues,
    },
    duration_ms: Date.now() - start,
  };
}

/**
 * Run all applicable verifiers for a project
 */
export async function runAllVerifiers(config: VerifierConfig): Promise<VerifierResult[]> {
  const results: VerifierResult[] = [];

  // Run verifiers in sequence
  results.push(await verifyGitStatusClean(config));
  results.push(await verifyFilesExist(config, ['package.json', 'README.md']));
  results.push(await verifyNodeInstall(config));
  results.push(await verifyNodeBuild(config));
  results.push(await verifyNodeTest(config));
  results.push(await verifyLintPass(config));
  results.push(await verifyDocsChecklist(config));

  return results;
}

/**
 * Summarize verifier results
 */
export function summarizeResults(results: VerifierResult[]): {
  overall: 'PASS' | 'FAIL' | 'PARTIAL';
  pass_count: number;
  fail_count: number;
  summary: string;
} {
  const pass_count = results.filter(r => r.result === 'PASS').length;
  const fail_count = results.filter(r => r.result === 'FAIL').length;

  let overall: 'PASS' | 'FAIL' | 'PARTIAL';
  if (fail_count === 0) {
    overall = 'PASS';
  } else if (pass_count === 0) {
    overall = 'FAIL';
  } else {
    overall = 'PARTIAL';
  }

  const summary = `${pass_count}/${results.length} verifiers passed`;

  return { overall, pass_count, fail_count, summary };
}
