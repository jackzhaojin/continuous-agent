/**
 * Agentic Diagnosis - Uses Agent SDK to investigate and fix failures
 *
 * Instead of escalating to humans after N retries, spawn an agentic diagnostic
 * agent to investigate WHY the task is failing and suggest automatic fixes.
 *
 * Only escalate to human if the diagnostic agent determines it's truly blocked.
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { WorkItem, WorkerResult } from '../../core/types.js';

const AGENT_BASE = process.env.AGENT_PATH || path.join(os.homedir(), 'dev', 'continuous-agent');
const LEDGERS_DIR = path.join(AGENT_BASE, 'ledgers');

interface DiagnosisResult {
  shouldRetry: boolean;
  suggestedFix?: string;
  rootCause?: string;
  escalateToHuman: boolean;
  diagnosis: string;
}

/**
 * Build diagnostic prompt for the agentic diagnostic agent
 */
function buildDiagnosticPrompt(
  item: WorkItem,
  attempts: number,
  lastError: string,
  validationReports: string[],
  workerLogs: string[]
): string {
  return `You are a diagnostic agent investigating why a task is failing repeatedly.

**Task Details:**
- Title: ${item.title}
- Description: ${item.description || 'No description'}
- Current Attempt: ${attempts}/10
- Last Error: ${lastError}

**Your Mission:**
Analyze why this task keeps failing and determine:
1. What is the ROOT CAUSE of the failure?
2. Can this be fixed automatically? If yes, HOW?
3. Should we retry with a different approach?
4. Or is this truly blocked and needs human intervention?

**Available Evidence:**
${validationReports.length > 0 ? `
Validation Reports (last ${Math.min(3, validationReports.length)}):
${validationReports.slice(-3).join('\n\n---\n\n')}
` : ''}

${workerLogs.length > 0 ? `
Worker Logs (last ${Math.min(2, workerLogs.length)} attempts):
${workerLogs.slice(-2).join('\n\n---\n\n')}
` : ''}

**Common Failure Patterns to Check:**
1. **Git Status Clean** - Is the monorepo structure confusing the verifier? Are there uncommitted changes from previous work?
2. **Node Build** - Does the project have a build script? Is it a JavaScript project that doesn't need building?
3. **Missing Dependencies** - Are required npm packages or system tools missing?
4. **API Authentication** - Are API keys or tokens invalid/missing?
5. **Task Complexity** - Is the task too vague or too complex for a single worker session?
6. **Wrong Approach** - Is the worker using the wrong strategy or tools?

**Your Output Format (JSON):**
Respond with ONLY a JSON object (no markdown, no code blocks):
{
  "rootCause": "Brief description of why it's failing",
  "shouldRetry": true/false,
  "suggestedFix": "Specific actionable fix to apply (if shouldRetry=true)",
  "escalateToHuman": true/false,
  "diagnosis": "Detailed explanation for humans if escalating"
}

**Examples:**

Example 1 - Automatic Fix:
{
  "rootCause": "git_status_clean verifier failing because monorepo has uncommitted files from previous work",
  "shouldRetry": true,
  "suggestedFix": "Auto-commit all changes in the monorepo before starting this task. The setup already does this, so this is likely a race condition. Retry immediately.",
  "escalateToHuman": false,
  "diagnosis": ""
}

Example 2 - Different Strategy:
{
  "rootCause": "Worker is trying to build a JavaScript project but package.json has no build script",
  "shouldRetry": true,
  "suggestedFix": "Skip the build step for JavaScript projects. Modify the verifier to check if build is actually needed (TypeScript projects need it, JavaScript projects don't).",
  "escalateToHuman": false,
  "diagnosis": ""
}

Example 3 - Human Needed:
{
  "rootCause": "Notion API returning 401 Unauthorized - API key is invalid",
  "shouldRetry": false,
  "suggestedFix": "",
  "escalateToHuman": true,
  "diagnosis": "The Notion API key appears to be invalid or expired. Worker has tried multiple times with same authentication error. Human needs to provide a valid API key in .env.executive."
}

Analyze the evidence and respond with JSON only.`;
}

/**
 * Spawn an agentic diagnostic agent to investigate task failure
 *
 * @param item - The failing work item
 * @param attempts - Number of attempts so far
 * @param lastError - Last error message
 * @param outputPath - Path to worker's output directory
 * @returns Diagnosis result with suggested fixes
 */
