/**
 * Task Breakdown - Automatic breakdown of complex tasks into steps
 *
 * Uses an LLM call to intelligently decompose goals based on the
 * PROMPT.md content. Falls back to a simple 3-step generic breakdown
 * if the LLM call fails.
 */

import path from 'path';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import type { WorkItem, WorkStep } from '../../core/types.js';
import { getChatCompletionProvider, resolveChatModel } from '../../core/vendor/index.js';
import { createStepsFile, writeStepsJson, stepsJsonExists } from '../../deterministic/steps-json-handler.js';
import { logBreakdownProgress } from '../../deterministic/progress-log-writer.js';
import { loadSkillPrompt } from '../intelligence/skill-prompt-loader.js';

// Configuration from environment
const BREAKDOWN_THRESHOLD_TURNS = parseInt(process.env.BREAKDOWN_THRESHOLD_TURNS || '100', 10);
const AUTO_BREAKDOWN_ENABLED = process.env.AUTO_BREAKDOWN_ENABLED !== 'false';
const MAX_RE_BREAKDOWN_COUNT = 2; // Maximum re-breakdowns per step

/**
 * Read full bundle context: PROMPT.md + all requirements/ files.
 * Returns a formatted string with all content for the breakdown prompt.
 */
async function readBundleContext(bundlePath: string): Promise<string> {
  const sections: string[] = [];

  // Read full PROMPT.md
  const promptPath = path.join(bundlePath, 'PROMPT.md');
  if (existsSync(promptPath)) {
    try {
      const content = await readFile(promptPath, 'utf-8');
      sections.push(`## PROMPT.md\n${content}`);
    } catch {
      // Fall through — prompt content may come from item.description
    }
  }

  // Read all files in requirements/ directory
  const reqDir = path.join(bundlePath, 'requirements');
  if (existsSync(reqDir)) {
    try {
      const files = await readdir(reqDir);
      const mdFiles = files.filter(f => f.endsWith('.md')).sort();
      for (const file of mdFiles) {
        try {
          const content = await readFile(path.join(reqDir, file), 'utf-8');
          sections.push(`## requirements/${file}\n${content}`);
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // No requirements directory or unreadable
    }
  }

  return sections.join('\n\n');
}

/**
 * Result of task breakdown
 */
export interface BreakdownResult {
  success: boolean;
  steps: WorkStep[];
  analysis?: string;
  error?: string;
}

/**
 * Estimate task complexity based on keywords and description
 * Returns estimated number of turns needed
 */
export function estimateComplexity(item: WorkItem): number {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  // Check for simple task patterns first (override everything else)
  if (/add (unit )?test(s)?|write test(s)?/i.test(text)) {
    return 70; // Simple test tasks are quick
  }
  if (/fix|bug|typo/i.test(text)) {
    return 50; // Fixes are quick
  }

  // Base complexity by priority
  let baseTurns = item.priority === 'P0' ? 120 :
                  item.priority === 'P1' ? 100 :
                  item.priority === 'P2' ? 75 :
                  item.priority === 'P3' ? 50 :
                  40;

  // Complexity modifiers based on keywords
  const complexityKeywords: { pattern: RegExp; multiplier: number }[] = [
    // High complexity (2x+)
    { pattern: /full[- ]stack|saas|platform|system|architecture/i, multiplier: 2.5 },
    { pattern: /multi[- ]?tenant|scalab(le|ility)/i, multiplier: 2.0 },
    { pattern: /integrat(e|ion)|migrat(e|ion)/i, multiplier: 1.8 },
    { pattern: /authentication|authorization|security/i, multiplier: 1.6 },

    // Medium-high complexity (1.4-1.6x)
    { pattern: /dashboard|analytics|data[- ]?viz/i, multiplier: 1.6 },
    { pattern: /ui|interface|layout|component/i, multiplier: 1.5 },
    { pattern: /responsive|mobile[- ]first|animation/i, multiplier: 1.3 },
    { pattern: /react|nextjs|next\.js|vue|angular/i, multiplier: 1.4 },
    { pattern: /tailwind|styled|css[- ]?in[- ]?js/i, multiplier: 1.2 },

    // Medium complexity (1.3-1.5x)
    { pattern: /api|endpoint|crud/i, multiplier: 1.4 },
    { pattern: /database|schema|model/i, multiplier: 1.3 },
    { pattern: /deploy(ment)?|ci\/cd/i, multiplier: 1.3 },
    { pattern: /test(s|ing)|coverage/i, multiplier: 1.2 },

    // Lower complexity (0.6-0.8x)
    { pattern: /update|config(ure)?/i, multiplier: 0.6 },
    { pattern: /document(ation)?|readme/i, multiplier: 0.7 },
    { pattern: /refactor|clean(up)?/i, multiplier: 0.8 },
  ];

  let totalMultiplier = 1.0;
  for (const { pattern, multiplier } of complexityKeywords) {
    if (pattern.test(text)) {
      totalMultiplier *= multiplier;
    }
  }

  // Cap the multiplier to avoid extreme values
  totalMultiplier = Math.max(0.5, Math.min(3.0, totalMultiplier));

  return Math.round(baseTurns * totalMultiplier);
}

/**
 * Check if a task needs automatic breakdown.
 * Checks STEPS.json existence first (primary), then in-memory steps (legacy fallback).
 */
export function needsBreakdown(item: WorkItem): boolean {
  if (!AUTO_BREAKDOWN_ENABLED) return false;

  // Primary: check STEPS.json exists in the bundle
  if (item.source_path && stepsJsonExists(item.source_path)) return false;

  // Legacy fallback: check in-memory steps
  if (item.steps && item.steps.length > 0) return false;

  const estimatedTurns = estimateComplexity(item);
  return estimatedTurns > BREAKDOWN_THRESHOLD_TURNS;
}

/**
 * Build the prompt for the LLM breakdown agent.
 * Loads from .claude/skills/goal-breakdown/SKILL.md and renders variables.
 */
async function buildBreakdownPrompt(item: WorkItem, bundleContext: string, complexityEstimate: number): Promise<string> {
  // Adaptive step count guidance based on complexity
  // Key principle: more smaller steps >> fewer larger steps
  let stepGuidance: string;
  let turnRange: string;
  if (complexityEstimate <= 150) {
    stepGuidance = '5-10 steps';
    turnRange = '20-50';
  } else if (complexityEstimate <= 300) {
    stepGuidance = '10-25 steps';
    turnRange = '20-60';
  } else if (complexityEstimate <= 600) {
    stepGuidance = '25-50 steps';
    turnRange = '20-60';
  } else {
    stepGuidance = '50-100+ steps';
    turnRange = '20-60';
  }

  return loadSkillPrompt('goal-breakdown', {
    COMPLEXITY_ESTIMATE: String(complexityEstimate),
    STEP_GUIDANCE: stepGuidance,
    TURN_RANGE: turnRange,
    GOAL_TITLE: item.title,
    BUNDLE_CONTEXT: bundleContext || item.description || '(no description)',
  }, {
    usageContext: 'phase-3b/goal-breakdown',
  });
}

/**
 * Generate a breakdown using an LLM call to intelligently decompose the goal.
 * Falls back to a generic 3-step breakdown if the LLM call fails.
 */
export async function generateBreakdown(item: WorkItem): Promise<WorkStep[]> {
  // Read full bundle context (PROMPT.md + requirements/)
  const bundleContext = item.source_path
    ? await readBundleContext(item.source_path)
    : '';

  const complexityEstimate = estimateComplexity(item);
  const prompt = await buildBreakdownPrompt(item, bundleContext, complexityEstimate);

  try {
    const model = resolveChatModel('BREAKDOWN_MODEL');
    const chatProvider = getChatCompletionProvider();
    console.log(`[Breakdown] Spawning LLM breakdown via ${chatProvider.vendorName} for "${item.title}" using ${model} (complexity: ${complexityEstimate} turns)`);

    const result = await chatProvider.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = result.text;

    // Parse JSON from response (may have markdown fences or extra text)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in LLM breakdown response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      description: string;
      estimated_turns?: number;
    }>;

    if (!Array.isArray(parsed) || parsed.length < 2) {
      throw new Error(`LLM returned ${parsed.length} steps, need at least 2`);
    }

    // Convert to WorkStep[] with proper structure
    const steps: WorkStep[] = parsed.map((s, i) => ({
      step_number: i,
      title: s.title,
      description: (s.description || '').slice(0, 2000),
      status: 'pending' as const,
      dependencies: i === 0 ? [] : [i - 1],
      estimated_turns: Math.max(20, Math.min(60, s.estimated_turns || 50)),
    }));

    // v2.1.7: apply prerequisite + integration gate passes
    const finalSteps = applyBreakdownPasses(steps, item);

    // Summary logging
    const totalEstimated = finalSteps.reduce((sum, s) => sum + (s.estimated_turns || 100), 0);
    const turnValues = finalSteps.map(s => s.estimated_turns || 100);
    const minTurns = Math.min(...turnValues);
    const maxTurns = Math.max(...turnValues);
    console.log(`[Breakdown] LLM produced ${steps.length} steps, ${finalSteps.length} after prereq+gate passes for "${item.title}" (total: ${totalEstimated} estimated turns, range: ${minTurns}-${maxTurns} per step)`);
    for (const s of finalSteps) {
      console.log(`  Step ${s.step_number} [${s.kind || 'build'}/${s.origin || 'breakdown'}]: ${s.title} (${s.estimated_turns} turns)`);
    }

    return finalSteps;
  } catch (error) {
    console.log(`[Breakdown] LLM breakdown failed for "${item.title}": ${error}`);
    console.log(`[Breakdown] Falling back to generic 3-step breakdown`);
    const genericSteps = generateGenericBreakdown(item);
    return applyBreakdownPasses(genericSteps, item);
  }
}

/**
 * Generic keyword-based breakdown (fallback when PROMPT.md has no ## Approach).
 */
function generateGenericBreakdown(item: WorkItem): WorkStep[] {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  const steps: WorkStep[] = [];
  let stepNum = 0;

  // Step 1: Research & Planning (always included for complex tasks)
  steps.push({
    step_number: stepNum++,
    title: 'Research existing patterns and plan approach',
    description: `Analyze requirements for "${item.title}". Research best practices, existing patterns, and create a technical plan.`,
    status: 'pending',
    dependencies: [],
    estimated_turns: 80,
  });

  // Step 2: Core implementation
  steps.push({
    step_number: stepNum++,
    title: 'Implement core functionality',
    description: `Build the main deliverable for "${item.title}". Follow the plan from research.`,
    status: 'pending',
    dependencies: [0],
    estimated_turns: 100,
  });

  // Step 3: Validate & finish
  steps.push({
    step_number: stepNum++,
    title: 'Validate, test, and finalize',
    description: `Test the implementation, fix issues, update documentation, and commit.`,
    status: 'pending',
    dependencies: [stepNum - 2],
    estimated_turns: 80,
  });

  return steps;
}

// v2.4.2: require an actual rendering token (react, next, ui, component, ...) to
// conclude "this is a web/UI goal". The old regex matched `api`/`endpoint`/`page`
// and produced false positives on backend-only API goals — see ai-docs/v2/2026-04-18-v2.4/goal-2.4.2.md.
const WEB_RENDERING_KEYWORDS = /\b(?:next\.?js|react|vue|svelte|angular|html|tsx|jsx|ui|frontend|component|dashboard|web.?app|website|form|page)\b/i;

// Data-backend detection — triggers a prerequisite seed step. The `api|endpoint`
// tokens still live here (they're honest signals that data flows through a
// backend), but `insertPrerequisiteStep` now also requires a rendering keyword.
const DATA_BACKEND_KEYWORDS = /supabase|postgres|prisma|\bmongo|\bmysql|sqlite|firestore|\bdb\b|database|schema|\bapi\b|endpoint|auth|backend/i;

// v2.4.2: Explicit "no database" signals. If any of these fire on the goal body,
// the prereq inserter MUST NOT prepend DB setup steps — the goal already declares
// a non-DB persistence strategy (in-memory, JSON file, localStorage, etc.).
const NO_DATABASE_KEYWORDS = /\b(?:no\s+database|no\s+db\b|no\s+persistence|without\s+(?:a\s+)?database|without\s+(?:a\s+)?db|in[-\s]?memory|stateless|json\s+file(?:\s+snapshot)?|file[-\s]based\s+(?:state|storage|persistence)|localstorage[-\s]only|no\s+backend\s+db)\b/i;

// v2.4.2: Explicit "no UI" signals. Backend-only / CLI-only / API-only goals don't
// need UI prereqs even if they declare a database.
const NO_UI_KEYWORDS = /\b(?:no\s+ui|backend[-\s]only|api[-\s]only|server[-\s]only|cli[-\s]only|headless)\b/i;

function goalBodyText(item: WorkItem): string {
  return `${item.title} ${item.description || ''}`;
}

/**
 * v2.4.2: Does this goal explicitly declare "no database"?
 * Checks tags, body keywords, and the `data_requirements` frontmatter field.
 */
export function declaresNoDatabase(item: WorkItem): boolean {
  if (item.tags?.some(t => /^no[-_]?(database|db)$/i.test(t))) return true;
  const dr = (item.data_requirements || '').trim();
  if (dr && /^none\b|^no\b/i.test(dr)) return true;
  return NO_DATABASE_KEYWORDS.test(goalBodyText(item));
}

/**
 * v2.4.2: Does this goal explicitly declare "no UI"?
 */
export function declaresNoUi(item: WorkItem): boolean {
  if (item.tags?.some(t => /^no[-_]?ui$/i.test(t))) return true;
  return NO_UI_KEYWORDS.test(goalBodyText(item));
}

/**
 * Extract up to three short lines from the goal body that describe persistence.
 * Used to quote the PROMPT back to the worker so the step description never
 * contradicts the goal's declared persistence strategy.
 */
export function extractPersistenceExcerpt(item: WorkItem): string | null {
  const persistenceLine = /\b(persistence|state|storage|snapshot|database|in[-\s]?memory|json\s+file|localstorage|no\s+db|no\s+database)\b/i;
  const raw = item.description || '';
  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.length <= 400 && persistenceLine.test(l));
  if (lines.length === 0) {
    if (item.data_requirements) return item.data_requirements.trim();
    return null;
  }
  return lines.slice(0, 3).join('\n');
}

