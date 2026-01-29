/**
 * Worker Spawner - Core Agent SDK integration
 *
 * Spawns worker agents using the Claude Agent SDK to execute
 * task contracts. This is the bridge between the executive loop
 * and actual AI-powered task execution.
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, existsSync, copyFileSync, createWriteStream } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import type { TaskContract, WorkerResult, WorkItem } from '../../core/types.js';
import { buildIntelligentPrompt, buildSimplePrompt } from '../intelligence/prompt-builder.js';
import { classifyIntent } from '../intelligence/intent-classifier.js';
import { selectStrategy } from '../intelligence/strategy-selector.js';
import { findProjectBySlug } from '../../deterministic/project-registry.js';

// Agent outputs directory - where workers create their projects
const AGENT_OUTPUTS_BASE = process.env.AGENT_OUTPUTS_PATH || path.join(os.homedir(), 'dev', 'agent-outputs');

// Template directory for project setup files (lives in agent repo, not outputs)
const AGENT_BASE = process.env.AGENT_PATH || path.join(os.homedir(), 'dev', 'continuous-agent');
const TEMPLATES_DIR = path.join(AGENT_BASE, 'templates');
const LEDGERS_DIR = path.join(AGENT_BASE, 'ledgers');

/**
 * Create a logger for a specific worker task
 * Logs are organized by date: ledgers/{yyyy-mm-dd}/worker-{task-id}.log
 */
function createWorkerLogger(taskId: string): { log: (msg: string) => void; close: () => void } {
  // Create date-based subdirectory
  const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  const dateDir = path.join(LEDGERS_DIR, today);

  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
  }

  const logFile = path.join(dateDir, `worker-${taskId}.log`);
  const stream = createWriteStream(logFile, { flags: 'a' });

  return {
    log: (msg: string) => {
      const line = `[${new Date().toISOString()}] ${msg}`;
      console.log(`[Worker ${taskId}] ${msg}`);
      stream.write(line + '\n');
    },
    close: () => stream.end(),
  };
}

/**
 * Detect project category from task goal
 */
function detectCategory(goal: string): string {
  const goalLower = goal.toLowerCase();
  if (goalLower.includes('next.js') || goalLower.includes('nextjs')) {
    return 'nextjs';
  } else if (goalLower.includes('react')) {
    return 'react';
  } else if (goalLower.includes('node')) {
    return 'node';
  } else if (goalLower.includes('python')) {
    return 'python';
  }
  return 'misc';
}

/**
 * Generate a project directory path based on task metadata
 * Structure: projects/{category}/{date}/{slug}
 */
function generateProjectPath(contract: TaskContract): { path: string; category: string } {
  const today = new Date().toISOString().split('T')[0]; // 2025-01-25
  const category = detectCategory(contract.goal);
  const slug = contract.id.replace('task-', '');

  return {
    path: path.join(AGENT_OUTPUTS_BASE, 'projects', category, today, slug),
    category,
  };
}

/**
 * Set up project directory with appropriate .gitignore
 * This MUST happen before the worker starts to prevent committing junk
 */
function setupProjectDirectory(projectPath: string, category: string): void {
  // Create directory if needed
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
    console.log(`[Worker] Created project directory: ${projectPath}`);
  }

  // Copy universal .gitignore template (covers all technologies)
  // This ensures Python, Node, etc. are all covered regardless of category
  const gitignoreDest = path.join(projectPath, '.gitignore');
  if (!existsSync(gitignoreDest)) {
    const universalFile = path.join(TEMPLATES_DIR, 'gitignore-universal');
    const fallbackFile = path.join(TEMPLATES_DIR, 'gitignore-misc');

    const sourceFile = existsSync(universalFile) ? universalFile : fallbackFile;

    if (existsSync(sourceFile)) {
      copyFileSync(sourceFile, gitignoreDest);
      console.log(`[Worker] Created .gitignore from universal template`);
    } else {
      console.log(`[Worker] Warning: No .gitignore template found for ${category}`);
    }
  }

  // Copy .env file with API keys to project directory
  const envSource = path.join(AGENT_BASE, '.env');
  const envDest = path.join(projectPath, '.env');
  if (existsSync(envSource) && !existsSync(envDest)) {
    copyFileSync(envSource, envDest);
    console.log(`[Worker] Copied .env with API keys to project`);
  }

  // CRITICAL: Ensure git is clean before starting new work
  // This prevents verifier failures due to uncommitted changes from previous work
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();

    const gitStatus = execSync('git status --porcelain', {
      cwd: gitRoot,
      encoding: 'utf-8'
    }).trim();

    if (gitStatus) {
      console.log(`[Worker] Auto-committing existing work in ${gitRoot} before starting new task...`);
      execSync('git add -A', { cwd: gitRoot, stdio: 'inherit' });
      execSync(`git commit -m "Auto-commit: Clean workspace before new task\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"`, {
        cwd: gitRoot,
        stdio: 'inherit'
      });
      console.log(`[Worker] Git workspace is now clean`);
    }
  } catch (error) {
    console.log(`[Worker] Warning: Could not auto-commit git changes: ${error}`);
  }
}

