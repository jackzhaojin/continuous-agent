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
import type { SkillDefinition, PlaybookDefinition } from '../../deterministic/library-loader-types.js';
import { adaptPromptForVendor } from './vendor-adapter.js';
import { logAgentic } from '../../core/logging.js';
import path from 'path';
import os from 'os';

export interface RetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
}

/** Web project detection regex (word-bounded to avoid false positives like "build" matching "ui") */
const WEB_KEYWORDS = /next\.?js|react|vue|angular|\bhtml\b|\bcss\b|website|web.?app|frontend|\bui\b|component|page|form|dashboard/i;

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
  const webTestingSkill = isWebProject
    ? skillResult.skills.find(s => s.name === 'web-testing')
    : null;

  // Template variables for skill body rendering
  const skillVars: Record<string, string> = {
    PROJECT_PATH: projectPath,
  };

  logAgentic(`[V2 Prompt] Vendor: ${resolvedVendor}, Pattern: ${patternResolution.pattern} (${patternResolution.source})`);
  if (workerBaseSkill) logAgentic(`[V2 Prompt] Loaded worker-base skill`);
  if (webTestingSkill) logAgentic(`[V2 Prompt] Loaded web-testing skill (web project detected)`);
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

  // 7. Web testing skill (for web projects)
  if (webTestingSkill) {
    const renderedWebTesting = renderSkillBody(webTestingSkill.body, skillVars);
    sections.push(renderedWebTesting.trim());
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
