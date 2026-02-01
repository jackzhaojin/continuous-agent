/**
 * Intelligent Prompt Builder (v2 - Using Prompt System)
 *
 * Builds smart worker prompts using the new prompt management system.
 * All prompts now loaded from markdown files with individual versioning.
 */

import type { WorkerContract, WorkItem } from '../../core/types.js';
import { classifyIntent, type IntentClassification } from './intent-classifier.js';
import { selectStrategy } from './strategy-selector.js';
import { composePrompts } from '../prompts/loader.js';
import { buildProjectMemoryContext } from '../../deterministic/project-memory-store.js';

interface RetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
}

/**
 * Build a comprehensive worker prompt with full intelligence context
 */
export async function buildIntelligentPrompt(
  contract: WorkerContract,
  item: WorkItem,
  projectPath: string,
  retryContext?: RetryContext
): Promise<string> {
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
  const { rendered } = await import('../prompts/loader.js').then(m => m.loadAndRender(
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
