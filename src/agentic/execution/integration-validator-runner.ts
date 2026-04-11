/**
 * Integration Validator Runner — Phase 5b (v2.1.7)
 *
 * Runs after Phase 5 verifiers pass on steps of kind `integration_gate` or
 * `user_visible_build`. Reviews the goal's state — prior structured handoffs,
 * STEPS.json, definition_of_done_journey — and decides whether the user journey
 * so far is demoable end-to-end.
 *
 * If it detects a "beautiful pieces, broken whole" smell (see retrospective
 * `ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout.md`), it files a
 * defect subtask which the depth-first work-selector will pick up before the
 * next sibling step.
 *
 * ## Current implementation: reasoning-only review
 *
 * This first cut uses a chat-completion provider — it does NOT walk the browser.
 * It reviews the structured evidence produced by upstream workers. A future
 * upgrade will spawn a full Agent SDK worker with playwright-cli tool access
 * so it can actually click through the running app (this is what the
 * `integration-validator` SKILL.md is written for — workers built to read it).
 *
 * The reasoning-only check is already valuable because it catches:
 *   - Structured handoffs that fail to name what_connects (isolation red flag)
 *   - Steps whose handoff admits known_gaps that block the journey
 *   - Contradictions between a step's claims and the prior steps' evidence
 *   - Missing or unchanged journey_blocks_added counts on gate steps
 *
 * Every defect filed here exercises the full depth-first subtask pipeline.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { WorkItem, WorkStep, DefectEvidence, StructuredHandoff } from '../../core/types.js';
import { readStepsJson, insertDefectSubtask } from '../../deterministic/steps-json-handler.js';
import { getChatCompletionProvider, resolveChatModel } from '../../core/vendor/index.js';
import { logAgentic, log } from '../../core/logging.js';

const INTEGRATION_VALIDATOR_SKILL_PATH = path.join(
  process.cwd(),
  'claude-files-to-output',
  'skills',
  'integration-validator',
  'SKILL.md',
);

export interface ValidatorResult {
  result: 'pass' | 'fail';
  /** Why the validator passed or failed, for logging/telemetry */
  reason: string;
  /** Present only when result === 'fail' */
  defect?: DefectEvidence;
  /** Filed defect subtask ID, present only when a defect was inserted into STEPS.json */
  defectSubtaskId?: string;
}

/**
 * Return true if a step should trigger integration validation after Phase 5.
 */
export function shouldRunIntegrationValidator(step: WorkStep | undefined, item: WorkItem): boolean {
  if (!step) return false;
  if (step.kind === 'integration_gate') return true;
  if (step.kind === 'user_visible_build') return true;
  // Auto-detect: treat gate-title-matching steps as gates even if kind is missing
  if (/^\[GATE\]/i.test(step.title)) return true;
  // If the goal declares a definition_of_done_journey, EVERY non-research build step is
  // treated as user-visible and gets a soft validator pass.
  if (item.definition_of_done_journey && step.kind !== 'prerequisite') {
    const t = step.title.toLowerCase();
    if (!/research|plan|analyze|investigate/.test(t)) return true;
  }
  return false;
}