/** Default interval of build steps between integration gates (user can override with integration_gate_cadence in PROMPT.md) */
function defaultGateCadence(totalSteps: number): number {
  // More steps = more frequent gates. Clamp to [3, 8].
  if (totalSteps <= 8) return 4;
  if (totalSteps <= 16) return 5;
  if (totalSteps <= 32) return 6;
  return 8;
}

/**
 * Pass A — Prerequisite detection.
 *
 * For goals that touch a data backend (DB, API, auth), prepend a hard-locked
 * "Prerequisites" step that must run before any UI work:
 *   schema → seed test data → smoke-test API endpoints return expected shapes.
 *
 * This is the piece the postal-checkout run missed: the Supabase schema was set up
 * but no seed data existed, so every UI step that hit the API got 404s and the
 * workers silently filled in hardcoded mocks instead.
 */
export function insertPrerequisiteStep(steps: WorkStep[], item: WorkItem): WorkStep[] {
  const text = goalBodyText(item);

  // v2.4.2 — hard suppressors come FIRST so they short-circuit even when the
  // goal's body contains ambiguous keywords. See ai-docs/v2/2026-04-18-v2.4/goal-2.4.2.md.
  if (declaresNoDatabase(item)) {
    console.log(`[Breakdown] Skipping [PREREQUISITE-*] for "${item.title}" — goal declares no database`);
    return steps;
  }

  const isWeb = WEB_RENDERING_KEYWORDS.test(text);
  const isNoUi = declaresNoUi(item);
  const hasExplicitDataRequirement = !!item.data_requirements && !/^none\b|^no\b/i.test(item.data_requirements);
  const hasBackend = DATA_BACKEND_KEYWORDS.test(text) || hasExplicitDataRequirement;

  // Backend-only goal without a declared DB — no prereqs needed. An API-only
  // server that uses an in-memory store has already been filtered by
  // `declaresNoDatabase`; anything reaching here that is `no-ui` but has an
  // explicit `data_requirements` still gets a schema prereq (it just won't get
  // the API/UI-wiring framing).
  if (isNoUi && !hasExplicitDataRequirement) {
    console.log(`[Breakdown] Skipping [PREREQUISITE-*] for "${item.title}" — goal declares no UI and no explicit data requirement`);
    return steps;
  }

  if (!isWeb || !hasBackend) return steps;

  // Don't insert if the first step already looks like a schema/seed/init step
  const first = steps[0];
  if (first && /schema|seed|init|database|setup|supabase/i.test(`${first.title} ${first.description}`)) {
    return steps;
  }

  const schemaSeed: WorkStep = {
    step_number: 0,
    title: '[PREREQUISITE-0] Database schema + seed data',
    description: buildPrereq0Description(item),
    status: 'pending',
    dependencies: [],
    estimated_turns: 60,
    origin: 'prerequisite',
    kind: 'prerequisite',
    blocks_parent: false,
  };

  const apiSmoke: WorkStep = {
    step_number: 1,
    title: '[PREREQUISITE-1] API endpoints + curl smoke tests',
    description: buildPrereq1Description(item),
    status: 'pending',
    dependencies: [0],
    estimated_turns: 80,
    origin: 'prerequisite',
    kind: 'prerequisite',
    blocks_parent: false,
  };

  // Prepend both prerequisites and re-number the remaining steps.
  const result: WorkStep[] = [schemaSeed, apiSmoke, ...steps];
  for (let i = 2; i < result.length; i++) {
    result[i].step_number = i;
    // First UI step depends on the API smoke (step 1); everything after chains.
    result[i].dependencies = i === 2 ? [1] : [i - 1];
  }
  console.log(`[Breakdown] Inserted [PREREQUISITE-0]+[PREREQUISITE-1] for "${item.title}" (web + data backend detected)`);
  return result;
}

