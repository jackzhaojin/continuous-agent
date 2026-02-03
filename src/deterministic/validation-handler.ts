/**
 * Work validation logic - MIXED AGENTIC/DETERMINISTIC
 * Deterministic: Running verifiers
 * Agentic: Interpreting results, deciding if work passes
 *
 * Step-aware validation:
 * - Research steps get lighter validation (git clean, some output exists)
 * - Setup steps check project structure (package.json, npm install)
 * - Implementation/testing steps get full validation suite
 */

import { runAllVerifiers, summarizeResults, type StepContext, type GoalType } from './verifiers/index.js';
import {
  updateCapabilitiesFromVerifierResults,
  DEFAULT_CAPABILITY_MAPPINGS,
} from '../agentic/learning/capability-updater.js';
import type { WorkItem, WorkStep, WorkerResult } from '../core/types.js';
import { logAgentic, logDeterministic, log } from '../core/logging.js';

/**
 * Validate work using verifiers
 * MIXED: Deterministic verifier execution + Agentic result interpretation
 *
 * Worker success is the PRIMARY signal for goal completion.
 * Verifiers are ADVISORY — their failures are logged and recorded in
 * capability scores but do NOT prevent a successful worker's goal from
 * being marked complete. This avoids infinite retry loops for non-app
 * tasks (media production, research, etc.) where app-centric verifiers
 * (node_build, docs_checklist, etc.) are not applicable.
 *
 * @param item - The work item being validated
 * @param result - The worker result
 * @param currentStep - Optional current step for step-aware validation
 */
export async function validateWork(
  item: WorkItem,
  result: WorkerResult | null,
  currentStep?: WorkStep
): Promise<boolean> {
  if (!result) {
    log('  No result to validate');
    return false;
  }

  if (!result.output_path) {
    log('  No output path to validate');
    // Even without an output path, if the worker reported success we should
    // not block completion (some tasks may not produce a file-system artifact).
    if (result.success) {
      logAgentic('  Worker reported success but no output path — accepting as valid (advisory)');
      return true;
    }
    return false;
  }

  try {
    // Build step context for step-aware validation
    const stepContext: StepContext | undefined = currentStep
      ? {
          step_number: currentStep.step_number,
          step_title: currentStep.title,
          total_steps: item.steps?.length || 1,
        }
      : undefined;

    // Derive task type for verifier routing
    const goalType: GoalType | undefined = item.skillBuild
      ? 'skill-build'
      : item.selfEnhance
        ? 'self-enhance'
        : undefined;

    logDeterministic(`Running verifiers against: ${result.output_path}`);

    if (goalType) {
      logDeterministic(`  Verifier mode: ${goalType}`);
    } else if (stepContext) {
      logDeterministic(`  Verifier mode: step ${stepContext.step_number + 1}/${stepContext.total_steps} ("${stepContext.step_title}")`);
    }

    // DETERMINISTIC: Run verifiers (mechanical checks)
    // Pass step context and task type for routing
    const verifierResults = await runAllVerifiers(
      { project_path: result.output_path },
      stepContext,
      goalType
    );

    const summary = summarizeResults(verifierResults);

    log(`  Verifier results: ${summary.pass_count} passed, ${summary.fail_count} failed (path: ${result.output_path})`);

    // Always update capability scores from verifier results regardless of outcome
    updateCapabilitiesFromVerifierResults(verifierResults, DEFAULT_CAPABILITY_MAPPINGS);

    // AGENTIC: Interpret results and decide if work passes
    // Worker success is the PRIMARY signal. Verifiers are advisory.
    const overallStatus = summary.overall;

    if (overallStatus === 'PASS') {
      logAgentic('  All verifiers passed');
      return true;
    }

    // --- Verifiers did not all pass ---

    const failedVerifiers = verifierResults
      .filter((v) => v.result === 'FAIL')
      .map((v) => v.verifier_id);

    const hasBlockingFailures = failedVerifiers.includes('git_status_clean');

    if (overallStatus === 'PARTIAL' && !hasBlockingFailures) {
      logAgentic('  Partial pass - some optional verifiers failed');
      log(`  Continuing despite minor issues`);
      return true;
    }

    // If the worker itself reported success, treat verifier failures as advisory
    // warnings. This prevents infinite retry loops for non-app tasks (demo
    // videos, media production, research, etc.) where app-centric verifiers
    // (node_build, docs_checklist, etc.) are inapplicable.
    if (result.success) {
      logAgentic('  Worker reported SUCCESS — treating verifier failures as advisory warnings');
      if (failedVerifiers.length > 0) {
        log(`  Advisory verifier warnings: ${failedVerifiers.join(', ')}`);
      }
      return true;
    }

    // Worker failed AND verifiers failed — genuine failure, trigger retry
    logAgentic('  Validation failed (worker did not report success)');
    log(`  Overall status: ${overallStatus}`);

    if (failedVerifiers.length > 0) {
      log(`  Failed verifiers: ${failedVerifiers.join(', ')}`);
    }

    return false;
  } catch (error) {
    log(`  Validation error: ${error}`);
    // If verifier execution itself errors but worker succeeded, don't block
    if (result.success) {
      logAgentic('  Verifier error but worker reported success — accepting as valid');
      return true;
    }
    return false;
  }
}
