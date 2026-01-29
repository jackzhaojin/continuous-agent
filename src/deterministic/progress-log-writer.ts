/**
 * Progress Log Writer - DETERMINISTIC
 *
 * Append-only writer for PROGRESS_LOG.md files inside goal bundles.
 * Never edited, never truncated — survives any file operation.
 *
 * Format:
 * ## {ISO timestamp} | {Event Type}
 * **{Title}** (step-id)
 * Contract: {contract-id}
 */

import { appendFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { log } from '../core/logging.js';

const PROGRESS_LOG_FILENAME = 'PROGRESS_LOG.md';

type ProgressEventType =
  | 'Breakdown'
  | 'Step Started'
  | 'Step Complete'
  | 'Step Blocked'
  | 'Task Complete'
  | 'Task Blocked'
  | 'Output Path Set';

interface ProgressEntry {
  eventType: ProgressEventType;
  stepId?: string;
  stepNumber?: number;     // 1-based for display
  totalSteps?: number;
  title?: string;
  contractId?: string;
  outputPath?: string;
  details?: string;        // Freeform extra info
}

/**
 * Append a progress entry to PROGRESS_LOG.md in the bundle directory.
 * Creates the file with a header if it doesn't exist yet.
 */
export async function appendProgressEntry(
  bundlePath: string,
  entry: ProgressEntry
): Promise<boolean> {
  const filePath = path.join(bundlePath, PROGRESS_LOG_FILENAME);
  const now = new Date().toISOString();

  try {
    // Create file with header if it doesn't exist
    if (!existsSync(filePath)) {
      await writeFile(filePath, '# Progress Log\n\n', 'utf-8');
    }

    const lines: string[] = [];

    // Header line with timestamp and event type
    const stepLabel = entry.stepNumber && entry.totalSteps
      ? ` ${entry.stepNumber}/${entry.totalSteps}`
      : '';
    lines.push(`## ${now} | ${entry.eventType}${stepLabel}`);

    // Title line (bold)
    if (entry.title) {
      const idSuffix = entry.stepId ? ` (${entry.stepId})` : '';
      lines.push(`**${entry.title}**${idSuffix}`);
    }

    // Contract reference
    if (entry.contractId) {
      lines.push(`Contract: ${entry.contractId}`);
    }

    // Output path
    if (entry.outputPath) {
      lines.push(`Output: ${entry.outputPath}`);
    }

    // Extra details
    if (entry.details) {
      lines.push(entry.details);
    }

    // Trailing blank line
    lines.push('');

    await appendFile(filePath, lines.join('\n') + '\n', 'utf-8');
    return true;
  } catch (error) {
    log(`  Error appending to PROGRESS_LOG.md at ${bundlePath}: ${error}`);
    return false;
  }
}

/**
 * Log a breakdown event (steps generated).
 */
export async function logBreakdownProgress(
  bundlePath: string,
  stepsCreated: number,
  trigger: 'auto' | 're-breakdown',
  estimatedTurns?: number
): Promise<boolean> {
  const turnsInfo = estimatedTurns ? `, est. ${estimatedTurns} turns` : '';
  return appendProgressEntry(bundlePath, {
    eventType: 'Breakdown',
    details: `Generated ${stepsCreated} steps (${trigger}${turnsInfo})`,
  });
}

/**
 * Log a step started event.
 */
export async function logStepStartedProgress(
  bundlePath: string,
  stepId: string,
  stepNumber: number,
  totalSteps: number,
  stepTitle: string,
  contractId: string
): Promise<boolean> {
  return appendProgressEntry(bundlePath, {
    eventType: 'Step Started',
    stepId,
    stepNumber,
    totalSteps,
    title: stepTitle,
    contractId,
  });
}

/**
 * Log a step completed event.
 */
export async function logStepCompletedProgress(
  bundlePath: string,
  stepId: string,
  stepNumber: number,
  totalSteps: number,
  stepTitle: string,
  contractId?: string,
  outputPath?: string
): Promise<boolean> {
  return appendProgressEntry(bundlePath, {
    eventType: 'Step Complete',
    stepId,
    stepNumber,
    totalSteps,
    title: stepTitle,
    contractId,
    outputPath,
  });
}

/**
 * Log a step blocked event.
 */
export async function logStepBlockedProgress(
  bundlePath: string,
  stepId: string,
  stepNumber: number,
  totalSteps: number,
  stepTitle: string
): Promise<boolean> {
  return appendProgressEntry(bundlePath, {
    eventType: 'Step Blocked',
    stepId,
    stepNumber,
    totalSteps,
    title: stepTitle,
  });
}