/**
 * Copy source project files into the new project directory (V1.2)
 * Uses rsync to efficiently copy, excluding .git, node_modules, .env
 */
function copySourceProject(sourcePath: string, targetPath: string): boolean {
  try {
    if (!existsSync(sourcePath)) {
      console.log(`[Worker] Source project not found: ${sourcePath}`);
      return false;
    }

    // Ensure target exists
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }

    // Use rsync to copy files, excluding build artifacts and secrets
    execSync(
      `rsync -a --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='dist' --exclude='.next' --exclude='__pycache__' "${sourcePath}/" "${targetPath}/"`,
      { stdio: 'pipe' }
    );

    console.log(`[Worker] Copied source project from ${sourcePath} to ${targetPath}`);
    return true;
  } catch (error) {
    console.log(`[Worker] Warning: Failed to copy source project: ${error}`);
    return false;
  }
}

/**
 * Retry context for intelligent prompts
 */
export interface WorkerRetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
  existingProjectPath?: string; // Reuse same project path across retries
}

/**
 * Build prompt for self-enhancement tasks
 * Instructs the worker to delegate to the self-enhancer subagent
 * Handles both new tasks and resuming existing work on a branch
 */
function buildSelfEnhancePrompt(contract: TaskContract, workItem: WorkItem): string {
  // Use existing branch if tracked, otherwise generate new one
  const isResume = !!workItem.branch;
  const branchName = workItem.branch || `self-enhance/${contract.id.replace('task-', '')}`;

  const resumeInstructions = isResume
    ? `## RESUMING EXISTING WORK

**This task has already started.** A branch exists: \`${branchName}\`

The self-enhancer MUST:
1. Check out the existing branch: \`git checkout ${branchName}\`
2. Review what work has already been done (check git log, current files)
3. Continue from where the previous work left off
4. Do NOT create a new branch - continue on the existing one

`
    : `## STARTING NEW WORK

This is a new self-enhancement task. The self-enhancer will:
1. Create branch: \`${branchName}\`
2. Make the required changes
3. Run typecheck and build validation
4. Commit changes with clear message
5. Report back for human review

`;

  return `# Self-Enhancement Task: ${workItem.title}

You are executing a **self-enhancement task** - modifying the continuous-agent system itself.

## Task Details
- **Priority:** ${workItem.priority}
- **Contract:** ${contract.id}
- **Branch:** ${branchName}
- **Status:** ${isResume ? 'RESUMING existing work' : 'NEW task'}

## Description
${workItem.description || 'No description provided'}

## Definition of Done
${contract.definition_of_done.map((item, i) => `${i + 1}. ${item}`).join('\n')}

${resumeInstructions}
## Instructions

**Use the self-enhancer subagent to complete this task.**

Delegate to the self-enhancer agent using the Task tool:
\`\`\`
Use the self-enhancer subagent to: ${workItem.title}

Branch: ${branchName}
Resume: ${isResume ? 'YES - continue existing work' : 'NO - start fresh'}

${workItem.description || ''}
\`\`\`

## CRITICAL REMINDERS
- The self-enhancer works in the agent codebase (continuous-agent)
- It CANNOT modify workspace/constitution.md
- All changes must pass typecheck and build
- Changes are staged on a branch for human review before merge
${isResume ? '- This is RESUMING work - check the existing branch first!' : '- This is NEW work - create the branch first'}

## Output
Report the self-enhancer's results:
- Branch name: ${branchName}
- Summary of changes
- Validation status (typecheck/build)
- Any issues or concerns
`;
}

