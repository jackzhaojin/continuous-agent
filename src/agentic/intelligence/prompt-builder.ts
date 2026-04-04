/**
 * Intelligent Prompt Builder (v2 - Using Prompt System)
 *
 * Builds smart worker prompts using the new prompt management system.
 * All prompts now loaded from markdown files with individual versioning.
 *
 * V2.0: When V2_PROMPT_COMPOSITION=true, uses library-based composition:
 *   objective -> constraints -> execution-pattern behavior -> playbook procedure -> skill references -> validation criteria
 * When flag is off (default), the existing V1 pipeline is used unchanged.
 */

import type { WorkerContract, WorkItem, ExecutionPattern } from '../../core/types.js';
import { classifyIntent, type IntentClassification } from './intent-classifier.js';
import { selectStrategy } from './strategy-selector.js';
import { composePrompts } from '../worker-prompts/loader.js';
import { buildProjectMemoryContext } from '../../deterministic/project-memory-store.js';
import { loadSkillLibrary } from '../../deterministic/skill-loader.js';
import { loadPlaybookLibrary } from '../../deterministic/playbook-loader.js';
import { resolveExecutionPattern } from '../../deterministic/execution-pattern-resolver.js';
import type { SkillDefinition, PlaybookDefinition } from '../../deterministic/library-loader-types.js';
import { logAgentic } from '../../core/logging.js';
import path from 'path';

interface RetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
}

/**
 * Build a comprehensive worker prompt with full intelligence context.
 *
 * When V2_PROMPT_COMPOSITION=true, delegates to the V2 library-based composition path.
 * Otherwise uses the existing V1 prompt template pipeline.
 */
