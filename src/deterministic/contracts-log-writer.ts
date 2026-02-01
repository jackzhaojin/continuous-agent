/**
 * Contracts Log Writer - DETERMINISTIC
 *
 * Append-only writer for per-goal-bundle CONTRACTS.jsonl files.
 * Each entry records a contract event (started, completed, failed, blocked)
 * for traceability within the goal bundle directory.
 */

import { appendFile, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { log } from '../core/logging.js';

const CONTRACTS_FILENAME = 'CONTRACTS.jsonl';

export interface ContractEvent {
  event: 'CONTRACT_STARTED' | 'CONTRACT_COMPLETED' | 'CONTRACT_FAILED' | 'CONTRACT_BLOCKED';
  ts: string;
  contract_id: string;
  step_id?: string;
  step_title?: string;
  output_path?: string;
  error?: string;
}

/**
 * Append a contract event to CONTRACTS.jsonl in the goal bundle directory.
 * Creates the file if it doesn't exist.
 */
export async function appendContractEvent(
  bundlePath: string,
  event: ContractEvent
): Promise<boolean> {
  const filePath = path.join(bundlePath, CONTRACTS_FILENAME);

  try {
    const line = JSON.stringify(event) + '\n';
    await appendFile(filePath, line, 'utf-8');
    return true;
  } catch (error) {
    log(`  Warning: Failed to append to CONTRACTS.jsonl at ${bundlePath}: ${error}`);
    return false;
  }
}

/**
 * Read all contract events from a goal bundle's CONTRACTS.jsonl.
 * Returns empty array if file doesn't exist or is unreadable.
 */
export async function readContractHistory(bundlePath: string): Promise<ContractEvent[]> {
  const filePath = path.join(bundlePath, CONTRACTS_FILENAME);

  if (!existsSync(filePath)) return [];

  try {
    const content = await readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        try {
          return JSON.parse(line) as ContractEvent;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ContractEvent => entry !== null);
  } catch {
    return [];
  }
}