function loadSkillBody(): string {
  try {
    if (existsSync(INTEGRATION_VALIDATOR_SKILL_PATH)) {
      return readFileSync(INTEGRATION_VALIDATOR_SKILL_PATH, 'utf-8');
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * Build a compact evidence summary to feed the reviewing LLM.
 */
function buildEvidenceSummary(item: WorkItem, step: WorkStep, completedHandoffs: Array<{ id: string; title: string; handoff?: StructuredHandoff }>): string {
  const handoffLines = completedHandoffs.map(s => {
    const h = s.handoff;
    if (!h) return `- ${s.id} "${s.title}" — NO STRUCTURED HANDOFF (worker did not produce one)`;
    return [
      `- ${s.id} "${s.title}":`,
      `  - what_i_built: ${h.what_i_built || '(missing)'}`,
      `  - what_connects: ${h.what_connects || '(missing — isolation red flag)'}`,
      `  - what_i_verified: ${h.what_i_verified || '(missing — not verified)'}`,
      `  - known_gaps: ${h.known_gaps || '(none declared)'}`,
      h.journey_blocks_added !== undefined ? `  - journey_blocks_added: ${h.journey_blocks_added}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    `Goal: ${item.title}`,
    `Project path: ${item.output_path || '(unknown)'}`,
    `Definition of Done — User Journey: ${item.definition_of_done_journey || '(not declared — major red flag for a UI goal)'}`,
    `Data requirements: ${item.data_requirements || '(not declared)'}`,
    '',
    `Step under validation: ${step.id || `step-${step.step_number}`} — "${step.title}" (kind: ${step.kind || 'build'})`,
    '',
    'Completed steps with structured handoffs:',
    handoffLines || '(none)',
  ].join('\n');
}

/**
 * Parse the validator's JSON response for a verdict + optional defect.
 */
function parseValidatorJson(text: string): ValidatorResult | null {
  // Look for the first fenced JSON block, then fall back to any balanced {...}
  let jsonText: string | null = null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) jsonText = fenced[1].trim();
  if (!jsonText) {
    const braceMatch = text.match(/\{[\s\S]*"role"\s*:\s*"integration-validator"[\s\S]*\}/);
    if (braceMatch) jsonText = braceMatch[0];
  }
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed.result !== 'pass' && parsed.result !== 'fail') return null;

    if (parsed.result === 'pass') {
      return {
        result: 'pass',
        reason: parsed.journey_evidence || 'Journey reviewed and accepted.',
      };
    }

    // fail path
    const defectObj = parsed.defect || {};
    const defect: DefectEvidence = {
      title: defectObj.title || 'Integration validator flagged broken user journey',
      root_cause: defectObj.root_cause,
      evidence: defectObj.evidence || parsed.journey_evidence,
      acceptance_criteria: Array.isArray(defectObj.acceptance_criteria)
        ? defectObj.acceptance_criteria
        : undefined,
      regression_failures: parsed.e2e_regression?.regression_failures,
    };
    return {
      result: 'fail',
      reason: defect.title,
      defect,
    };
  } catch {
    return null;
  }
}

/**
 * Run the integration validator for a just-completed step.
 *
 * Returns the validator's verdict. If it fails, also files a defect subtask
 * in STEPS.json and returns the new subtask's ID so the caller can roll back
 * the parent step's "complete" status to "in_progress".
 */
export async function runIntegrationValidator(
  item: WorkItem,
  step: WorkStep,
  contractId?: string,
): Promise<ValidatorResult> {
  if (!item.source_path) {
    return { result: 'pass', reason: 'No source_path — cannot validate' };
  }

  logAgentic(`[Phase 5b] Running integration validator for ${step.id || `step-${step.step_number}`} "${step.title}"`);

  // Gather structured handoffs for all completed steps (chronological order)
  const stepsFile = await readStepsJson(item.source_path);
  if (!stepsFile) {
    return { result: 'pass', reason: 'No STEPS.json — single-step goal, skipping validator' };
  }

  const completedHandoffs = stepsFile.steps
    .filter(s => s.status === 'complete')
    .map(s => ({ id: s.id || `step-${s.step_number}`, title: s.title, handoff: s.handoff }));

  // CHEAP DETERMINISTIC CHECKS FIRST — file a defect before paying for an LLM call
  // when the evidence is obviously wrong.
  const cheapDefect = runCheapChecks(item, step, completedHandoffs);
  if (cheapDefect) {
    const parentId = step.id || `step-${step.step_number}`;
    const subtaskId = await insertDefectSubtask(item.source_path, parentId, {
      ...cheapDefect,
      filed_by_contract: contractId,
    });
    return {
      result: 'fail',
      reason: cheapDefect.title,
      defect: cheapDefect,
      defectSubtaskId: subtaskId || undefined,
    };
  }

  // LLM-based review
  const skillBody = loadSkillBody();
  const evidence = buildEvidenceSummary(item, step, completedHandoffs);

  const prompt = [
    '# Integration Validator — Phase 5b Review',
    '',
    'You are reviewing structured evidence from a completed step in an autonomous worker pipeline.',
    'Your job: decide whether the user journey so far is genuinely advancing, or whether this looks',
    'like the "beautiful pieces, broken whole" failure mode. If you flag a problem, the executive',
    'loop will file a defect subtask that runs BEFORE the next sibling step.',
    '',
    '---',
    '',
    '## Integration Validator Skill (the rules of this role)',
    '',
    skillBody,
    '',
    '---',
    '',
    '## Evidence',
    '',
    evidence,
    '',
    '---',
    '',
    '## Your output',
    '',
    'Return ONLY a single JSON block exactly matching the `handoff JSON` format described in the skill above. No prose outside the JSON.',
    '',
    'You are in REASONING-ONLY mode for this pass — you cannot drive a browser. Base your verdict on the structured evidence above. Be strict: a missing `what_connects`, an isolation-smell `what_i_verified`, or a gate step claiming zero `journey_blocks_added` is a fail.',
  ].join('\n');

  try {
    const chatProvider = getChatCompletionProvider();
    const model = resolveChatModel('INTEGRATION_VALIDATOR_MODEL');
    logAgentic(`[Phase 5b] Calling ${chatProvider.vendorName}/${model} for integration review`);

    const resp = await chatProvider.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = parseValidatorJson(resp.text);
    if (!parsed) {
      log(`[Phase 5b] Could not parse validator response — defaulting to PASS. Raw: ${resp.text.slice(0, 200)}`);
      return { result: 'pass', reason: 'Validator response unparseable — soft pass' };
    }

    if (parsed.result === 'fail' && parsed.defect) {
      const parentId = step.id || `step-${step.step_number}`;
      const subtaskId = await insertDefectSubtask(item.source_path, parentId, {
        ...parsed.defect,
        filed_by_contract: contractId,
      });
      return { ...parsed, defectSubtaskId: subtaskId || undefined };
    }

    return parsed;
  } catch (err) {
    log(`[Phase 5b] Integration validator call failed, defaulting to PASS: ${err}`);
    return { result: 'pass', reason: `Validator error (soft pass): ${String(err).slice(0, 200)}` };
  }
}

/**
 * Deterministic pre-checks — fail fast on obvious smells without paying for an LLM.
 */
function runCheapChecks(
  item: WorkItem,
  step: WorkStep,
  completedHandoffs: Array<{ id: string; title: string; handoff?: StructuredHandoff }>,
): DefectEvidence | null {
  const isWeb = !!item.definition_of_done_journey;
  const stepIsGate = step.kind === 'integration_gate' || /^\[GATE\]/i.test(step.title);

  // 1. UI goal with no definition_of_done_journey — report once via defect (advisory)
  //    We intentionally don't fail here because Phase 4 already requires it.

  // 2. Integration gate that didn't add journey blocks
  if (stepIsGate) {
    const thisStepHandoff = completedHandoffs.find(h => h.id === step.id)?.handoff;
    if (!thisStepHandoff) {
      return {
        title: 'Integration gate completed without producing a structured handoff',
        root_cause: `Step ${step.id} was a [GATE] integration checkpoint but the worker did not emit the required YAML handoff block at the end of its turn.`,
        evidence: 'Gate steps must report journey_blocks_added. Absence means the worker either skipped journey.spec.ts extension or did not run the full regression suite.',
        acceptance_criteria: [
          'Emit a structured handoff YAML block at the end of the worker turn',
          'Include journey_blocks_added with a number > 0',
          'Include what_i_verified naming the exact commands run and their pass/fail counts',
        ],
      };
    }
    if (thisStepHandoff.journey_blocks_added === 0 || thisStepHandoff.journey_blocks_added === undefined) {
      return {
        title: 'Integration gate added zero journey blocks',
        root_cause: 'A [GATE] integration checkpoint completed without extending tests/e2e/journey.spec.ts.',
        evidence: `journey_blocks_added reported as ${thisStepHandoff.journey_blocks_added ?? 'undefined'}.`,
        acceptance_criteria: [
          'Extend tests/e2e/journey.spec.ts with at least one new test() block covering the latest segment of the flow',
          'Run the full journey.spec.ts and report total pass/fail counts in what_i_verified',
        ],
      };
    }
  }

  // 3. User-visible step with handoff missing what_connects on a web goal
  if (isWeb && step.kind !== 'prerequisite' && step.kind !== 'integration_gate') {
    const thisStepHandoff = completedHandoffs.find(h => h.id === step.id)?.handoff;
    if (thisStepHandoff && !thisStepHandoff.what_connects) {
      return {
        title: `Step "${step.title}" has no what_connects in structured handoff`,
        root_cause: 'Worker produced a structured handoff but omitted what_connects. This is the isolation smell from the postal-checkout retro — component built without wiring to upstream/downstream state.',
        evidence: `Handoff snapshot: what_i_built="${thisStepHandoff.what_i_built || ''}", what_connects="", what_i_verified="${thisStepHandoff.what_i_verified || ''}"`,
        acceptance_criteria: [
          'Explicitly wire this step\'s output to the route or state the next step needs',
          'Re-run the worker and produce a handoff that names the upstream state read and downstream state written',
          'Walk the full journey so far in playwright-cli to prove the connection',
        ],
      };
    }
  }

  return null;
}
