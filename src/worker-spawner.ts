/**
 * Worker Spawner - Core Agent SDK integration
 *
 * Spawns worker agents using the Claude Agent SDK to execute
 * task contracts. This is the bridge between the executive loop
 * and actual AI-powered task execution.
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, existsSync, copyFileSync, createWriteStream } from 'fs';
import os from 'os';
import path from 'path';
import type { TaskContract, WorkerResult, WorkItem } from './types.js';
import { buildIntelligentPrompt, buildSimplePrompt } from './intelligence/prompt-builder.js';
import { classifyIntent } from './intelligence/intent-classifier.js';
import { selectStrategy } from './intelligence/strategy-selector.js';

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

  // Copy appropriate .gitignore template
  const gitignoreDest = path.join(projectPath, '.gitignore');
  if (!existsSync(gitignoreDest)) {
    const templateFile = path.join(TEMPLATES_DIR, `gitignore-${category}`);
    const fallbackFile = path.join(TEMPLATES_DIR, 'gitignore-misc');

    const sourceFile = existsSync(templateFile) ? templateFile : fallbackFile;

    if (existsSync(sourceFile)) {
      copyFileSync(sourceFile, gitignoreDest);
      console.log(`[Worker] Created .gitignore from ${category} template`);
    } else {
      console.log(`[Worker] Warning: No .gitignore template found for ${category}`);
    }
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
 * Build the system prompt for a worker agent
 * Now uses intelligent prompt builder with research phase and strategy context
 */
function buildWorkerPrompt(
  contract: TaskContract,
  projectPath: string,
  workItem?: WorkItem,
  retryContext?: WorkerRetryContext
): string {
  // If we have full context, use intelligent prompt
  if (workItem) {
    const intent = classifyIntent(workItem);

    // For simple, well-specified tasks, use simple prompt
    if (intent.type === 'what_and_how' && !retryContext?.attempts) {
      return buildSimplePrompt(contract, projectPath);
    }

    // For complex/vague tasks or retries, use intelligent prompt
    return buildIntelligentPrompt(contract, workItem, projectPath, retryContext);
  }

  // Fallback to simple prompt if no work item context
  return buildSimplePrompt(contract, projectPath);
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

  // For retries, reuse existing project path to continue work on same project
  // For first attempt, generate new project path
  let projectPath: string;
  let category: string;

  if (retryContext?.existingProjectPath) {
    projectPath = retryContext.existingProjectPath;
    category = detectCategory(contract.goal);
    logger.log(`RETRY: Reusing existing project path: ${projectPath}`);
  } else {
    // Generate project path and set up directory with .gitignore FIRST
    const generated = generateProjectPath(contract);
    projectPath = generated.path;
    category = generated.category;
    setupProjectDirectory(projectPath, category);
  }

  const prompt = buildWorkerPrompt(contract, projectPath, workItem, retryContext);

  // Track which strategy we're using if retrying
  if (retryContext && workItem) {
    const strategySelection = selectStrategy(workItem, retryContext.triedStrategies);
    if (strategySelection) {
      logger.log(`Strategy: ${strategySelection.strategy.name} (${strategySelection.strategy.id})`);
    }
  }
  const model = process.env.MODEL || 'claude-sonnet-4-5-20250929';

  // Log worker start with full context
  logger.log(`=== WORKER START ===`);
  logger.log(`Task ID: ${contract.id}`);
  logger.log(`Project Path: ${projectPath}`);
  logger.log(`Category: ${category}`);
  logger.log(`Model: ${model}`);
  logger.log(`Max Turns: ${contract.max_turns}`);
  logger.log(`Tools: ${contract.scope.tools_allowed.join(', ')}`);
  logger.log(`--- PROMPT ---`);
  logger.log(prompt);
  logger.log(`--- END PROMPT ---`);

  try {
    // Query Claude using the Agent SDK with project directory as cwd
    // CRITICAL: settingSources enables skill loading from user + project
    const stream = query({
      prompt,
      options: {
        model,
        maxTurns: contract.max_turns,
        cwd: projectPath,  // Worker operates in isolated project directory
        allowedTools: contract.scope.tools_allowed,
        settingSources: ['user', 'project'] as const,  // REQUIRED for skills
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
