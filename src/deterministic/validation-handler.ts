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

    const passRatio = summary.pass_count / (summary.pass_count + summary.fail_count);

    // Blocking verifiers: if any of these fail, the goal cannot pass
    // For intermediate steps in multi-step goals, node_build is advisory (not blocking)
    // — intermediate steps may modify types/schema that break builds transiently.
    // node_build only blocks on the final step or single-step goals.
    const isIntermediateStep = stepContext && stepContext.step_number < stepContext.total_steps - 1;
    const blockingVerifiers = isIntermediateStep
      ? ['git_status_clean', 'node_install']
      : ['git_status_clean', 'node_build', 'node_install'];
    const hasBlockingFailures = failedVerifiers.some(v => blockingVerifiers.includes(v));

    // Require worker success AND reasonable pass ratio for partial pass
    if (overallStatus === 'PARTIAL' && !hasBlockingFailures && result.success && passRatio >= 0.5) {
      logAgentic('  Partial pass - some optional verifiers failed');
      log(`  Pass ratio: ${(passRatio * 100).toFixed(0)}% (${summary.pass_count}/${summary.pass_count + summary.fail_count})`);
      log(`  Advisory failures: ${failedVerifiers.join(', ')}`);
      return true;
    }

    // Worker reported success but verifiers show critical failures — don't trust it
    if (result.success && hasBlockingFailures) {
      logAgentic('  Worker reported SUCCESS but blocking verifiers failed — rejecting');
      log(`  Blocking failures: ${failedVerifiers.filter(v => blockingVerifiers.includes(v)).join(', ')}`);
      return false;
    }

    // Worker reported success with no blocking failures but low pass ratio
    if (result.success && !hasBlockingFailures && passRatio < 0.5) {
      logAgentic('  Worker reported SUCCESS but too many verifiers failed — rejecting');
      log(`  Pass ratio: ${(passRatio * 100).toFixed(0)}% (below 50% threshold)`);
      return false;
    }

    // Worker reported success, no blocking failures, decent ratio — accept
    if (result.success) {
      logAgentic('  Worker reported SUCCESS — treating remaining verifier failures as advisory');
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
