/**
 * Prompt Builder (V2 — Skill-Based Composition)
 *
 * Composes worker prompts from skill libraries, playbooks, and vendor adaptation.
 * V1 template pipeline has been removed — this is the only active path.
 *
 * Prompt structure:
 *   objective -> constraints -> worker-base skill -> execution-pattern behavior
 *   -> playbook procedure -> skill references -> web-testing skill (if web)
 *   -> validation criteria -> retry context -> project memory
 *
 * Vendor adaptation:
 *   - Claude: Lighter prompt (SDK auto-discovers skills + CLAUDE.md)
 *   - Kimi/Codex: Full prompt with all skill bodies + tool name mappings injected
 */

import type { WorkerContract, WorkItem, ExecutionPattern } from '../../core/types.js';
import type { AgentWorkerVendor } from '../../core/vendor/types.js';
import { buildProjectMemoryContext } from '../../deterministic/project-memory-store.js';
import { loadSkillLibrary } from '../../deterministic/skill-loader.js';
import { loadPlaybookLibrary } from '../../deterministic/playbook-loader.js';
import { resolveExecutionPattern } from '../../deterministic/execution-pattern-resolver.js';
import {
  readLatestStructuredHandoff,
  emitWorkLedgerEvent,
  writeContractSkillManifest,
} from '../../deterministic/state-handler.js';
import { readStepsJson } from '../../deterministic/steps-json-handler.js';
import type { SkillDefinition, PlaybookDefinition } from '../../deterministic/library-loader-types.js';
import { adaptPromptForVendor } from './vendor-adapter.js';

/**
 * v2.4.1 — Resolve the directory name of a skill (the segment workers use in
 * `.claude/skills/<dir>/SKILL.md` paths). Inlined here because it's the only
 * consumer after the runtime INDEX generator was retired.
 */
function skillDirectoryName(skill: SkillDefinition): string {
  return path.basename(path.dirname(skill.source_path));
}
import { logAgentic } from '../../core/logging.js';
import { existsSync, readFileSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import os from 'os';

export interface RetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
}

/** Web project detection regex (word-bounded to avoid false positives like "build" matching "ui") */
export const WEB_KEYWORDS = /next\.?js|react|vue|angular|\bhtml\b|\bcss\b|website|web.?app|frontend|\bui\b|component|page|form|dashboard/i;

// Auto-load `azure-function-deploy` skill when the goal mentions Azure Functions
// or GitHub Actions for an Azure Functions project. Mirrors the WEB_KEYWORDS
// pattern. See ai-docs/v2/2026-05-09-v2.4-azure-modification/plan.md.
export const AZURE_FUNCTIONS_KEYWORDS = /azure[\s-]?function|\bfunc\s+(start|deploy|run|init)\b|functions-action|az\s+functionapp|\.funcignore|host\.json/i;

/** Path to worker skills source directory (synced to ai-sandbox/.claude/skills/ by worker-spawner) */
const WORKER_SKILLS_ROOT = path.join(process.cwd(), 'claude-files-to-output', 'skills');

/** Path to playbooks directory */
const PLAYBOOKS_ROOT = path.join(process.cwd(), 'playbooks');

/**
 * Build a comprehensive worker prompt with full intelligence context.
 * Composes prompt from skill libraries, applies vendor adaptation.
 */
export async function buildIntelligentPrompt(
  contract: WorkerContract,
  item: WorkItem,
  projectPath: string,
  retryContext?: RetryContext,
  vendor?: AgentWorkerVendor,
): Promise<string> {
  logAgentic(`[prompt-builder] Building prompt for vendor=${vendor || 'claude'}`);
  return buildV2ComposedPrompt(contract, item, projectPath, retryContext, vendor);
}

// =====================================================================
// EXECUTION PATTERN BEHAVIORS (structural — keyed by pattern name)
// =====================================================================

/**
 * Execution pattern behavior descriptions injected into prompts.
 * These tell the worker HOW to behave under each pattern.
 */
