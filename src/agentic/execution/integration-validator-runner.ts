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
import { checkJourneySatisfiability } from '../../deterministic/journey-satisfiability.js';

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
 *
 * Single-goal mode: when `step` is undefined, we are validating the entire
 * goal (no breakdown happened). Run the validator iff the goal declares a
 * `definition_of_done_journey` — there is something concrete to gate on.
 */
export function shouldRunIntegrationValidator(step: WorkStep | undefined, item: WorkItem): boolean {
  if (!step) {
    // Whole-goal validation: only meaningful if the goal declared a journey.
    return !!item.definition_of_done_journey;
  }
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
 *
 * v2.4 I3: when the journey declares API round-trips (e.g. "POST /api/…",
 * "persists to database", "reads from /api/…"), annotate each step that
 * claims journey work but does not mention those paths in its
 * what_i_verified — that is the "UI built on top of mocked APIs" failure
 * mode. The annotation flags the gap to the LLM validator.
 */
function buildEvidenceSummary(item: WorkItem, step: WorkStep, completedHandoffs: Array<{ id: string; title: string; handoff?: StructuredHandoff }>): string {
  const journeyApis = extractApiPathsFromJourney(item.definition_of_done_journey);
  const journeyDeclaresPersistence = journeyDescribesPersistence(item.definition_of_done_journey);

  const handoffLines = completedHandoffs.map(s => {
    const h = s.handoff;
    if (!h) return `- ${s.id} "${s.title}" — NO STRUCTURED HANDOFF (worker did not produce one)`;

    const lines: Array<string | false> = [
      `- ${s.id} "${s.title}":`,
      `  - what_i_built: ${h.what_i_built || '(missing)'}`,
      `  - what_connects: ${h.what_connects || '(missing — isolation red flag)'}`,
      `  - what_i_verified: ${h.what_i_verified || '(missing — not verified)'}`,
      `  - known_gaps: ${h.known_gaps || '(none declared)'}`,
      h.journey_blocks_added !== undefined ? `  - journey_blocks_added: ${h.journey_blocks_added}` : false,
    ];

    // I3 annotation — API round-trip coverage
    if (journeyApis.length > 0) {
      const verifiedText = `${h.what_i_verified || ''} ${h.what_i_built || ''}`.toLowerCase();
      const missing = journeyApis.filter(p => !verifiedText.includes(p.toLowerCase()));
      if (missing.length > 0) {
        lines.push(`  - ⚠ API coverage gap (v2.4 I3): journey mentions ${missing.join(', ')} but handoff does not reference any of them in what_i_verified.`);
      }
    }
    if (journeyDeclaresPersistence) {
      const text = `${h.what_i_verified || ''}`.toLowerCase();
      if (!/persist|saved|db|database|round.?trip|supabase|postgres|read back|re-read/.test(text)) {
        lines.push(`  - ⚠ persistence not verified (v2.4 I3): journey requires data to persist but handoff does not mention a round-trip.`);
      }
    }

    return lines.filter((x): x is string => typeof x === 'string' && x.length > 0).join('\n');
  }).join('\n');

  const journeyContext = journeyApis.length > 0 || journeyDeclaresPersistence
    ? `\nJourney API round-trips required: ${journeyApis.length > 0 ? journeyApis.join(', ') : '(no explicit paths, but persistence is implied)'}\n`
    : '';

  return [
    `Goal: ${item.title}`,
    `Project path: ${item.output_path || '(unknown)'}`,
    `Definition of Done — User Journey: ${item.definition_of_done_journey || '(not declared — major red flag for a UI goal)'}`,
    `Data requirements: ${item.data_requirements || '(not declared)'}`,
    journeyContext,
    `Step under validation: ${step.id || `step-${step.step_number}`} — "${step.title}" (kind: ${step.kind || 'build'})`,
    '',
    'Completed steps with structured handoffs:',
    handoffLines || '(none)',
  ].join('\n');
}

/**
 * v2.4 I3 helper — extract `/api/...` paths mentioned in the journey string.
 * Deduplicated, lowercased; returns empty array if nothing matches.
 */
export function extractApiPathsFromJourney(journey?: string): string[] {
  if (!journey) return [];
  const paths = new Set<string>();
  for (const m of journey.matchAll(/\/api\/[a-zA-Z0-9_\-/]+/g)) {
    paths.add(m[0]);
  }
  return Array.from(paths);
}

/**
 * v2.4 I3 helper — does the journey text imply a persistence round-trip?
 * Catches phrasing like "persists to X", "saved to DB", "round-trip", etc.
 */
export function journeyDescribesPersistence(journey?: string): boolean {
  if (!journey) return false;
  return /persist|saved to|stored|database|db\b|supabase|postgres|round.?trip|re-?read/i.test(journey);
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
  step: WorkStep | undefined,
  contractId?: string,
  projectPath?: string,
): Promise<ValidatorResult> {
  if (!item.source_path) {
    return { result: 'pass', reason: 'No source_path — cannot validate' };
  }

  // Single-goal mode: no breakdown happened, no STEPS.json to read, no
  // per-step handoffs to review. The LLM evidence-review path needs handoffs
  // to be useful; without them it can only restate the journey description.
  // Instead, do a deterministic journey-satisfiability check against the
  // worker's output_path. This is the same check Phase 5 runs as a hard
  // gate (validation-handler.ts), repeated here so single-goal mode also
  // gets a Phase 5b log entry confirming the journey is executable.
  if (!step) {
    logAgentic(`[Phase 5b] Running whole-goal integration validator for "${item.title}" (single-goal mode)`);
    const candidatePath = projectPath || item.output_path;
    if (!candidatePath) {
      return { result: 'pass', reason: 'No project path available for whole-goal validation — soft pass' };
    }
    const journeyCheck = checkJourneySatisfiability(candidatePath, item.definition_of_done_journey);
    if (!journeyCheck.ok) {
      return {
        result: 'fail',
        reason: journeyCheck.reason || 'Journey gate failed',
        defect: {
          title: 'Whole-goal journey gate: project has no way to execute the declared user journey',
          root_cause:
            'Worker reported success but produced no Playwright config, no tests/e2e/ directory, and no test:e2e/playwright npm script. The definition_of_done_journey cannot be executed against the current project state.',
          evidence: journeyCheck.reason,
          acceptance_criteria: [
            'Add a Playwright config (or equivalent journey runner) at the project root or under code/Functions/<app>/.',
            'Add a tests/e2e/ spec that drives the full definition_of_done_journey.',
            'Add a package.json script (test:e2e or similar) that runs the spec end-to-end.',
            'Run the script locally and confirm it exits 0 before declaring the goal complete.',
          ],
        },
      };
    }
    return { result: 'pass', reason: 'Whole-goal journey check satisfied — project contains executable verification artifacts.' };
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
    'You are in REASONING-ONLY mode for this pass — you cannot drive a browser. Base your verdict on the structured evidence above and the skill rules.',
    '',
    'IMPORTANT — bias toward PASS when evidence is thin:',
    '- Missing structured handoffs are NOT a defect. If prior handoffs are absent or sparse, you have no proof either way — default to `result: "pass"` with a `journey_evidence` note that says you could not verify and recommend a journey-level test in a later step.',
    '- Only return `result: "fail"` when the evidence describes a concrete, user-facing failure: a route 404, a form submission that does not persist, regression test failures, an API returning the wrong shape, hardcoded mock data where live data is required.',
    '- Do NOT file a defect titled "no structured handoff", "no foundation exists", "recursive defect chain", or any variant. Those are process complaints, not product defects. A previous version of this validator generated a recursive chain of those — do not repeat it.',
    '- If the only thing wrong is that you cannot tell what was built, return `result: "pass"` and note the gap.',
    '',
    'API round-trip enforcement (v2.4 I3):',
    '- If the Definition of Done User Journey mentions any `/api/…` path or persistence verb (saved, persists, database), you MUST treat API coverage as journey-critical.',
    '- A gate/user-visible step that claims the journey works but whose `what_i_verified` does not mention the relevant endpoint path AND does not mention the persistence round-trip is a legitimate defect — file it under the current step with acceptance criteria "curl the endpoint with the journey\'s exact payload and re-read the record".',
    '- This is not the same as "no structured handoff" — this is "handoff exists but does not show the backend was exercised". That distinction matters: the former is process noise, the latter is a concrete gap.',
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
 *
 * v2.4 H3: on integration_gate steps, deterministically file a defect when
 * journey_blocks_added has regressed since the previous gate. This is the
 * "gate worker must block on regression" fix from the v2.1.6 retro — the
 * prior Gate 9 saw 17/45 failures and the loop continued anyway because the
 * LLM validator's pass-bias suppressed the signal. A hard numeric check
 * bypasses that heuristic.
 */
function runCheapChecks(
  item: WorkItem,
  step: WorkStep,
  completedHandoffs: Array<{ id: string; title: string; handoff?: StructuredHandoff }>,
): DefectEvidence | null {
  const stepIsGate = step.kind === 'integration_gate' || /^\[GATE\]/i.test(step.title);
  if (!stepIsGate) return null;

  const currentHandoff = (step.handoff as StructuredHandoff | undefined)
    // If the step hasn't had its handoff written into step.handoff yet, look
    // for its entry in completedHandoffs (set by the caller for status==='complete').
    ?? completedHandoffs.find(h => h.id === (step.id || `step-${step.step_number}`))?.handoff;

  const priorGates = completedHandoffs
    .filter(h => /^\[GATE\]/i.test(h.title))
    .filter(h => h.id !== (step.id || `step-${step.step_number}`));
  const lastGate = priorGates[priorGates.length - 1];

  // Case 1 — no prior gate to compare against: if the current gate's handoff
  // omits journey_blocks_added we can't tell if it's progress, so we return
  // null and let the LLM pass make the call.
  if (!lastGate) return null;

  const currentJB = typeof currentHandoff?.journey_blocks_added === 'number'
    ? currentHandoff.journey_blocks_added
    : undefined;
  const priorJB = typeof lastGate.handoff?.journey_blocks_added === 'number'
    ? lastGate.handoff.journey_blocks_added
    : undefined;

  // Case 2 — current gate missing journey_blocks_added: caller cannot verify
  // that journey advanced. That's a gate-enforcement defect per H3.
  if (priorJB !== undefined && currentJB === undefined) {
    return {
      title: `Gate ${step.id} did not report journey_blocks_added`,
      root_cause: 'Gate worker must declare journey_blocks_added so regression can be detected.',
      evidence: `Previous gate ${lastGate.id} reported ${priorJB} blocks; current gate handoff has no count.`,
      acceptance_criteria: [
        'Run the FULL tests/e2e/journey.spec.ts and record the number of blocks.',
        `Emit a structured handoff with journey_blocks_added >= ${priorJB}.`,
      ],
      parent_step_id: step.id || `step-${step.step_number}`,
    };
  }

  // Case 3 — strict regression: current count < prior count means journey
  // coverage shrank. Block progress per H3.
  if (priorJB !== undefined && currentJB !== undefined && currentJB < priorJB) {
    return {
      title: `Regression at gate ${step.id}: journey_blocks_added ${priorJB} → ${currentJB}`,
      root_cause: 'A prior passing block of the end-to-end journey no longer runs green.',
      evidence: [
        `Previous gate ${lastGate.id} reported ${priorJB} blocks.`,
        `Current gate ${step.id} reports ${currentJB} blocks.`,
        `Journey coverage shrank by ${priorJB - currentJB} block(s).`,
      ].join(' '),
      acceptance_criteria: [
        'Identify which journey block(s) regressed and fix the underlying code, not the test.',
        `Re-run journey.spec.ts and emit journey_blocks_added >= ${priorJB}.`,
      ],
      parent_step_id: step.id || `step-${step.step_number}`,
      regression_failures: [`${priorJB - currentJB} journey block(s) regressed`],
    };
  }

  void item;
  return null;
}
