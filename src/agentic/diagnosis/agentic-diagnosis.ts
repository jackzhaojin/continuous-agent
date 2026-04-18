/**
 * Agentic Diagnosis - Uses Agent SDK to investigate and fix failures
 *
 * Instead of escalating to humans after N retries, spawn an agentic diagnostic
 * agent to investigate WHY the task is failing and suggest automatic fixes.
 *
 * Only escalate to human if the diagnostic agent determines it's truly blocked.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { WorkItem, WorkerResult } from '../../core/types.js';
import { getChatCompletionProvider, resolveChatModel } from '../../core/vendor/index.js';
import { loadSkillPrompt } from '../intelligence/skill-prompt-loader.js';

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
async function buildDiagnosticPrompt(
  item: WorkItem,
  attempts: number,
  lastError: string,
  validationReports: string[],
  workerLogs: string[]
): Promise<string> {
  const validationSection = validationReports.length > 0
    ? `Validation Reports (last ${Math.min(3, validationReports.length)}):\n${validationReports.slice(-3).join('\n\n---\n\n')}`
    : '(no validation reports)';

  const logsSection = workerLogs.length > 0
    ? `Worker Logs (last ${Math.min(2, workerLogs.length)} attempts):\n${workerLogs.slice(-2).join('\n\n---\n\n')}`
    : '(no worker logs)';

  return loadSkillPrompt('failure-diagnosis', {
    TASK_TITLE: item.title,
    TASK_DESCRIPTION: item.description || 'No description',
    ATTEMPTS: String(attempts),
    LAST_ERROR: lastError,
    VALIDATION_REPORTS: validationSection,
    WORKER_LOGS: logsSection,
  }, {
    usageContext: 'phase-7/failure-diagnosis',
  });
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

    const prompt = await buildDiagnosticPrompt(item, attempts, lastError, validationReports, workerLogs);

    console.log(`[Diagnosis] Spawning diagnostic agent with ${validationReports.length} validation reports and ${workerLogs.length} worker logs`);

    // Spawn diagnostic agent via configured chat vendor
    // Evidence is already gathered and embedded in the prompt, so a single-turn
    // chat completion is sufficient (no tool use needed).
    const model = resolveChatModel();
    const chatProvider = getChatCompletionProvider();

    console.log(`[Diagnosis] Using ${chatProvider.vendorName} with model ${model}`);

    const result = await chatProvider.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    const diagnosis = result.text;

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