export async function buildIntelligentPrompt(
  contract: WorkerContract,
  item: WorkItem,
  projectPath: string,
  retryContext?: RetryContext
): Promise<string> {
  // V2 path: library-based prompt composition
  if (isV2PromptCompositionEnabled()) {
    logAgentic('[prompt-builder] Using V2 prompt composition path');
    return buildV2ComposedPrompt(contract, item, projectPath, retryContext);
  }

  // V1 path: existing template-based prompt pipeline
  const intent = await classifyIntent(item);

  const prompts: Array<[string, string, Record<string, any>]> = [];

  // 1. Base worker prompt (always included)
  prompts.push([
    'worker',
    'worker-base',
    {
      TASK_TITLE: item.title,
      PRIORITY: item.priority,
      CONTRACT_ID: contract.id,
      PROJECT_PATH: projectPath,
      TOOLS_ALLOWED: contract.scope.tools_allowed.join(', '),
      MAX_TURNS: contract.max_turns,
      DEFINITION_OF_DONE: contract.definition_of_done.map((item, i) => `${i + 1}. ${item}`).join('\n'),
      RISK_ASSESSMENT: contract.risk_assessment,
      REQUIRED_CAPABILITIES: contract.required_skills.length > 0 ? contract.required_skills.join(', ') : 'none specified',
      LOGGING_OBLIGATIONS: contract.logging_obligations.map(item => `- ${item}`).join('\n'),
      TASK_DESCRIPTION: item.description ? `## Description\n${item.description}` : '',
      AGENT_CODEBASE: process.cwd()
    }
  ]);

  // 2. Research phase (if needed)
  if (intent.research_required) {
    prompts.push([
      'research',
      'research-phase',
      {
        INTENT_TYPE: intent.type,
        CONFIDENCE: intent.confidence,
        REASONING: intent.reasoning,
        RESEARCH_QUESTIONS: intent.suggested_research_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
      }
    ]);
  }

  // 3. Strategy guidance (if retry or first attempt)
  if (retryContext) {
    const strategySelection = selectStrategy(item, retryContext.triedStrategies);

    if (strategySelection) {
      const { strategy, previous_attempts, remaining_strategies } = strategySelection;

      let previousFailure = '';
      if (previous_attempts > 0 && retryContext.lastError) {
        previousFailure = `### Previous Failure:
The last attempt failed with: ${retryContext.lastError.slice(0, 200)}

**IMPORTANT:** This attempt must use a DIFFERENT approach. Do not repeat the same mistakes.`;
      }

      let persistenceReminder = '';
      if (previous_attempts >= 5) {
        persistenceReminder = `### PERSISTENCE REMINDER:
You have tried ${previous_attempts} times. AI is smart. Think harder about:
- What is fundamentally different you can try?
- Is there a simpler version of this problem?
- Can you break it into smaller pieces?
- Is there an assumption you're making that's wrong?`;
      }

      prompts.push([
        'strategy',
        'strategy-guidance',
        {
          STRATEGY_NAME: strategy.name,
          STRATEGY_DESCRIPTION: strategy.description,
          STRATEGY_APPROACH: strategy.approach,
          ATTEMPT_NUMBER: previous_attempts + 1,
          REMAINING_STRATEGIES: remaining_strategies,
          PREVIOUS_FAILURE: previousFailure,
          PERSISTENCE_REMINDER: persistenceReminder
        }
      ]);
    }
  }

  // 4. Retry context (if this is a retry)
  if (retryContext && retryContext.attempts > 0) {
    const remaining = retryContext.maxRetries - retryContext.attempts;
    const isFinalAttempts = retryContext.attempts >= 7;

    let finalAttemptsWarning = '';
    if (isFinalAttempts) {
      finalAttemptsWarning = `### FINAL ATTEMPTS WARNING
You are running low on retries. Be strategic:
1. Try the SIMPLEST possible version that proves the core concept
2. If that works, build up incrementally
3. If fundamental blockers exist, document them clearly for needs-you.md`;
    }

    prompts.push([
      'retry',
      'retry-context',
      {
        CURRENT_ATTEMPT: retryContext.attempts + 1,
        MAX_RETRIES: retryContext.maxRetries,
        REMAINING_ATTEMPTS: remaining,
        STRATEGIES_TRIED: retryContext.triedStrategies.join(', ') || 'none recorded',
        LAST_ERROR: retryContext.lastError ? retryContext.lastError.slice(0, 300) + '...' : 'No error details available',
        FINAL_ATTEMPTS_WARNING: finalAttemptsWarning,
        IS_FINAL_ATTEMPTS: isFinalAttempts
      }
    ]);
  }

  // Compose all prompts together
  let finalPrompt = await composePrompts(prompts);

  // V1.2: Append project memory context (not template-based)
  const taskCategory = detectTaskCategory(item);
  const taskCapabilities = inferCapabilities(item);
  const memoryContext = buildProjectMemoryContext(taskCapabilities, taskCategory);
  if (memoryContext) {
    finalPrompt += '\n\n' + memoryContext;
  }

  return finalPrompt;
}

/**
 * Build a minimal prompt for simple tasks (when intent is what_and_how)
 */
export async function buildSimplePrompt(
  contract: WorkerContract,
  projectPath: string
): Promise<string> {
  // For simple tasks, just use the base worker prompt
  const { rendered } = await import('../worker-prompts/loader.js').then(m => m.loadAndRender(
    'worker',
    'worker-base',
    {
      TASK_TITLE: contract.prompt,
      PRIORITY: 'P1',
      CONTRACT_ID: contract.id,
      PROJECT_PATH: projectPath,
      TOOLS_ALLOWED: contract.scope.tools_allowed.join(', '),
      MAX_TURNS: contract.max_turns,
      DEFINITION_OF_DONE: contract.definition_of_done.map((item, i) => `${i + 1}. ${item}`).join('\n'),
      RISK_ASSESSMENT: contract.risk_assessment,
      REQUIRED_CAPABILITIES: contract.required_skills.length > 0 ? contract.required_skills.join(', ') : 'none specified',
      LOGGING_OBLIGATIONS: contract.logging_obligations.map(item => `- ${item}`).join('\n'),
      TASK_DESCRIPTION: '',
      AGENT_CODEBASE: process.cwd()
    }
  ));

  return rendered;
}

