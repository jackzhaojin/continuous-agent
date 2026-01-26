/**
 * Strategy Selector - Chooses different approaches for task execution
 *
 * Per PRD: "Retries must change strategy — same approach twice = wasted"
 *
 * Each retry should use a DIFFERENT strategy to attack the problem.
 */

import type { WorkItem } from '../types.js';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  approach: string;
  when_to_use: string;
  priority: number; // Lower = try first
}

export interface StrategySelection {
  strategy: Strategy;
  context: string;
  previous_attempts: number;
  remaining_strategies: number;
}

/**
 * Strategy bank - different approaches to common problems
 */
const STRATEGIES: Record<string, Strategy[]> = {
  // Next.js / React app building
  'nextjs': [
    {
      id: 'nextjs-scaffold-first',
      name: 'Scaffold First',
      description: 'Start with create-next-app, then customize',
      approach: `1. Use npx create-next-app@latest with recommended options
2. Verify the scaffold builds and runs
3. Make incremental changes, testing after each
4. Commit frequently`,
      when_to_use: 'Default for new Next.js projects',
      priority: 1,
    },
    {
      id: 'nextjs-minimal',
      name: 'Minimal Manual',
      description: 'Create minimal structure by hand',
      approach: `1. Create package.json with only essential deps
2. Create minimal next.config.js
3. Create one page to prove it works
4. Build up from there`,
      when_to_use: 'When scaffold is failing or too heavy',
      priority: 2,
    },
    {
      id: 'nextjs-copy-pattern',
      name: 'Copy from Working Example',
      description: 'Find and adapt a working example',
      approach: `1. Search for similar working Next.js projects
2. Identify the key patterns/files needed
3. Adapt the pattern to this project
4. Test incrementally`,
      when_to_use: 'When standard approaches keep failing',
      priority: 3,
    },
    {
      id: 'nextjs-decompose',
      name: 'Decompose Problem',
      description: 'Break into smallest possible steps',
      approach: `1. Identify the SINGLE smallest thing that would show progress
2. Do ONLY that thing
3. Verify it works
4. Repeat with next smallest thing`,
      when_to_use: 'When complex builds keep failing',
      priority: 4,
    },
  ],

  // General coding tasks
  'general': [
    {
      id: 'general-understand-first',
      name: 'Understand First',
      description: 'Read and understand before changing',
      approach: `1. Read all relevant files thoroughly
2. Understand the current patterns and conventions
3. Plan changes that fit the existing style
4. Make minimal, focused changes`,
      when_to_use: 'Default for modifying existing code',
      priority: 1,
    },
    {
      id: 'general-test-driven',
      name: 'Test Driven',
      description: 'Write test first, then implement',
      approach: `1. Write a failing test for the desired behavior
2. Implement just enough to make test pass
3. Refactor if needed
4. Add more tests as needed`,
      when_to_use: 'When behavior is well-defined',
      priority: 2,
    },
    {
      id: 'general-spike-then-refine',
      name: 'Spike Then Refine',
      description: 'Quick prototype first, then clean up',
      approach: `1. Write quick-and-dirty implementation to prove it works
2. Verify the approach is viable
3. Refactor to production quality
4. Add tests and documentation`,
      when_to_use: 'When uncertain about approach',
      priority: 3,
    },
    {
      id: 'general-simplify',
      name: 'Simplify Scope',
      description: 'Reduce scope to minimum viable',
      approach: `1. Identify the CORE requirement (strip all nice-to-haves)
2. Implement only that core
3. Verify it works
4. Only then consider additions`,
      when_to_use: 'When scope seems too large',
      priority: 4,
    },
  ],

  // Research/POC tasks
  'research': [
    {
      id: 'research-docs-first',
      name: 'Official Docs First',
      description: 'Start with official documentation',
      approach: `1. Find and read official documentation
2. Follow the getting started guide exactly
3. Note any differences from docs
4. Adapt as needed`,
      when_to_use: 'Default for learning new tools',
      priority: 1,
    },
    {
      id: 'research-examples',
      name: 'Find Working Examples',
      description: 'Search for real-world examples',
      approach: `1. Search for example projects/repos
2. Find one that's similar to our goal
3. Study how it works
4. Adapt patterns to our needs`,
      when_to_use: 'When docs are unclear',
      priority: 2,
    },
    {
      id: 'research-experiment',
      name: 'Rapid Experiments',
      description: 'Try multiple small experiments quickly',
      approach: `1. Create minimal test cases
2. Try different approaches in isolation
3. Document what works and what doesn't
4. Synthesize findings`,
      when_to_use: 'When exploring unknown territory',
      priority: 3,
    },
  ],

  // Integration tasks
  'integration': [
    {
      id: 'integration-mock-first',
      name: 'Mock First',
      description: 'Mock external services, verify flow',
      approach: `1. Create mock responses for external services
2. Build integration logic against mocks
3. Verify flow works end-to-end
4. Replace mocks with real calls`,
      when_to_use: 'When integrating external APIs',
      priority: 1,
    },
    {
      id: 'integration-minimal-call',
      name: 'Minimal API Call',
      description: 'Make simplest possible real call first',
      approach: `1. Make the simplest possible API call (e.g., health check)
2. Verify authentication works
3. Build up to more complex calls
4. Handle errors properly`,
      when_to_use: 'When auth/connectivity is the question',
      priority: 2,
    },
  ],
};