/**
 * v2.4.2 — Build the description for PREREQUISITE-0 (schema + seed).
 * Quotes the PROMPT's own persistence excerpt so the worker sees the goal's
 * declared strategy BEFORE the generic template instructions.
 */
function buildPrereq0Description(item: WorkItem): string {
  const excerpt = extractPersistenceExcerpt(item);
  const dataReqLine = item.data_requirements
    ? `\n\n**Data requirements (from PROMPT.md):** ${item.data_requirements}`
    : '';

  const excerptBlock = excerpt
    ? `### Persistence layer for this goal (excerpt from PROMPT)\n${excerpt}\n\n`
    : '';

  return [
    'Hard-locked prerequisite — no API or UI work may start until this passes.',
    '',
    excerptBlock +
      '1. Create/verify the database schema for this goal.\n' +
      '2. Seed realistic test data (not hardcoded mocks in components) that downstream UI can read.\n' +
      '3. Fill out the structured handoff with: exact table names + columns, sample row IDs you seeded, connection method (env vars, client file).',
    '',
    'This step blocks [PREREQUISITE-1] and every subsequent step. If the schema or seed data is wrong, every downstream worker silently builds against hardcoded data and ships undemoable.',
    dataReqLine,
  ].join('\n');
}

/**
 * v2.4.2 — Build the description for PREREQUISITE-1 (API endpoints + curl smoke).
 */