export async function diagnoseFailure(
  item: WorkItem,
  attempts: number,
  lastError: string,
  outputPath?: string
): Promise<DiagnosisResult> {
  console.log(`[Diagnosis] Starting agentic diagnosis for: ${item.title}`);

  try {
    // Gather evidence: validation reports and worker logs
    const validationReports: string[] = [];
    const workerLogs: string[] = [];

    // Find recent validation reports
    const reportsDir = path.join(AGENT_BASE, 'reports', 'validation');
    if (existsSync(reportsDir)) {
      try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(reportsDir);
        const recentReports = files
          .filter(f => f.startsWith('validation-') && f.endsWith('.json'))
          .sort()
          .slice(-3);

        for (const file of recentReports) {
          const content = await readFile(path.join(reportsDir, file), 'utf-8');
          validationReports.push(content);
        }
      } catch (error) {
        console.log(`[Diagnosis] Could not read validation reports: ${error}`);
      }
    }

    // Find recent worker logs
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    for (const date of [today, yesterday]) {
      const dateDir = path.join(LEDGERS_DIR, date);
      if (existsSync(dateDir)) {
        try {
          const { readdir } = await import('fs/promises');
          const files = await readdir(dateDir);
          const workerLogFiles = files
            .filter(f => f.startsWith('worker-') && f.endsWith('.log'))
            .sort()
            .slice(-2);

          for (const file of workerLogFiles) {
            const content = await readFile(path.join(dateDir, file), 'utf-8');
            // Truncate very long logs
            workerLogs.push(content.slice(-10000));
          }
        } catch (error) {
          console.log(`[Diagnosis] Could not read worker logs: ${error}`);
        }
      }
    }

    const prompt = buildDiagnosticPrompt(item, attempts, lastError, validationReports, workerLogs);

    console.log(`[Diagnosis] Spawning diagnostic agent with ${validationReports.length} validation reports and ${workerLogs.length} worker logs`);

    // Spawn diagnostic agent using Agent SDK
    const model = process.env.MODEL || 'claude-sonnet-4-5';
    const stream = query({
      prompt,
      options: {
        model,
        maxTurns: 10, // Diagnostic agent needs few turns
        cwd: AGENT_BASE, // Run in agent base directory
        allowedTools: ['Read', 'Glob', 'Grep'], // Can read files but not modify
      },
    });

    let diagnosis = '';
    for await (const message of stream) {
      const msg = message as SDKMessage;

      if (msg.type === 'assistant') {
        if ('content' in msg && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && 'text' in block) {
              diagnosis += block.text;
            }
          }
        }
      } else if (msg.type === 'result') {
        const resultMsg = msg as SDKResultMessage;
        if (resultMsg.subtype === 'success' && 'result' in resultMsg && resultMsg.result) {
          diagnosis += String(resultMsg.result);
        }
      }
    }

    // Parse JSON response from diagnostic agent
    try {
      // Extract JSON from response (may have markdown or extra text)
      const jsonMatch = diagnosis.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in diagnostic response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      console.log(`[Diagnosis] Result: ${parsed.rootCause}`);
      console.log(`[Diagnosis] Should retry: ${parsed.shouldRetry}`);
      console.log(`[Diagnosis] Escalate to human: ${parsed.escalateToHuman}`);

      return {
        shouldRetry: parsed.shouldRetry || false,
        suggestedFix: parsed.suggestedFix || '',
        rootCause: parsed.rootCause || 'Unknown',
        escalateToHuman: parsed.escalateToHuman || false,
        diagnosis: parsed.diagnosis || parsed.rootCause || 'Unknown failure',
      };
    } catch (parseError) {
      console.error(`[Diagnosis] Failed to parse JSON response: ${parseError}`);
      console.error(`[Diagnosis] Raw response: ${diagnosis.slice(0, 500)}`);

      // Fallback: escalate to human if we can't parse
      return {
        shouldRetry: false,
        suggestedFix: '',
        rootCause: 'Failed to parse diagnostic response',
        escalateToHuman: true,
        diagnosis: `Diagnostic agent failed to provide structured response. Raw output: ${diagnosis.slice(0, 200)}`,
      };
    }
  } catch (error) {
    console.error(`[Diagnosis] Diagnostic agent failed: ${error}`);

    // Fallback: escalate to human if diagnostic fails
    return {
      shouldRetry: false,
      suggestedFix: '',
      rootCause: 'Diagnostic agent failed',
      escalateToHuman: true,
      diagnosis: `Failed to run diagnostic agent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