/**
 * Detect the category of a work item
 */
function detectCategory(item: WorkItem): string {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  if (text.includes('next') || text.includes('react')) {
    return 'nextjs';
  }
  if (text.includes('research') || text.includes('poc') || text.includes('explore')) {
    return 'research';
  }
  if (text.includes('integration') || text.includes('api') || text.includes('connect')) {
    return 'integration';
  }
  return 'general';
}

/**
 * Get all strategies for a category, sorted by priority
 */
function getStrategiesForCategory(category: string): Strategy[] {
  const categoryStrategies = STRATEGIES[category] || [];
  const generalStrategies = STRATEGIES['general'] || [];

  // Combine category-specific with general, avoiding duplicates
  const combined = [...categoryStrategies];
  for (const gs of generalStrategies) {
    if (!combined.find(s => s.id === gs.id)) {
      combined.push({ ...gs, priority: gs.priority + 10 }); // Lower priority than category-specific
    }
  }

  return combined.sort((a, b) => a.priority - b.priority);
}

/**
 * Select the next strategy to try based on previous attempts
 *
 * @param item - The work item
 * @param triedStrategies - List of strategy IDs already tried
 * @returns The next strategy to try, or null if all exhausted
 */
export function selectStrategy(
  item: WorkItem,
  triedStrategies: string[] = []
): StrategySelection | null {
  const category = detectCategory(item);
  const strategies = getStrategiesForCategory(category);

  // Find first untried strategy
  const untried = strategies.filter(s => !triedStrategies.includes(s.id));

  if (untried.length === 0) {
    return null; // All strategies exhausted
  }

  const strategy = untried[0];

  return {
    strategy,
    context: `Category: ${category}. This is strategy ${triedStrategies.length + 1} of ${strategies.length}.`,
    previous_attempts: triedStrategies.length,
    remaining_strategies: untried.length - 1,
  };
}

/**
 * Get strategy guidance text for the worker prompt
 */
export function getStrategyGuidance(
  item: WorkItem,
  triedStrategies: string[] = [],
  lastError?: string
): string {
  const selection = selectStrategy(item, triedStrategies);

  if (!selection) {
    return `
## STRATEGY EXHAUSTED
All ${triedStrategies.length} strategies have been tried without success.
This task should be marked as BLOCKED with a clear explanation of what was tried.
`;
  }

  const { strategy, previous_attempts, remaining_strategies } = selection;

  let guidance = `
## STRATEGY: ${strategy.name}

${strategy.description}

### Approach:
${strategy.approach}

### Context:
- Attempt: ${previous_attempts + 1}
- Remaining strategies if this fails: ${remaining_strategies}
`;

  if (previous_attempts > 0 && lastError) {
    guidance += `
### Previous Failure:
The last attempt failed with: ${lastError.slice(0, 200)}

**IMPORTANT:** This attempt must use a DIFFERENT approach. Do not repeat the same mistakes.
`;
  }

  if (previous_attempts >= 5) {
    guidance += `
### PERSISTENCE REMINDER:
You have tried ${previous_attempts} times. AI is smart. Think harder about:
- What is fundamentally different you can try?
- Is there a simpler version of this problem?
- Can you break it into smaller pieces?
- Is there an assumption you're making that's wrong?
`;
  }

  return guidance;
}

/**
 * Record a strategy attempt (for tracking)
 */
export function recordStrategyAttempt(
  itemTitle: string,
  strategyId: string,
  success: boolean,
  notes?: string
): { strategyId: string; success: boolean; timestamp: string; notes?: string } {
  return {
    strategyId,
    success,
    timestamp: new Date().toISOString(),
    notes,
  };
}