function buildPrereq1Description(item: WorkItem): string {
  const excerpt = extractPersistenceExcerpt(item);
  const excerptBlock = excerpt
    ? `### Persistence layer for this goal (excerpt from PROMPT)\n${excerpt}\n\n`
    : '';

  return [
    'Hard-locked prerequisite — no UI work may start until this passes.',
    '',
    excerptBlock +
      '1. Create every API endpoint this goal requires (one route file per endpoint).\n' +
      '2. For each endpoint, run `curl` with the exact request shape the UI will send and verify the response body + status code.\n' +
      '3. Verify the persistence round-trip where applicable — create + read-back via curl — per the `backend-testing` skill.\n' +
      '4. Fill out the structured handoff with: method + path for each endpoint, the exact curl commands you ran, the returned response shapes, and the HTTP status codes.',
    '',
    'Follow the `backend-testing` worker skill. Downstream UI workers will read your handoff to learn the API surface — if your handoff is vague, they will invent mocks.',
  ].join('\n');
}

/**
 * Pass B — Integration gate insertion.
 *
 * After every N build steps, insert a dedicated integration gate step whose
 * only job is to extend tests/e2e/journey.spec.ts and walk the full flow so far.
 * Phase 5b spawns an integration-validator worker after these steps complete.
 *
 * Replaces the old `insertRegressionSteps` helper which only asked for visual
 * snapshots — this version demands end-to-end journey verification.
 */
