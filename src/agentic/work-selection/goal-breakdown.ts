/**
 * Task Breakdown - Automatic breakdown of complex tasks into steps
 *
 * Transforms large, complex tasks (>100 estimated turns) into
 * manageable steps that can be executed incrementally.
 */

import path from 'path';
import type { WorkItem, WorkStep } from '../../core/types.js';
import { createStepsFile, writeStepsJson, stepsJsonExists } from '../../deterministic/steps-json-handler.js';
import { logBreakdownProgress } from '../../deterministic/progress-log-writer.js';

// Configuration from environment
const BREAKDOWN_THRESHOLD_TURNS = parseInt(process.env.BREAKDOWN_THRESHOLD_TURNS || '100', 10);
const AUTO_BREAKDOWN_ENABLED = process.env.AUTO_BREAKDOWN_ENABLED !== 'false';
const STEP_MIN_TURNS = parseInt(process.env.STEP_MIN_TURNS || '100', 10);
const STEP_TARGET_TURNS = parseInt(process.env.STEP_TARGET_TURNS || '100', 10);
const STEP_MAX_TURNS = parseInt(process.env.STEP_MAX_TURNS || '150', 10);
const MAX_RE_BREAKDOWN_COUNT = 2; // Maximum re-breakdowns per step

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
 * Generate a static breakdown based on task type and complexity
 * This is a fallback when no AI breakdown is available
 */
export function generateStaticBreakdown(item: WorkItem): WorkStep[] {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  const steps: WorkStep[] = [];
  let stepNum = 0;

  // Determine project type
  const isNextJs = text.includes('next') || text.includes('nextjs');
  const isApi = text.includes('api') || text.includes('endpoint');
  const isFullStack = text.includes('full') && text.includes('stack');
  const hasAuth = text.includes('auth') || text.includes('login');
  const hasDb = text.includes('database') || text.includes('schema') || text.includes('model');
  const hasDeploy = text.includes('deploy') || text.includes('production');

  // Step 1: Research & Planning (always included for complex tasks)
  steps.push({
    step_number: stepNum++,
    title: 'Research existing patterns and plan approach',
    description: `Analyze requirements for "${item.title}". Research best practices, existing patterns, and create a technical plan.`,
    status: 'pending',
    dependencies: [],
    estimated_turns: 80,
  });

  // Step 2: Project Setup
  if (isNextJs || isFullStack) {
    steps.push({
      step_number: stepNum++,
      title: 'Initialize project with Next.js and TypeScript',
      description: 'Set up Next.js project with TypeScript, configure ESLint, set up folder structure.',
      status: 'pending',
      dependencies: [0],
      estimated_turns: 100,
    });
  } else {
    steps.push({
      step_number: stepNum++,
      title: 'Initialize project structure',
      description: 'Set up project with appropriate tooling and folder structure.',
      status: 'pending',
      dependencies: [0],
      estimated_turns: 80,
    });
  }

  // Step 3: Database/Schema (if needed)
  if (hasDb || isFullStack) {
    steps.push({
      step_number: stepNum++,
      title: 'Design and implement database schema',
      description: 'Create database models, migrations, and seed data. Set up ORM if needed.',
      status: 'pending',
      dependencies: [1],
      estimated_turns: 110,
    });
  }

  // Step 4: Authentication (if needed)
  if (hasAuth) {
    steps.push({
      step_number: stepNum++,
      title: 'Implement authentication system',
      description: 'Set up user authentication with JWT or session-based auth. Create login/logout/register flows.',
      status: 'pending',
      dependencies: hasDb ? [stepNum - 2] : [1],
      estimated_turns: 120,
    });
  }

  // Step 5: Core API/Logic
  if (isApi || isFullStack) {
    steps.push({
      step_number: stepNum++,
      title: 'Build core API endpoints',
      description: 'Implement main API routes with CRUD operations. Add validation and error handling.',
      status: 'pending',
      dependencies: [stepNum - 2],
      estimated_turns: 130,
    });
  }

  // Step 6: UI Components (for full-stack)
  if (isNextJs || isFullStack) {
    steps.push({
      step_number: stepNum++,
      title: 'Create UI components and pages',
      description: 'Build React components for the user interface. Create main pages and navigation.',
      status: 'pending',
      dependencies: [stepNum - 2],
      estimated_turns: 140,
    });
  }

  // Step 7: Integration
  steps.push({
    step_number: stepNum++,
    title: 'Integration and feature completion',
    description: 'Connect all components, ensure data flow works end-to-end. Add any missing features.',
    status: 'pending',
    dependencies: [stepNum - 2],
    estimated_turns: 100,
  });

  // Step 8: Testing
  steps.push({
    step_number: stepNum++,
    title: 'Testing and quality assurance',
    description: 'Write unit tests, integration tests. Fix bugs and edge cases.',
    status: 'pending',
    dependencies: [stepNum - 2],
    estimated_turns: 100,
  });

  // Step 9: Deployment (if needed)
  if (hasDeploy) {
    steps.push({
      step_number: stepNum++,
      title: 'Deployment and documentation',
      description: 'Set up deployment pipeline, deploy to production. Write documentation.',
      status: 'pending',
      dependencies: [stepNum - 2],
      estimated_turns: 90,
    });
  }

  return steps;
}

