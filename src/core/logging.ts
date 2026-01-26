/**
 * Logging utilities with AGENTIC vs DETERMINISTIC markers
 */

import { createWriteStream, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import path from 'path';
import type { HealthStatus } from './types.js';

const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');

// Ensure ledgers directory exists
if (!existsSync(LEDGERS_DIR)) {
  mkdirSync(LEDGERS_DIR, { recursive: true });
}

// === DAILY LOG FILE ===
let currentLogStream: ReturnType<typeof createWriteStream> | null = null;
let currentLogDate: string | null = null;

function getLogFilePath(): string {
  const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  return path.join(LEDGERS_DIR, `executive-${today}.log`);
}

function getLogStream(): ReturnType<typeof createWriteStream> {
  const today = new Date().toISOString().split('T')[0];

  // Create new stream if date changed or stream doesn't exist
  if (currentLogDate !== today || !currentLogStream) {
    currentLogStream?.end();
    currentLogStream = createWriteStream(getLogFilePath(), { flags: 'a' });
    currentLogDate = today;
  }

  return currentLogStream;
}

function writeLog(level: 'INFO' | 'ERROR' | 'WARN', message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp}: [${level}] ${message}`;

  // Write to file
  const stream = getLogStream();
  stream.write(logLine + '\n');

  // Also write to console
  console.log(timestamp + ': ' + message);
}

/**
 * Log with AGENTIC marker - for AI decision-making
 */
export function logAgentic(message: string): void {
  writeLog('INFO', `🤖 [AGENTIC] ${message}`);
}

/**
 * Log with DETERMINISTIC marker - for mechanical operations
 */
export function logDeterministic(message: string): void {
  writeLog('INFO', `⚙️ [DETERMINISTIC] ${message}`);
}

/**
 * Regular log (for neutral information)
 */
export function log(message: string): void {
  writeLog('INFO', message);
}

/**
 * Error log
 */
export function logError(message: string, error?: unknown): void {
  const errorDetails = error instanceof Error ? error.message : String(error);
  writeLog('ERROR', `${message}: ${errorDetails}`);
}

/**
 * Log health status check results
 */
export function logHealthStatus(health: HealthStatus): void {
  writeLog('INFO', `Health: ${health.overall}`);
  for (const check of health.checks) {
    const icon = check.status === 'pass' ? '✓' : '✗';
    writeLog('INFO', `  ${icon} ${check.name}: ${check.message}`);
  }
}

/**
 * Close the current log stream (call on shutdown)
 */
export function closeLogStream(): void {
  currentLogStream?.end();
  currentLogStream = null;
  currentLogDate = null;
}