function insertIntegrationGates(steps: WorkStep[], item: WorkItem): WorkStep[] {
  const text = goalBodyText(item);
  if (!WEB_RENDERING_KEYWORDS.test(text)) return steps;
  // v2.4.2: a tags:[no-ui] or body-declared "no UI" goal cannot have an
  // end-to-end journey gate — there's no journey to walk.
  if (declaresNoUi(item)) return steps;

  const cadence = item.integration_gate_cadence && item.integration_gate_cadence > 0
    ? item.integration_gate_cadence
    : defaultGateCadence(steps.length);

  // Don't insert if too few steps
  if (steps.length <= cadence) return steps;

  const result: WorkStep[] = [];
  let buildStepCount = 0;
  let gateNumber = 0;

  for (let i = 0; i < steps.length; i++) {
    result.push(steps[i]);
    // Only build steps count toward cadence (prereqs and existing gates don't)
    if (steps[i].kind !== 'prerequisite' && steps[i].kind !== 'integration_gate') {
      buildStepCount++;
    }

    if (buildStepCount >= cadence && i < steps.length - 1) {
      buildStepCount = 0;
      gateNumber++;
      result.push({
        step_number: 0, // renumbered below
        title: `[GATE] End-to-end journey verification — checkpoint ${gateNumber}`,
        description: [
          'No new build work. Your ONLY job is to prove the user journey so far is demoable end-to-end.',
          '',
          '1. Extend `tests/e2e/journey.spec.ts` with a new block that walks from the flow\'s natural start through the latest step. Use the existing `completePriorSteps()` helper — create it if this is the first gate.',
          '2. Run the FULL `journey.spec.ts` file. Not just your new block — the whole file. If earlier blocks now fail, investigate and fix.',
          '3. If you cannot get the journey green because an earlier step built something broken, STOP — do not paper over it. Write the structured handoff with specific `known_gaps` describing what\'s broken and where. The integration-validator will file a defect subtask.',
          '4. On success, fill out the structured handoff with exact counts: journey_blocks_added, total journey blocks now, regression pass/fail counts.',
          '',
          'The executive loop will spawn an independent integration-validator worker after this step to double-check your claim.',
        ].join('\n'),
        status: 'pending' as const,
        dependencies: [],
        estimated_turns: 45,
        origin: 'integration_gate',
        kind: 'integration_gate',
      });
    }
  }

  // Renumber all steps sequentially and fix dependency chain
  for (let i = 0; i < result.length; i++) {
    result[i].step_number = i;
    result[i].dependencies = i === 0 ? [] : [i - 1];
  }

  const inserted = result.length - steps.length;
  if (inserted > 0) {
    console.log(`[Breakdown] Inserted ${inserted} [GATE] integration checkpoint(s) for "${item.title}" (cadence ${cadence})`);
  }

  return result;
}