const EXECUTION_PATTERN_BEHAVIORS: Record<ExecutionPattern, string> = {
  'plan-then-execute': `## Execution Pattern: Plan-Then-Execute

You MUST plan before building. Follow this sequence:
1. Research the problem space — read existing code, docs, and requirements
2. Create a concrete plan (what you will build, in what order)
3. Execute the plan step by step
4. Validate the output against the definition of done

Do NOT start writing code until you have a clear plan.`,

  'loop-until-progress': `## Execution Pattern: Loop-Until-Progress

You operate in a continuous improvement loop:
1. Assess current state — what exists, what's missing, what's broken
2. Pick the highest-value next action
3. Execute it
4. Validate progress — did things improve?
5. Repeat until the definition of done is satisfied or you run out of turns

Prioritize forward progress over perfection. Ship incremental improvements.`,

  'plan-mode': `## Execution Pattern: Plan-Mode (Read-Only)

You are in PLAN MODE. You may ONLY read and analyze — you MUST NOT modify any files.
Your deliverable is a detailed plan document, NOT implementation.

Allowed actions:
- Read files, search code, browse documentation
- Analyze architecture, dependencies, and patterns
- Produce a written plan with phases, risks, and estimates

Forbidden actions:
- Writing, editing, or creating any files (except the plan output document)
- Running build commands, installing packages, or executing code
- Making any changes to the codebase`,

  'deterministic-pipeline': `## Execution Pattern: Deterministic Pipeline

You are executing a fixed-step pipeline. Follow the pipeline steps exactly as defined.
Do NOT deviate from the prescribed sequence. Each step's output feeds the next step.

If a step fails, report the failure with details — do NOT skip ahead.`,

  'harness': `## Execution Pattern: Harness

This task is executed by a harness (a dedicated multi-agent plan-then-build pipeline
with its own orchestrator). The executive loop hands off to the harness via
src/agentic/execution/harness-executor.ts. Internal harness retries are handled by
the harness itself and do NOT count against the executive's failure threshold.

This behavior description is informational only — the harness owns prompt composition
for its own internal agent calls.`,
};

// =====================================================================
// PLAYBOOK & SKILL MATCHING
// =====================================================================

/**
 * Find the best matching playbook for a work item based on tags and title keywords.
 */
