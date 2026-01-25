/**
 * Intelligent Prompt Builder
 *
 * Builds smart worker prompts that incorporate:
 * - Research phase (for vague goals)
 * - Strategy selection (different approach per retry)
 * - Skill context (what we know we can do)
 * - Constitution awareness (hard limits)
 * - Persistence guidelines (10 retries, don't give up)
 */

import type { TaskContract, WorkItem } from '../types.js';
import { classifyIntent, type IntentClassification } from './intent-classifier.js';
import { getStrategyGuidance, selectStrategy } from './strategy-selector.js';

interface RetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
}

/**
 * Build a comprehensive worker prompt with full intelligence context
 */
export function buildIntelligentPrompt(
  contract: TaskContract,
  item: WorkItem,
  projectPath: string,
  retryContext?: RetryContext
): string {
  const intent = classifyIntent(item);
  const strategyGuidance = retryContext
    ? getStrategyGuidance(item, retryContext.triedStrategies, retryContext.lastError)
    : getStrategyGuidance(item, []);

  const sections: string[] = [];

  // Header
  sections.push(`# Task: ${item.title}`);
  sections.push(`Priority: ${item.priority} | Contract: ${contract.id}`);
  sections.push('');

  // Constitution awareness (CRITICAL)
  sections.push(buildConstitutionSection());

  // Research phase (if needed)
  if (intent.research_required) {
    sections.push(buildResearchSection(intent, item));
  }

  // Strategy guidance
  sections.push(strategyGuidance);

  // Persistence guidelines
  sections.push(buildPersistenceSection(retryContext));

  // Definition of Done
  sections.push(buildDoDSection(contract));

  // Project context
  sections.push(buildProjectSection(projectPath, contract));

  // Task description
  if (item.description) {
    sections.push(`## Description\n${item.description}`);
  }

  // Final instructions
  sections.push(buildFinalInstructions());

  return sections.join('\n\n');
}

/**
 * Constitution awareness section
 */
function buildConstitutionSection(): string {
  return `## CONSTITUTION LIMITS (IMMUTABLE)

You are operating under the Continuous Executive Agent constitution. These limits are ABSOLUTE:

1. **No spending beyond cost cap** ($20/month per service)
2. **No permanent deletions** (archive/soft-delete only)
3. **No external publishing** without approval (npm publish, blog posts, etc.)
4. **No credential exposure** (never log, commit, or transmit credentials)
5. **No access control expansion** (no making private things public)
6. **No output in agent codebase** (all output goes to agent-outputs)
7. **All activity must be logged** (no silent execution)
8. **No giving up early** (10 retries minimum before blocking)

If you hit a constitutional limit, document it and proceed with alternative work.`;
}

/**
 * Research section for vague goals
 */
function buildResearchSection(intent: IntentClassification, item: WorkItem): string {
  return `## RESEARCH PHASE REQUIRED

This goal is classified as: **${intent.type}** (confidence: ${intent.confidence}%)
Reasoning: ${intent.reasoning}

**Before writing any code, you MUST research:**

${intent.suggested_research_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

### Research Steps:
1. Read any existing related code/docs in the workspace
2. Search for patterns in similar projects
3. If needed, use WebSearch/WebFetch to find best practices
4. Document your findings and chosen approach
5. THEN proceed with implementation

**Do not skip research.** Vague goals that are executed without research fail repeatedly.`;
}

/**
 * Persistence guidelines section
 */
function buildPersistenceSection(retryContext?: RetryContext): string {
  if (!retryContext) {
    return `## PERSISTENCE GUIDELINES

**AI is smart. Think, research, try, try again.**

- If something fails, understand WHY before retrying
- Try a DIFFERENT approach, not the same thing again
- Break complex problems into smaller pieces
- If stuck, simplify the scope to the minimum viable version
- Document what you learn for future attempts`;
  }

  const remaining = retryContext.maxRetries - retryContext.attempts;

  let section = `## PERSISTENCE STATUS

**Attempt ${retryContext.attempts + 1} of ${retryContext.maxRetries}**
${remaining > 0 ? `${remaining} attempts remaining before this task is blocked.` : 'This is the FINAL attempt.'}

`;

  if (retryContext.attempts > 0) {
    section += `### Previous Attempts Failed
Strategies tried: ${retryContext.triedStrategies.join(', ') || 'none recorded'}
`;

    if (retryContext.lastError) {
      section += `Last error: ${retryContext.lastError.slice(0, 300)}...\n`;
    }

    section += `
**This attempt MUST be different.** Consider:
- What assumption was wrong?
- What's a simpler version of this problem?
- What approach haven't you tried?
- Can you prove a smaller piece works first?
`;
  }

  if (retryContext.attempts >= 7) {
    section += `
### FINAL ATTEMPTS WARNING
You are running low on retries. Be strategic:
1. Try the SIMPLEST possible version that proves the core concept
2. If that works, build up incrementally
3. If fundamental blockers exist, document them clearly for needs-you.md
`;
  }

  return section;
}

/**
 * Definition of Done section
 */
function buildDoDSection(contract: TaskContract): string {
  const dodList = contract.definition_of_done
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return `## Definition of Done

Complete ALL of the following:

${dodList}

**Verify each item before declaring success.**`;
}

/**
 * Project context section
 */
function buildProjectSection(projectPath: string, contract: TaskContract): string {
  return `## Project Context

**Working Directory:** \`${projectPath}\`
- This is your isolated workspace
- All files you create go here
- Do NOT modify files outside this directory

**Available Tools:** ${contract.scope.tools_allowed.join(', ')}

**Max Turns:** ${contract.max_turns}
- Work efficiently within this limit
- If complex, break into verifiable milestones`;
}

/**
 * Final instructions section
 */
function buildFinalInstructions(): string {
  return `## Execution Guidelines

1. **Start with understanding** - Read existing code before changing it
2. **Make incremental changes** - Test after each change
3. **Commit frequently** - Small, logical commits with clear messages
4. **Verify your work** - Check that changes actually work
5. **Report clearly** - Summarize what you did, what files changed, any issues

### If You Cannot Complete:

1. Document exactly what is blocking you
2. List what you tried and why it failed
3. Specify what human input/action would unblock this
4. This information goes to needs-you.md

### Output Format:

At the end, provide:
- Summary of changes made
- Files modified/created
- What works vs what doesn't
- Any blockers or issues
- Whether Definition of Done is met`;
}

/**
 * Build a minimal prompt for simple tasks (when intent is what_and_how)
 */
export function buildSimplePrompt(
  contract: TaskContract,
  projectPath: string
): string {
  const dodList = contract.definition_of_done
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return `${contract.goal}

## Project Directory
Working in: \`${projectPath}\`
Do NOT modify files outside this directory.

## Definition of Done
${dodList}

## Constraints
- Max turns: ${contract.max_turns}
- Tools: ${contract.scope.tools_allowed.join(', ')}
- Follow existing code patterns
- Test your changes

## Output
Summarize what changed, files modified, and confirm DoD items met.`;
}