// =====================================================================
// V2 PROMPT COMPOSITION (behind V2_PROMPT_COMPOSITION feature flag)
// =====================================================================

/** Whether V2 prompt composition is enabled (default: false) */
function isV2PromptCompositionEnabled(): boolean {
  return process.env.V2_PROMPT_COMPOSITION === 'true';
}

/**
 * Execution pattern behavior descriptions injected into V2 prompts.
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

/**
 * Find the best matching playbook for a work item based on tags and title keywords.
 * Returns null if no playbook matches well enough.
 */
function findMatchingPlaybook(item: WorkItem, playbooks: PlaybookDefinition[]): PlaybookDefinition | null {
  if (playbooks.length === 0) return null;

  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  // Score each playbook by keyword overlap with the work item
  let bestScore = 0;
  let bestPlaybook: PlaybookDefinition | null = null;

  for (const pb of playbooks) {
    let score = 0;
    // Check tags
    for (const tag of pb.tags) {
      if (text.includes(tag.toLowerCase())) score += 1;
    }
    // Check playbook name
    const nameWords = pb.name.replace(/[-_]/g, ' ').toLowerCase().split(/\s+/);
    for (const word of nameWords) {
      if (word.length > 2 && text.includes(word)) score += 2;
    }
    // Check playbook goal
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

/**
 * Build a V2 composed prompt from library content.
 *
 * Prompt structure:
 *   1. Objective (task title + description)
 *   2. Constraints (definition of done, risk, tools)
 *   3. Execution pattern behavior
 *   4. Playbook procedure (body)
 *   5. Skill references (bodies)
 *   6. Validation criteria
 */
export async function buildV2ComposedPrompt(
  contract: WorkerContract,
  item: WorkItem,
  projectPath: string,
  retryContext?: RetryContext,
): Promise<string> {
  const skillsRoot = path.join(process.cwd(), 'skills');
  const playbooksRoot = path.join(process.cwd(), 'playbooks');

  // Load libraries
  const [skillResult, playbookResult] = await Promise.all([
    loadSkillLibrary(skillsRoot).catch(() => ({ skills: [] as SkillDefinition[], warnings: [] })),
    loadPlaybookLibrary(playbooksRoot).catch(() => ({ playbooks: [] as PlaybookDefinition[], warnings: [] })),
  ]);

  // Match playbook
  const matchedPlaybook = findMatchingPlaybook(item, playbookResult.playbooks);

  // Resolve execution pattern
  const patternResolution = resolveExecutionPattern(item, matchedPlaybook);

  // Find referenced skills
  const referencedSkills = findReferencedSkills(matchedPlaybook, skillResult.skills);

  logAgentic(`[V2 Prompt] Pattern: ${patternResolution.pattern} (${patternResolution.source})`);
  if (matchedPlaybook) {
    logAgentic(`[V2 Prompt] Matched playbook: ${matchedPlaybook.name}`);
  }
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

  // 3. Execution pattern behavior
  const patternBehavior = EXECUTION_PATTERN_BEHAVIORS[patternResolution.pattern];
  if (patternBehavior) {
    sections.push(patternBehavior);
  }

  // 4. Playbook procedure
  if (matchedPlaybook && matchedPlaybook.body.trim()) {
    sections.push(`## Playbook: ${matchedPlaybook.name}

${matchedPlaybook.body.trim()}
`);
  }

  // 5. Skill references
  if (referencedSkills.length > 0) {
    const skillSections = referencedSkills.map(skill =>
      `### Skill: ${skill.name}\n\n${skill.body.trim()}`
    );
    sections.push(`## Skill References\n\n${skillSections.join('\n\n---\n\n')}`);
  }

  // 6. Validation criteria
  sections.push(`## Validation Criteria

The verifier will check:
${contract.definition_of_done.map((d, i) => `- [ ] ${d}`).join('\n')}
`);

  // Compose
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

  return finalPrompt;
}

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