function findMatchingPlaybook(item: WorkItem, playbooks: PlaybookDefinition[]): PlaybookDefinition | null {
  if (playbooks.length === 0) return null;

  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  let bestScore = 0;
  let bestPlaybook: PlaybookDefinition | null = null;

  for (const pb of playbooks) {
    let score = 0;
    for (const tag of pb.tags) {
      if (text.includes(tag.toLowerCase())) score += 1;
    }
    const nameWords = pb.name.replace(/[-_]/g, ' ').toLowerCase().split(/\s+/);
    for (const word of nameWords) {
      if (word.length > 2 && text.includes(word)) score += 2;
    }
    if (pb.goal) {
      const goalWords = pb.goal.toLowerCase().split(/\s+/);
      for (const word of goalWords) {
        if (word.length > 3 && text.includes(word)) score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPlaybook = pb;
    }
  }

  return bestScore >= 2 ? bestPlaybook : null;
}

/**
 * Find skills referenced by a playbook's composes_skills list.
 */
function findReferencedSkills(playbook: PlaybookDefinition | null, allSkills: SkillDefinition[]): SkillDefinition[] {
  if (!playbook || playbook.composes_skills.length === 0) return [];

  const referenced: SkillDefinition[] = [];
  for (const skillName of playbook.composes_skills) {
    const match = allSkills.find(s => s.name === skillName);
    if (match) referenced.push(match);
  }
  return referenced;
}

// =====================================================================
// TEMPLATE VARIABLE SUBSTITUTION
// =====================================================================

/**
 * Replace {{VARIABLE}} placeholders in a skill body with actual values.
 */
function renderSkillBody(body: string, variables: Record<string, string>): string {
  let rendered = body;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return rendered;
}

// =====================================================================
// V2 PROMPT COMPOSITION
// =====================================================================

/**
 * Build a composed prompt from skill/playbook libraries.
 *
 * Steps:
 *   1. Load worker skills from claude-files-to-output/skills/
 *   2. Load playbooks from playbooks/ (if any)
 *   3. Compose sections: objective, constraints, worker-base, pattern, playbook, skills, web-testing, validation
 *   4. Apply vendor adaptation (inject skill bodies for non-Claude vendors)
 */
export async function buildV2ComposedPrompt(
  contract: WorkerContract,
  item: WorkItem,
  projectPath: string,
  retryContext?: RetryContext,
  vendor?: AgentWorkerVendor,
): Promise<string> {
  const resolvedVendor = vendor || 'claude';

  // Load worker skill and playbook libraries
  const [skillResult, playbookResult] = await Promise.all([
    loadSkillLibrary(WORKER_SKILLS_ROOT).catch(() => ({ skills: [] as SkillDefinition[], warnings: [] })),
    loadPlaybookLibrary(PLAYBOOKS_ROOT).catch(() => ({ playbooks: [] as PlaybookDefinition[], warnings: [] })),
  ]);

  // Match playbook
  const matchedPlaybook = findMatchingPlaybook(item, playbookResult.playbooks);

  // Resolve execution pattern
  const patternResolution = resolveExecutionPattern(item, matchedPlaybook);

  // Find playbook-referenced skills
  const referencedSkills = findReferencedSkills(matchedPlaybook, skillResult.skills);

  // Find core worker skills
  const workerBaseSkill = skillResult.skills.find(s => s.name === 'worker-base');
  const itemText = `${item.title} ${item.description || ''}`;
  const isWebProject = WEB_KEYWORDS.test(itemText);
  const isAzureFunctionsProject = AZURE_FUNCTIONS_KEYWORDS.test(itemText);
  // v2.4 A5 — ledger-driven Playwright policy. Web-testing is required for
  // UI-visible steps, recommended for ambiguous steps, and skipped for steps
  // that are deterministically backend-only (PREREQUISITE-0 schema, PREREQUISITE-1
  // API smoke, or titles that scream backend/api). This stops workers from
  // spinning up Playwright for a pure API endpoint step and wasting turns.
  const isBackendOnlyStep = isBackendOnlyStepTitle(item.title);
  const isBackendOnlyItem = !isWebProject || isBackendOnlyStep;
  const webTestingSkill = !isBackendOnlyItem
    ? skillResult.skills.find(s => s.name === 'web-testing')
    : null;
  const backendTestingSkill = isBackendOnlyItem || isBackendOnlyStep
    ? skillResult.skills.find(s => s.name === 'backend-testing')
    : null;
  const azureFunctionDeploySkill = isAzureFunctionsProject
    ? skillResult.skills.find(s => s.name === 'azure-function-deploy')
    : null;

  // Template variables for skill body rendering
  const skillVars: Record<string, string> = {
    PROJECT_PATH: projectPath,
  };

  logAgentic(`[V2 Prompt] Vendor: ${resolvedVendor}, Pattern: ${patternResolution.pattern} (${patternResolution.source})`);
  if (workerBaseSkill) logAgentic(`[V2 Prompt] Loaded worker-base skill`);
  if (webTestingSkill) logAgentic(`[V2 Prompt] Loaded web-testing skill (web project detected)`);
  if (azureFunctionDeploySkill) logAgentic(`[V2 Prompt] Loaded azure-function-deploy skill (Azure Functions project detected)`);
  if (matchedPlaybook) logAgentic(`[V2 Prompt] Matched playbook: ${matchedPlaybook.name}`);
  if (referencedSkills.length > 0) {
    logAgentic(`[V2 Prompt] Referenced skills: ${referencedSkills.map(s => s.name).join(', ')}`);
  }

  // === Compose sections ===
  const sections: string[] = [];

  // 1. Objective
  sections.push(`# Objective: ${item.title}

**Priority:** ${item.priority}
**Contract:** ${contract.id}
**Project Path:** ${projectPath}

${item.description || 'No description provided.'}
`);

  // 2. Constraints
  sections.push(`## Constraints

**Tools Allowed:** ${contract.scope.tools_allowed.join(', ')}
**Max Turns:** ${contract.max_turns}
**Risk Assessment:** ${contract.risk_assessment}

### Definition of Done
${contract.definition_of_done.map((d, i) => `${i + 1}. ${d}`).join('\n')}

### Logging
${contract.logging_obligations.map(o => `- ${o}`).join('\n')}
`);

  // 2b. Definition of Done — JOURNEY (v2.1.7)
  // The top-line contract: what user flow must work end-to-end when the goal is done.
  // Every individual step contributes to THIS flow. The worker is expected to see
  // the whole journey, not just its assigned slice.
  if (isWebProject && item.definition_of_done_journey) {
    sections.push(`## Definition of Done — User Journey (the WHOLE goal, not just this step)

The final state of this goal must execute the following user flow end-to-end, in a real running app, with real data:

> ${item.definition_of_done_journey}

Your step is one piece of this flow. When you finish, walk the journey from its natural start through your change and verify data persists across screens. See the \`web-testing\` skill section on Journey Verification.

**Do NOT build components in isolation against hardcoded mock data.** That was the exact failure mode of the 2026-04-06 B2B postal-checkout run — 32 steps, 52 commits, 0 working end-to-end flows. Read \`ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout.md\` if you need the history.
`);
  }

  // 2c. Structured handoff from the previous step (v2.1.7)
  // If a prior step completed and left a structured handoff on STEPS.json, surface it
  // verbatim so the current worker starts with the previous worker's map of what connects
  // to what — not a free-text summary extracted from a log.
  if (item.source_path) {
    try {
      const priorHandoff = await readLatestStructuredHandoff(item.source_path);
      if (priorHandoff) {
        const formatField = (label: string, value?: string | number) =>
          value !== undefined && value !== '' ? `- **${label}:** ${value}` : null;
        const lines = [
          formatField('Step', priorHandoff.step_id),
          formatField('What was built', priorHandoff.what_i_built),
          formatField('What connects', priorHandoff.what_connects),
          formatField('What was verified', priorHandoff.what_i_verified),
          formatField('Known gaps', priorHandoff.known_gaps),
          formatField('Next step should know', priorHandoff.next_step_should_know),
          formatField('Journey blocks added', priorHandoff.journey_blocks_added),
        ].filter((l): l is string => l !== null);
        if (lines.length > 0) {
          sections.push(`## Prior Step Handoff (structured)

The previous step left this handoff for you. Read it carefully — these are the connection points you need.

${lines.join('\n')}

If "Known gaps" lists anything that belongs to your step, fix it before building anything new.`);
        }
      }
    } catch (err) {
      logAgentic(`[V2 Prompt] Could not load prior structured handoff: ${err}`);
    }
  }

  // 2d. Current System State (v2.4 I0)
  // Workers kept reinventing API contracts and building UI against hardcoded mock
  // data because every step started with zero context about what the system could
  // actually do. Give every worker a small factual snapshot:
  //   - which API endpoints exist (method + path)
  //   - how many journey blocks the last integration gate added
  //   - which project-level markers are present (package.json, schema, env)
  // This is deterministic text-from-disk — no server needs to be running.
  try {
    const systemState = await buildCurrentSystemStateSection(projectPath, item);
    if (systemState) sections.push(systemState);
  } catch (err) {
    logAgentic(`[V2 Prompt] Could not build current-system-state section: ${err}`);
  }

  // 3. Worker-base skill (constitution, monorepo rules, execution guidelines)
  if (workerBaseSkill) {
    const renderedBase = renderSkillBody(workerBaseSkill.body, skillVars);
    sections.push(renderedBase.trim());
  }

  // 4. Execution pattern behavior
  const patternBehavior = EXECUTION_PATTERN_BEHAVIORS[patternResolution.pattern];
  if (patternBehavior) {
    sections.push(patternBehavior);
  }

  // 5. Playbook procedure
  if (matchedPlaybook && matchedPlaybook.body.trim()) {
    sections.push(`## Playbook: ${matchedPlaybook.name}

${matchedPlaybook.body.trim()}
`);
  }

  // 6. Playbook-referenced skill bodies
  if (referencedSkills.length > 0) {
    const skillSections = referencedSkills.map(skill =>
      `### Skill: ${skill.name}\n\n${renderSkillBody(skill.body, skillVars).trim()}`
    );
    sections.push(`## Skill References\n\n${skillSections.join('\n\n---\n\n')}`);
  }

  // 7. Skill disclosure — Claude keeps full-body, Kimi/Codex rely on the manually-maintained
  // Worker Skill Index that lives inside worker-base.
  //
  // Rationale (v2.4.1): Claude SDK lazy-loads SKILL.md bodies via the `Skill` tool — injecting
  // them is wasteful but well-tested, so we keep the current behavior. Kimi and Codex have no
  // skill auto-discovery; before v2.4.1 we paid the full body of every matched skill on every
  // spawn. The 2026-04-18 Recipe Book run proved Kimi ReadFiles SKILL.md when merely referenced,
  // so for those vendors the manual index inside worker-base is enough — no runtime-generated
  // manifest needed.
  const isClaude = resolvedVendor === 'claude';
  if (isClaude) {
    // Claude path: full-body injection (unchanged behavior)
    if (webTestingSkill) {
      const renderedWebTesting = renderSkillBody(webTestingSkill.body, skillVars);
      sections.push(renderedWebTesting.trim());
    }
    if (backendTestingSkill) {
      const renderedBackend = renderSkillBody(backendTestingSkill.body, skillVars);
      sections.push(renderedBackend.trim());
    }
    if (azureFunctionDeploySkill) {
      const renderedAzure = renderSkillBody(azureFunctionDeploySkill.body, skillVars);
      sections.push(renderedAzure.trim());
    }
  }
  // Kimi / Codex path: no additional injection. Worker-base already contains the manual
  // "Worker Skill Index" table + "Which skill applies to which step" decision table.

  // 7b. Compute required_skills for the verifier to gate on. Deterministic mapping
  // based on project type + step kind — the same triggers that previously selected
  // web-testing / backend-testing for full-body injection. worker-base is always
  // required but is already loaded as the universal prelude, so we elide it from
  // the gate list (there is no "did the worker ReadFile worker-base" check).
  const requiredSkillNames: string[] = [];
  const webTestingDir = webTestingSkill ? skillDirectoryName(webTestingSkill) : null;
  const backendTestingDir = backendTestingSkill ? skillDirectoryName(backendTestingSkill) : null;
  const azureFunctionDeployDir = azureFunctionDeploySkill ? skillDirectoryName(azureFunctionDeploySkill) : null;
  if (webTestingDir) requiredSkillNames.push(webTestingDir);
  if (backendTestingDir) requiredSkillNames.push(backendTestingDir);
  if (azureFunctionDeployDir) requiredSkillNames.push(azureFunctionDeployDir);

  // jack-git-commit — every step that produces code deltas must commit (Clean-Tree Rule).
  // Pure research steps skip this, but we can't cheaply detect "research only" here, so
  // gate optimistically on all steps and accept the advisory false positive on pure research.
  const gitCommitSkill = skillResult.skills.find((s) => s.name === 'jack-git-commit');
  if (gitCommitSkill) requiredSkillNames.push(skillDirectoryName(gitCommitSkill));

  // integration-validator — only required on integration-gate steps. Detect via title prefix
  // `[GATE]` (matches executive's kind='integration_gate' naming convention).
  const isIntegrationGate = /^\s*\[gate\]/i.test(item.title);
  if (isIntegrationGate) {
    const igSkill = skillResult.skills.find((s) => s.name === 'integration-validator');
    if (igSkill) requiredSkillNames.push(skillDirectoryName(igSkill));
  }

  // claude-skill-creator — only on [SKILL-BUILD] goals.
  if (item.skillBuild) {
    const cscSkill = skillResult.skills.find((s) => s.name === 'skill-creator' || s.name === 'claude-skill-creator');
    if (cscSkill) requiredSkillNames.push(skillDirectoryName(cscSkill));
  }

  // EDS skills — detect Edge Delivery projects by on-disk markers
  // (`fstab.yaml`, `scripts/aem.js`, or a top-level `blocks/` dir). When any
  // marker is present, both EDS skills are required alongside web-testing.
  const isEdsProject = detectEdsProjectMarkers(projectPath);
  if (isEdsProject) {
    const cdd = skillResult.skills.find((s) => s.name === 'eds-content-driven-development');
    const bb = skillResult.skills.find((s) => s.name === 'eds-building-blocks');
    if (cdd) requiredSkillNames.push(skillDirectoryName(cdd));
    if (bb) requiredSkillNames.push(skillDirectoryName(bb));
  }

  // Telemetry: persist manifest + emit per-skill LOADED events for adoption-rate analysis.
  // Fire-and-forget — failures are logged but never throw. We intentionally don't await
  // the ledger writes serially to keep prompt-build latency bounded.
  if (requiredSkillNames.length > 0) {
    writeContractSkillManifest(contract.id, { required_skills: requiredSkillNames, vendor: resolvedVendor });
    for (const name of requiredSkillNames) {
      emitWorkLedgerEvent('WORKER_SKILL_LOADED', {
        contract_id: contract.id,
        goal_id: item.id,
        skill_name: name,
        vendor: resolvedVendor,
      });
    }
    // Mutate the contract so downstream (validation-handler, verifier) can see the list
    // without having to reload the manifest from disk when they already have the contract.
    contract.required_skills = requiredSkillNames;
  }

  // 8. Validation criteria
  sections.push(`## Validation Criteria

The verifier will check:
${contract.definition_of_done.map((d, i) => `- [ ] ${d}`).join('\n')}
`);

  // Compose base prompt
  let finalPrompt = sections.join('\n\n---\n\n');

  // Append retry context if applicable
  if (retryContext && retryContext.attempts > 0) {
    finalPrompt += `\n\n---\n\n## Retry Context

**Attempt:** ${retryContext.attempts + 1} / ${retryContext.maxRetries}
**Strategies tried:** ${retryContext.triedStrategies.join(', ') || 'none'}
**Last error:** ${retryContext.lastError?.slice(0, 300) || 'unknown'}

You MUST try a different approach than previous attempts.
`;
  }

  // Append project memory context
  const taskCategory = detectTaskCategory(item);
  const taskCapabilities = inferCapabilities(item);
  const memoryContext = buildProjectMemoryContext(taskCapabilities, taskCategory);
  if (memoryContext) {
    finalPrompt += '\n\n' + memoryContext;
  }

  // Apply vendor adaptation (tool name mappings for non-Claude vendors)
  // Skill bodies are already embedded in the base prompt above — no need to re-inject
  finalPrompt = adaptPromptForVendor(finalPrompt, resolvedVendor);

  return finalPrompt;
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Detect task category from work item (for project memory lookup)
 */
function detectTaskCategory(item: WorkItem): string {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  if (text.includes('next.js') || text.includes('nextjs')) return 'nextjs';
  if (text.includes('react')) return 'react';
  if (text.includes('node')) return 'node';
  if (text.includes('python')) return 'python';
  if (text.includes('notion')) return 'misc';
  return 'misc';
}

/**
 * Infer capabilities from work item (for project memory lookup)
 */
function inferCapabilities(item: WorkItem): string[] {
  const capabilities: string[] = [];
  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  if (text.includes('next.js') || text.includes('nextjs')) {
    capabilities.push('deliver.nextjs.app.basic');
  }
  if (text.includes('notion')) {
    capabilities.push('deliver.notion.integration');
  }
  if (text.includes('react')) {
    capabilities.push('deliver.react.component');
  }
  if (text.includes('git')) {
    capabilities.push('git.commit', 'git.status');
  }

  return capabilities.length > 0 ? capabilities : ['general.implementation'];
}

// =====================================================================
// v2.4 I0 — Current System State snapshot
// =====================================================================

/**
 * Build a "Current System State" section injected between the prior-step
 * handoff and the worker-base skill. Static read-from-disk snapshot; no
 * server is started. Returns null when there's nothing useful to report
 * (e.g. `existing` build target where we don't own the project structure).
 */
export async function buildCurrentSystemStateSection(
  projectPath: string,
  item: WorkItem,
): Promise<string | null> {
  const parts: string[] = [];

  // API surface
  const endpoints = await scanApiEndpoints(projectPath);
  if (endpoints.length > 0) {
    const lines = endpoints.slice(0, 40).map(e => `- \`${e.method} ${e.routePath}\` (from \`${e.file}\`)`);
    const note = endpoints.length > 40 ? `\n(+${endpoints.length - 40} more not shown)` : '';
    parts.push(`### API Surface (detected endpoints)\n\n${lines.join('\n')}${note}\n\nDo NOT invent new endpoint paths or response shapes. If you need a new endpoint, add it explicitly and document it in your structured handoff under \`what_i_built\`.`);
  } else {
    parts.push(`### API Surface\n\nNo API routes detected on disk. If the goal requires a backend, this step may be the one that creates it — build the endpoint and curl-verify it before touching UI.`);
  }

  // Last gate test count
  if (item.source_path) {
    const gate = await findLastGateHandoff(item.source_path);
    if (gate) {
      const jb = gate.journey_blocks_added !== undefined
        ? `${gate.journey_blocks_added} block(s)`
        : '(journey_blocks_added not reported)';
      parts.push(`### Last Gate Test Count\n\nMost recent integration gate reported: **${jb}**. If your step advances the journey, your handoff must report \`journey_blocks_added\` ≥ this number. A decrease triggers a regression defect.`);
    }
  }

  // Project-level markers (lightweight health signal — no running server)
  const markers = detectProjectMarkers(projectPath);
  if (markers.length > 0) {
    parts.push(`### Project Markers\n\n${markers.map(m => `- ${m}`).join('\n')}`);
  }

  if (parts.length === 0) return null;
  return `## Current System State (read-from-disk snapshot)\n\n${parts.join('\n\n')}`;
}

interface ApiEndpoint {
  method: string;
  routePath: string;
  file: string;
}

/**
 * Walk the project for common API route file patterns and extract a minimal
 * method+path summary. Covers Next.js `app/api/**\/route.ts`, Next.js
 * `pages/api/**\/*.ts`, and generic Express-style `server/routes/*.ts`.
 *
 * Best-effort — regex parse, no AST. If we miss an endpoint the worker
 * should still declare it in their own handoff.
 */
async function scanApiEndpoints(projectPath: string): Promise<ApiEndpoint[]> {
  if (!projectPath || !existsSync(projectPath)) return [];

  const results: ApiEndpoint[] = [];

  const appApi = path.join(projectPath, 'app', 'api');
  if (existsSync(appApi)) {
    for (const file of await walkFiles(appApi, /route\.(ts|js|tsx|jsx)$/)) {
      const rel = path.relative(projectPath, file);
      const routePath = '/' + path
        .relative(path.join(projectPath, 'app'), path.dirname(file))
        .split(path.sep)
        .join('/');
      const methods = extractNextJsRouteMethods(file);
      for (const method of methods) {
        results.push({ method, routePath, file: rel });
      }
    }
  }

  const pagesApi = path.join(projectPath, 'pages', 'api');
  if (existsSync(pagesApi)) {
    for (const file of await walkFiles(pagesApi, /\.(ts|js)$/)) {
      const rel = path.relative(projectPath, file);
      const baseName = path.basename(file).replace(/\.(ts|js)$/, '');
      const subdir = path.relative(path.join(projectPath, 'pages'), path.dirname(file)).split(path.sep).join('/');
      const routePath = '/' + (subdir ? `${subdir}/${baseName}` : baseName).replace(/\/index$/, '');
      results.push({ method: 'ANY', routePath, file: rel });
    }
  }

  return results;
}

async function walkFiles(root: string, pattern: RegExp, acc: string[] = []): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(root, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        await walkFiles(full, pattern, acc);
      } else if (pattern.test(e.name)) {
        acc.push(full);
      }
    }
  } catch {
    /* ignore unreadable dirs */
  }
  return acc;
}