/**
 * Orchestrate the full post-breakdown transformation pipeline:
 *   raw LLM steps → + prerequisite → + integration gates
 *
 * Kept as a single function so tests can call it in isolation.
 */
export function applyBreakdownPasses(steps: WorkStep[], item: WorkItem): WorkStep[] {
  const withPrereq = insertPrerequisiteStep(steps, item);
  const withGates = insertIntegrationGates(withPrereq, item);
  // Default every non-special step to `kind: build`
  for (const s of withGates) {
    if (!s.kind) s.kind = 'build';
    if (!s.origin) s.origin = 're_breakdown' in (s as object) ? 're_breakdown' : 'breakdown';
  }
  return withGates;
}

/**
 * Create sub-steps when a step fails (exit code 1).
 *
 * v2.4 H5: when re-breakdown runs a second time and some of the generated
 * sub-steps are already complete, we MUST preserve them — regenerating
 * all three wastes all prior work and was the v2.1.6 failure mode
 * (70→71→47→30→47 steps across five re-breakdowns). Pass `existingSubSteps`
 * (typically all steps in STEPS.json with `parent_id === parentStep.id`) and
 * the function returns only the roles that aren't already complete.
 *
 * Returns a list of sub-steps to INSERT (so the caller must preserve any
 * existing completed sub-steps from STEPS.json and just append these).
 */
