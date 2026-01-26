/**
 * Work validation logic - MIXED AGENTIC/DETERMINISTIC
 * Deterministic: Running verifiers
 * Agentic: Interpreting results, deciding if work passes
 */

import { runAllVerifiers, summarizeResults } from './verifiers/index.js';
import {
  updateCapabilitiesFromVerifierResults,
  DEFAULT_CAPABILITY_MAPPINGS,
} from './learning/capability-updater.js';
import type { WorkItem, WorkerResult } from './types.js';
import { logAgentic, logDeterministic, log } from './logging.js';

/**
 * Validate work using verifiers
 * MIXED: Deterministic verifier execution + Agentic result interpretation
 */
export async function validateWork(
  item: WorkItem,
  result: WorkerResult | null
): Promise<boolean> {
  if (!result) {
    log('  No result to validate');
    return false;
  }

  if (!result.output_path) {
    log('  No output path to validate');
    return false;
  }

  try {
    logDeterministic('Running verifiers on worker output...');

    // DETERMINISTIC: Run verifiers (mechanical checks)
    const verifierResults = await runAllVerifiers({
      project_path: result.output_path,
    });

    const summary = summarizeResults(verifierResults);

    log(`  Verifier results: ${summary.pass_count} passed, ${summary.fail_count} failed`);

    // AGENTIC: Interpret results and decide if work passes
    // Not just PASS/FAIL, but understanding WHY and if it's acceptable
    const overallStatus = summary.overall;
    const hasBlockingFailures = verifierResults.some(
      (v) => v.result === 'FAIL' && v.verifier_id === 'git_status_clean'
    );

    if (overallStatus === 'PASS') {
      logAgentic('  ✓ All verifiers passed');
      updateCapabilitiesFromVerifierResults(verifierResults, DEFAULT_CAPABILITY_MAPPINGS);
      return true;
    } else if (overallStatus === 'PARTIAL' && !hasBlockingFailures) {
      logAgentic('  ⚠ Partial pass - some optional verifiers failed');
      log(`  Continuing despite minor issues`);
      updateCapabilitiesFromVerifierResults(verifierResults, DEFAULT_CAPABILITY_MAPPINGS);
      return true;
    } else {
      logAgentic('  ✗ Validation failed');
      log(`  Overall status: ${overallStatus}`);

      // Log failing verifiers
      const failedVerifiers = verifierResults
        .filter((v) => v.result === 'FAIL')
        .map((v) => v.verifier_id);

      if (failedVerifiers.length > 0) {
        log(`  Failed verifiers: ${failedVerifiers.join(', ')}`);
      }

      updateCapabilitiesFromVerifierResults(verifierResults, DEFAULT_CAPABILITY_MAPPINGS);
      return false;
    }
  } catch (error) {
    log(`  Validation error: ${error}`);
    return false;
  }
}
