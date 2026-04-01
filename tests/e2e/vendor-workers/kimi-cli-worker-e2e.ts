/**
 * E2E Test: Kimi CLI Agent Provider (stream-json mode)
 *
 * Tests:
 *   1. Authentication validation (kimi login)
 *   2. Simple prompt execution (--print --output-format=stream-json)
 *   3. Tool use observability (tool_call + tool_result in JSONL)
 *   4. File write
 *
 * Requires: `kimi` CLI installed and logged in
 *
 * Usage:
 *   npx tsx tests/e2e/vendor-workers/kimi-cli-worker-e2e.ts
 */

import { KimiCliAgentProvider } from '../../../src/core/vendor/kimi-cli-provider.js';
import type { AgentWorkerMessage } from '../../../src/core/vendor/types.js';
import os from 'os';
import path from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const PASS = '✓';
const FAIL = '✗';
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function collectMessages(
  stream: AsyncIterable<AgentWorkerMessage>,
): Promise<AgentWorkerMessage[]> {
  const messages: AgentWorkerMessage[] = [];
  for await (const msg of stream) {
    messages.push(msg);
  }
  return messages;
}

async function main() {
  console.log('\n=== Kimi CLI (stream-json) Worker E2E ===\n');

  // Check kimi CLI is available
  try {
    const version = execSync('kimi --version 2>&1', { encoding: 'utf8' }).trim();
    console.log(`Kimi CLI: ${version}`);
  } catch {
    console.log('Kimi CLI not found. Skipping tests.');
    process.exit(1);
  }

  const provider = new KimiCliAgentProvider();

  // Test 1: Auth validation
  console.log('\n[Test 1] Authentication');
  const auth = provider.validateAuth();
  assert(auth.valid, `Auth valid: ${auth.method}`);
  assert(provider.vendorName === 'Kimi CLI (stream-json)', `Vendor name: ${provider.vendorName}`);

  // Set up temp directory
  const tmpDir = path.join(os.tmpdir(), `kimi-cli-e2e-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // Test 2: Simple prompt
  console.log('\n[Test 2] Simple prompt (stream-json)');
  const simpleMessages = await collectMessages(
    provider.spawn({
      prompt: 'Reply with exactly: KIMI_CLI_OK',
      model: '',
      maxTurns: 3,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const assistantMsgs = simpleMessages.filter(m => m.type === 'assistant');
  const resultMsgs = simpleMessages.filter(m => m.type === 'result');
  const allText = simpleMessages.map(m => m.text || '').join(' ');

  assert(assistantMsgs.length > 0, `Got ${assistantMsgs.length} assistant message(s)`);
  assert(resultMsgs.length > 0, `Got ${resultMsgs.length} result message(s)`);
  // Kimi may rephrase — check for substantial response
  const hasText = allText.replace(/\[thinking\]/g, '').trim().length > 5;
  assert(hasText, `Response contains text (${allText.length} chars)`);

  // Test 3: Tool use observability
  console.log('\n[Test 3] Tool use observability');
  const toolMessages = await collectMessages(
    provider.spawn({
      prompt: 'Use the Bash tool to run: echo "KIMI_CLI_TOOL_789". Then confirm the output.',
      model: '',
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const toolText = toolMessages.map(m => m.text || '').join('\n');
  const hasToolCall = toolText.includes('[tool_call]');
  const hasToolResult = toolText.includes('[tool_result]');

  assert(toolMessages.length > 1, `Got ${toolMessages.length} messages`);
  assert(hasToolCall, 'Structured [tool_call] extracted from JSONL');
  assert(hasToolResult, 'Structured [tool_result] extracted from JSONL');

  // Log sample output
  console.log('\n  [Sample normalized output]');
  for (const msg of toolMessages.slice(0, 6)) {
    const preview = (msg.text || '(no text)').slice(0, 150);
    console.log(`    ${msg.type}: ${preview}`);
  }

  // Test 4: File write
  console.log('\n[Test 4] File write');
  const writeMessages = await collectMessages(
    provider.spawn({
      prompt: 'Create a file called "kimi-cli-test.txt" with the content "KIMI_CLI_WRITE_OK". Do not explain, just create it.',
      model: '',
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const fileExists = existsSync(path.join(tmpDir, 'kimi-cli-test.txt'));
  const fileContent = fileExists ? readFileSync(path.join(tmpDir, 'kimi-cli-test.txt'), 'utf8') : '';

  assert(fileExists, 'File was created');
  assert(fileContent.includes('KIMI_CLI_WRITE_OK'), 'File has correct content');

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });

  // Summary
  console.log(`\n=== Kimi CLI E2E Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
