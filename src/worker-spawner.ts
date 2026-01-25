/**
 * Worker Spawner - Core Agent SDK integration
 *
 * Spawns worker agents using the Claude Agent SDK to execute
 * task contracts. This is the bridge between the executive loop
 * and actual AI-powered task execution.
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { TaskContract, WorkerResult } from './types.js';

/**
 * Build the system prompt for a worker agent
 */
function buildWorkerPrompt(contract: TaskContract): string {
  const dodList = contract.definition_of_done
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return `
${contract.goal}

## Definition of Done:
${dodList}

## Scope:
- Repositories: ${contract.scope.repos_allowed.join(', ')}
- Available tools: ${contract.scope.tools_allowed.join(', ')}

## Important:
- Complete the task within ${contract.max_turns} turns
- Report your progress clearly
- If you cannot complete the task, explain why
`.trim();
}

/**
 * Spawn a worker agent to execute a task contract
 *
 * @param contract - The task contract defining what the worker should do
 * @returns WorkerResult with success status, output, and any artifacts/errors
 */
export async function spawnWorker(contract: TaskContract): Promise<WorkerResult> {
  const startTime = Date.now();
  const outputs: string[] = [];
  const artifacts: string[] = [];
  const errors: string[] = [];

  const prompt = buildWorkerPrompt(contract);
  const model = process.env.MODEL || 'claude-sonnet-4-5-20250929';

  try {
    // Query Claude using the Agent SDK
    const stream = query({
      prompt,
      options: {
        model,
        maxTurns: contract.max_turns,
        cwd: process.cwd(),
        allowedTools: contract.scope.tools_allowed,
      },
    });

    // Process the streaming response
    for await (const message of stream) {
      const msg = message as SDKMessage;

      // Handle different message types
      if (msg.type === 'assistant') {
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

    return {
      success,
      output: outputs.join('\n\n'),
      artifacts,
      errors,
      duration_ms: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      output: outputs.join('\n\n'),
      artifacts,
      errors: [`Worker execution failed: ${errorMessage}`],
      duration_ms: duration,
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