function extractNextJsRouteMethods(file: string): string[] {
  try {
    // Read synchronously is cheap and keeps this helper easy to test.
    const body = readFileSync(file, 'utf-8');
    const methods = new Set<string>();
    for (const m of body.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g)) {
      methods.add(m[1]);
    }
    if (methods.size === 0) {
      return ['ANY'];
    }
    return Array.from(methods);
  } catch {
    return ['ANY'];
  }
}

async function findLastGateHandoff(bundlePath: string): Promise<{ journey_blocks_added?: number } | null> {
  const stepsFile = await readStepsJson(bundlePath);
  if (!stepsFile) return null;
  const gates = stepsFile.steps
    .filter(s => s.status === 'complete' && (s.kind === 'integration_gate' || /^\[GATE\]/i.test(s.title)))
    .filter(s => !!s.handoff);
  if (gates.length === 0) return null;
  const last = gates[gates.length - 1];
  return last.handoff || null;
}

/**
 * v2.4 A5 — classify a step title as backend-only so the prompt-builder
 * can skip the (heavy) web-testing skill. The signals are conservative —
 * we only skip web-testing when we're confident the step has no UI surface.
 * Ambiguous titles fall through to the default (web-testing included).
 */
export function isBackendOnlyStepTitle(title: string): boolean {
  const t = title.toLowerCase();
  // PREREQUISITE-0 and PREREQUISITE-1 are always backend
  if (/\[prerequisite-?0\]|\[prerequisite-?1\]/.test(t)) return true;
  // Obvious backend-only patterns
  if (/\bapi endpoint\b|\brest api\b|\bserver-side\b|\bcron job\b|\bmigration\b/.test(t)) return true;
  if (/\bschema\b|\bseed data\b|\bdatabase\b|\bsupabase\b/.test(t) && !/form|page|ui|component|dashboard/.test(t)) return true;
  if (/curl smoke|health endpoint|\bpostgres\b/.test(t)) return true;
  return false;
}