/**
 * Build the system prompt for a worker agent
 * Now uses intelligent prompt builder with research phase and strategy context
 */
async function buildWorkerPrompt(
  contract: TaskContract,
  projectPath: string,
  workItem?: WorkItem,
  retryContext?: WorkerRetryContext
): Promise<string> {
  // If we have full context, use intelligent prompt
  if (workItem) {
    const intent = await classifyIntent(workItem);

    // For simple, well-specified tasks, use simple prompt
    if (intent.type === 'what_and_how' && !retryContext?.attempts) {
      return await buildSimplePrompt(contract, projectPath);
    }

    // For complex/vague tasks or retries, use intelligent prompt
    return await buildIntelligentPrompt(contract, workItem, projectPath, retryContext);
  }

  // Fallback to simple prompt if no work item context
  return await buildSimplePrompt(contract, projectPath);
}

/**
 * Spawn a worker agent to execute a task contract
 *
 * @param contract - The task contract defining what the worker should do
 * @param workItem - Optional work item for intelligent prompt building
 * @param retryContext - Optional retry context for strategy selection
 * @returns WorkerResult with success status, output, and any artifacts/errors
 */
export async function spawnWorker(
  contract: TaskContract,
  workItem?: WorkItem,
  retryContext?: WorkerRetryContext
): Promise<WorkerResult> {
  const startTime = Date.now();
  const outputs: string[] = [];
  const artifacts: string[] = [];
  const errors: string[] = [];

  // Create logger for this worker
  const logger = createWorkerLogger(contract.id);

  // Check if this is a self-enhancement task
  const isSelfEnhance = workItem?.selfEnhance === true;

  // DEBUG: Log what we receive
  console.log(`[Worker] DEBUG: retryContext received:`, retryContext ? JSON.stringify(retryContext) : 'undefined');
  console.log(`[Worker] DEBUG: selfEnhance:`, isSelfEnhance);

  // For retries, reuse existing project path to continue work on same project
  // For first attempt, generate new project path
  // EXCEPTION: Self-enhancement tasks always use AGENT_BASE
  let projectPath: string;
  let category: string;

  if (isSelfEnhance) {
    // Self-enhancement: work in the agent codebase itself
    projectPath = AGENT_BASE;
    category = 'self-enhance';
    logger.log(`SELF-ENHANCE: Working in agent codebase: ${projectPath}`);
    console.log(`[Worker] SELF-ENHANCE: Working in agent codebase: ${projectPath}`);
  } else if (retryContext?.existingProjectPath) {
    projectPath = retryContext.existingProjectPath;
    category = detectCategory(contract.goal);
    logger.log(`RESUME: Using existing project path: ${projectPath}`);
    console.log(`[Worker] RESUME: Using existing project path: ${projectPath}`);
  } else {
    console.log(`[Worker] NEW: Generating new project path`);
    // Generate project path and set up directory with .gitignore FIRST
    const generated = generateProjectPath(contract);
    projectPath = generated.path;
    category = generated.category;
    setupProjectDirectory(projectPath, category);

    // V1.2: Copy-in from source project if specified
    if (workItem?.source_project) {
      const sourceEntry = findProjectBySlug(workItem.source_project);
      if (sourceEntry) {
        logger.log(`COPY-IN: Copying from source project "${sourceEntry.slug}" at ${sourceEntry.output_path}`);
        const copied = copySourceProject(sourceEntry.output_path, projectPath);
        if (copied) {
          logger.log(`COPY-IN: Source project copied successfully`);
        } else {
          logger.log(`COPY-IN: Warning - source project copy failed, starting fresh`);
        }
      } else {
        logger.log(`COPY-IN: Source project "${workItem.source_project}" not found in registry`);
      }
    }
  }

  // Build prompt - use self-enhancement prompt for self-enhance tasks
  let prompt: string;
  if (isSelfEnhance && workItem) {
    prompt = buildSelfEnhancePrompt(contract, workItem);
  } else {
    prompt = await buildWorkerPrompt(contract, projectPath, workItem, retryContext);
  }

  // Track which strategy we're using if retrying
  if (retryContext && workItem) {
    const strategySelection = selectStrategy(workItem, retryContext.triedStrategies);
    if (strategySelection) {
      logger.log(`Strategy: ${strategySelection.strategy.name} (${strategySelection.strategy.id})`);
    }
  }
  const model = process.env.MODEL || 'claude-sonnet-4-5';

  // Determine allowed tools - add Task for self-enhancement (before logging)
  const allowedTools = [...contract.scope.tools_allowed];
  if (isSelfEnhance && !allowedTools.includes('Task')) {
    allowedTools.push('Task');
  }

  // Log worker start with full context
  logger.log(`=== WORKER START ===`);
  logger.log(`Task ID: ${contract.id}`);
  logger.log(`Project Path: ${projectPath}`);
  logger.log(`Category: ${category}`);
  logger.log(`Model: ${model}`);
  logger.log(`Max Turns: ${contract.max_turns}`);
  logger.log(`Tools: ${allowedTools.join(', ')}`);
  logger.log(`--- PROMPT ---`);
  logger.log(prompt);
  logger.log(`--- END PROMPT ---`);

  try {

    // Query Claude using the Agent SDK with project directory as cwd
    // CRITICAL: settingSources enables skill/agent loading from user + project
    const stream = query({
      prompt,
      options: {
        model,
        maxTurns: contract.max_turns,
        cwd: projectPath,  // Self-enhance uses AGENT_BASE, regular uses agent-outputs
        allowedTools: allowedTools,
        settingSources: ['user', 'project'] as const,  // REQUIRED for skills and agents
      },
    });

    // Process the streaming response
    let turnCount = 0;
    for await (const message of stream) {
      const msg = message as SDKMessage;

      // Log all messages for traceability
      logger.log(`[MSG] type=${msg.type} ${JSON.stringify(msg).slice(0, 500)}`);

      // Handle different message types
      if (msg.type === 'assistant') {
        turnCount++;
        logger.log(`[TURN ${turnCount}] Assistant response`);
        // Extract text content from assistant messages
        if ('content' in msg && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && 'text' in block) {
              outputs.push(block.text);
            }
          }
        }
      } else if (msg.type === 'result') {
        // Handle final result message
        const resultMsg = msg as SDKResultMessage;

        if (resultMsg.subtype === 'success') {
          // Collect the final result
          if ('result' in resultMsg && resultMsg.result) {
            outputs.push(String(resultMsg.result));
          }
        } else {
          // Handle error results
          errors.push(`Worker failed with: ${resultMsg.subtype}`);

          if ('errors' in resultMsg && Array.isArray(resultMsg.errors)) {
            errors.push(...resultMsg.errors.map(String));
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const success = errors.length === 0;

    // Log completion
    logger.log(`=== WORKER COMPLETE ===`);
    logger.log(`Success: ${success}`);
    logger.log(`Duration: ${duration}ms`);
    logger.log(`Turns: ${turnCount}`);
    if (errors.length > 0) {
      logger.log(`Errors: ${errors.join(', ')}`);
    }
    logger.close();

    return {
      success,
      output: outputs.join('\n\n'),
      artifacts,
      errors,
      duration_ms: duration,
      output_path: projectPath,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';

    // Log error with full stack trace
    logger.log(`=== WORKER FAILED ===`);
    logger.log(`Error: ${errorMessage}`);
    logger.log(`Stack: ${stack}`);
    logger.log(`Duration: ${duration}ms`);
    logger.close();

    return {
      success: false,
      output: outputs.join('\n\n'),
      artifacts,
      errors: [`Worker execution failed: ${errorMessage}`],
      duration_ms: duration,
      output_path: projectPath,
    };
  }
}

/**
 * Validate that authentication is configured for the Agent SDK
 */
export function validateAuth(): { valid: boolean; method: string | null; error: string | null } {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (oauthToken) {
    return { valid: true, method: 'OAuth Token', error: null };
  }

  if (apiKey) {
    return { valid: true, method: 'API Key', error: null };
  }

  return {
    valid: false,
    method: null,
    error: 'No authentication credentials found. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.',
  };
}
