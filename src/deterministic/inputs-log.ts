import { appendFile } from 'fs/promises';
import path from 'path';

export interface InputLogEntry {
  source: 'needs-you' | 'queue' | 'goals';
  ts: string;
  raw_input: string;
  priority?: string;
  scope_allowed?: string[];
  intent_type?: string;
  metadata?: Record<string, unknown>;
}

const INPUTS_LOG_PATH = path.join(process.cwd(), 'ledgers', 'inputs-log.jsonl');

export async function appendInputLog(entry: InputLogEntry): Promise<void> {
  const line = JSON.stringify(entry);
  await appendFile(INPUTS_LOG_PATH, line + '\n', 'utf-8');
}