/**
 * v2.4.1 — Detect whether the project at `projectPath` is an AEM Edge Delivery
 * Services project. Markers are the usual suspects: Franklin's `fstab.yaml`,
 * the platform-provided `scripts/aem.js`, or a top-level `blocks/` directory
 * (how EDS organises block implementations). Any single marker triggers it.
 */
function detectEdsProjectMarkers(projectPath: string): boolean {
  if (!projectPath || !existsSync(projectPath)) return false;
  const candidates = [
    'fstab.yaml',
    'scripts/aem.js',
    'blocks',
    'head.html',
    'paths.json',
  ];
  return candidates.some((rel) => existsSync(path.join(projectPath, rel)));
}

function detectProjectMarkers(projectPath: string): string[] {
  if (!projectPath || !existsSync(projectPath)) return [];
  const markers: string[] = [];
  const checkFile = (rel: string, label: string) => {
    if (existsSync(path.join(projectPath, rel))) markers.push(label);
  };
  checkFile('package.json', '`package.json` present');
  checkFile('next.config.js', 'Next.js project');
  checkFile('next.config.ts', 'Next.js project');
  checkFile('prisma/schema.prisma', 'Prisma schema present');
  checkFile('supabase/migrations', 'Supabase migrations present');
  checkFile('.env', '`.env` present');
  checkFile('.env.local', '`.env.local` present');
  checkFile('tests/e2e/journey.spec.ts', 'Journey spec present');
  return markers;
}