/**
 * Create sub-steps when a step fails (exit code 1)
 * Used for automatic re-breakdown of complex steps
 */
export function reBreakdownStep(
  parentStep: WorkStep,
  failureContext: {
    error?: string;
    turnsUsed: number;
    lastActions?: string;
  }
): WorkStep[] {
  const subSteps: WorkStep[] = [];
  const baseStepNum = parentStep.step_number;

  // Check if we've hit the re-breakdown limit
  const currentReBreakdownCount = parentStep.re_breakdown_count || 0;
  if (currentReBreakdownCount >= MAX_RE_BREAKDOWN_COUNT) {
    // Return empty - caller should mark as blocked
    return [];
  }

  // Generic sub-step breakdown for any complex step
  const subStepSuffix = ['a', 'b', 'c', 'd', 'e'];
  
  // Always start with research for failed step
  subSteps.push({
    step_number: baseStepNum, // Will be 4a, 4b, etc. in display
    title: `Research and plan: ${parentStep.title}`,
    description: `Analyze why the original step failed. Research alternative approaches. Create detailed plan.`,
    status: 'pending',
    dependencies: parentStep.dependencies,
    estimated_turns: 60,
    re_breakdown_count: currentReBreakdownCount + 1,
  });

  // Split the work into smaller chunks
  subSteps.push({
    step_number: baseStepNum,
    title: `Implement core: ${parentStep.title}`,
    description: `Implement the core functionality with minimal scope.`,
    status: 'pending',
    dependencies: [baseStepNum],
    estimated_turns: 80,
    re_breakdown_count: currentReBreakdownCount + 1,
  });

  subSteps.push({
    step_number: baseStepNum,
    title: `Complete and validate: ${parentStep.title}`,
    description: `Complete remaining work and validate the implementation.`,
    status: 'pending',
    dependencies: [baseStepNum],
    estimated_turns: 70,
    re_breakdown_count: currentReBreakdownCount + 1,
  });

  return subSteps;
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
  taskId: string,
  taskTitle: string,
  stepsCreated: number,
  trigger: 'auto' | 're-breakdown'
): Promise<void> {
  const { appendFile } = await import('fs/promises');
  const ledgerPath = path.join(process.cwd(), 'ledgers', 'work-ledger.jsonl');
  
  const entry = JSON.stringify({
    event: 'GOAL_BREAKDOWN',
    ts: new Date().toISOString(),
    goal_id: taskId,
    goal_title: taskTitle,
    steps_created: stepsCreated,
    trigger: trigger,
  });

  await appendFile(ledgerPath, entry + '\n', 'utf-8');
}
