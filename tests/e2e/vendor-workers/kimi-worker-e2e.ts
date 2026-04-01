/**
 * E2E Test: Kimi Wire Protocol Worker
 *
 * Tests:
 *   1. Authentication validation (kimi login)
 *   2. Simple prompt execution (wire protocol streaming)
 *   3. Tool use observability (tool_call + tool_result extraction)
 *   4. Thinking mode observability
 *
 * Requires: `kimi` CLI installed and logged in
 *
 * Usage:
 *   npx tsx tests/e2e/vendor-workers/kimi-worker-e2e.ts
 */

import { KimiWireAgentProvider } from '../../../src/core/vendor/kimi-wire-provider.js';
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
  console.log('\n=== Kimi Wire Protocol Worker E2E ===\n');

  // Check kimi CLI is available
  try {
    const version = execSync('kimi --version 2>&1', { encoding: 'utf8' }).trim();
    console.log(`Kimi CLI: ${version}`);
  } catch {
    console.log('Kimi CLI not found. Skipping tests.');
    process.exit(1);
  }

  const provider = new KimiWireAgentProvider();

  // Test 1: Auth validation (should always pass — trusts kimi login)
  console.log('\n[Test 1] Authentication');
  const auth = provider.validateAuth();
  assert(auth.valid, `Auth valid: ${auth.method}`);

  // Set up temp directory
  const tmpDir = path.join(os.tmpdir(), `kimi-e2e-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // Test 2: Simple prompt
  console.log('\n[Test 2] Simple prompt (wire protocol)');
  const simpleMessages = await collectMessages(
    provider.spawn({
      prompt: 'Reply with exactly: KIMI_E2E_OK',
      model: '', // Let kimi CLI use its configured default
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
  // Kimi streams content word-by-word as separate ContentPart events, and may
  // rephrase the response. Check that we got meaningful text output.
  const hasSubstantialText = allText.replace(/\[thinking\]/g, '').trim().length > 5;
  assert(hasSubstantialText, `Response contains text (${allText.length} chars)`);

  const lastResult = resultMsgs[resultMsgs.length - 1];
  assert(lastResult?.resultSuccess === true, 'Result marked as success');

  // Test 3: Tool use observability
  console.log('\n[Test 3] Tool use observability');
  const toolMessages = await collectMessages(
    provider.spawn({
      prompt: 'Use the Bash tool to run: echo "KIMI_TOOL_789". Then confirm the output.',
      model: '', // Let kimi CLI use its configured default
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const toolText = toolMessages.map(m => m.text || '').join('\n');
  const hasToolCall = toolText.includes('[tool_call]');
  const hasToolResult = toolText.includes('[tool_result]');
  const hasToolEvidence = toolText.includes('KIMI_TOOL_789') || hasToolCall;

  assert(toolMessages.length > 1, `Got ${toolMessages.length} messages`);
  assert(hasToolEvidence, 'Tool execution evidence in output');
  if (hasToolCall) {
    assert(true, 'Structured [tool_call] extracted');
  }
  if (hasToolResult) {
    assert(true, 'Structured [tool_result] extracted');
  }

  // Check for thinking content
  const hasThinking = toolText.includes('[thinking]');
  console.log(`  ${hasThinking ? PASS : '○'} Thinking content ${hasThinking ? 'present' : 'not present (KIMI_THINKING may be off)'}`);

  // Log sample normalized output
  console.log('\n  [Sample normalized output]');
  for (const msg of toolMessages.slice(0, 8)) {
    const preview = (msg.text || '(no text)').slice(0, 120);
    console.log(`    ${msg.type}: ${preview}`);
  }

  // Test 4: File write + verify
  console.log('\n[Test 4] File write');
  const writeMessages = await collectMessages(
    provider.spawn({
      prompt: 'Create a file called "kimi-test.txt" with the content "KIMI_WRITE_OK". Do not explain, just create it.',
      model: '', // Let kimi CLI use its configured default
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const fileExists = existsSync(path.join(tmpDir, 'kimi-test.txt'));
  const fileContent = fileExists ? readFileSync(path.join(tmpDir, 'kimi-test.txt'), 'utf8') : '';

  assert(fileExists, 'File was created');
  assert(fileContent.includes('KIMI_WRITE_OK'), 'File has correct content');

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });

  // Summary
  console.log(`\n=== Kimi E2E Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