export function reBreakdownStep(
  parentStep: WorkStep,
  failureContext: {
    error?: string;
    turnsUsed: number;
    lastActions?: string;
  },
  existingSubSteps: WorkStep[] = []
): WorkStep[] {
  const baseStepNum = parentStep.step_number;

  // Check if we've hit the re-breakdown limit
  const currentReBreakdownCount = parentStep.re_breakdown_count || 0;
  if (currentReBreakdownCount >= MAX_RE_BREAKDOWN_COUNT) {
    // Return empty - caller should mark as blocked
    return [];
  }

  type SubStepRole = 'research' | 'implement' | 'validate';
  const roleTemplates: Array<{ role: SubStepRole; build: () => WorkStep }> = [
    {
      role: 'research',
      build: () => ({
        step_number: baseStepNum,
        title: `Research and plan: ${parentStep.title}`,
        description: `Analyze why the original step failed. Research alternative approaches. Create detailed plan.`,
        status: 'pending',
        dependencies: parentStep.dependencies,
        estimated_turns: 60,
        re_breakdown_count: currentReBreakdownCount + 1,
      }),
    },
    {
      role: 'implement',
      build: () => ({
        step_number: baseStepNum,
        title: `Implement core: ${parentStep.title}`,
        description: `Implement the core functionality with minimal scope.`,
        status: 'pending',
        dependencies: [baseStepNum],
        estimated_turns: 80,
        re_breakdown_count: currentReBreakdownCount + 1,
      }),
    },
    {
      role: 'validate',
      build: () => ({
        step_number: baseStepNum,
        title: `Complete and validate: ${parentStep.title}`,
        description: `Complete remaining work and validate the implementation.`,
        status: 'pending',
        dependencies: [baseStepNum],
        estimated_turns: 70,
        re_breakdown_count: currentReBreakdownCount + 1,
      }),
    },
  ];

  const completedRoles = new Set<SubStepRole>();
  for (const s of existingSubSteps) {
    if (s.status !== 'complete') continue;
    const role = classifySubStepRole(s.title);
    if (role) completedRoles.add(role);
  }

  return roleTemplates
    .filter(t => !completedRoles.has(t.role))
    .map(t => t.build());
}

/**
 * Map a sub-step title back to its role so we can tell whether an existing
 * completed sub-step already covers that role. Case-insensitive prefix match.
 */
function classifySubStepRole(title: string): 'research' | 'implement' | 'validate' | null {
  const t = title.trim().toLowerCase();
  if (t.startsWith('research and plan')) return 'research';
  if (t.startsWith('implement core')) return 'implement';
  if (t.startsWith('complete and validate')) return 'validate';
  return null;
}

/**
 * Write steps to a goal bundle's STEPS.json (source of truth) + PROGRESS_LOG.md.
 * STEPS.json is the only step store -- PROMPT.md is no longer written with ## Steps.
 */
export async function writeStepsToBundle(
  bundlePath: string,
  steps: WorkStep[],
  trigger: 'auto' | 're-breakdown' = 'auto'
): Promise<boolean> {
  // Guard: don't overwrite if STEPS.json already exists
  if (stepsJsonExists(bundlePath)) {
    console.log(`[${new Date().toISOString()}] STEPS.json already exists at ${bundlePath} — skipping write`);
    return false;
  }

  // Write STEPS.json (atomic via .tmp + rename)
  const tasksFile = createStepsFile(steps, trigger);
  const written = await writeStepsJson(bundlePath, tasksFile);

  if (!written) {
    console.log(`[${new Date().toISOString()}] Failed to write STEPS.json at ${bundlePath}`);
    return false;
  }

  // Append breakdown event to PROGRESS_LOG.md
  const totalEstimatedTurns = steps.reduce((sum, s) => sum + (s.estimated_turns || 100), 0);
  await logBreakdownProgress(bundlePath, steps.length, trigger, totalEstimatedTurns);

  return true;
}

/**
 * Check if step needs re-breakdown after failure
 */
export function shouldReBreakdown(step: WorkStep, turnsUsed: number): boolean {
  const maxTurnsPerStep = parseInt(process.env.MAX_TURNS_PER_STEP || '100', 10);
  const currentReBreakdownCount = step.re_breakdown_count || 0;

  // Re-breakdown if:
  // 1. Used 80%+ of allocated turns
  // 2. Haven't exceeded re-breakdown limit
  return turnsUsed >= maxTurnsPerStep * 0.8 && currentReBreakdownCount < MAX_RE_BREAKDOWN_COUNT;
}

/**
 * Log breakdown event to work ledger
 */
export async function logBreakdownEvent(
  goalId: string,
  goalTitle: string,
  stepsCreated: number,
  trigger: 'auto' | 're-breakdown'
): Promise<void> {
  const { appendFile } = await import('fs/promises');
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');

  const entry = JSON.stringify({
    event: 'GOAL_BREAKDOWN',
    ts: new Date().toISOString(),
    goal_id: goalId,
    goal_title: goalTitle,
    steps_created: stepsCreated,
    trigger: trigger,
  });

  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}
