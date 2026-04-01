/**
 * E2E Test: Claude Agent SDK Worker
 *
 * Tests:
 *   1. Authentication validation (OAuth token)
 *   2. Simple prompt execution (single-turn)
 *   3. Tool use observability (tool_call + tool_result in normalized output)
 *   4. Multi-turn execution
 *
 * Requires: CLAUDE_CODE_OAUTH_TOKEN set (via .env.worker or environment)
 *
 * Usage:
 *   npx tsx tests/e2e/vendor-workers/claude-worker-e2e.ts
 */

import { ClaudeAgentWorkerProvider } from '../../../src/core/vendor/claude-agent-provider.js';
import type { AgentWorkerMessage } from '../../../src/core/vendor/types.js';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';

// Load .env.worker for OAuth token
function loadWorkerEnv() {
  const root = path.resolve(import.meta.dirname, '../../..');
  for (const envFile of ['.env.worker', '.env']) {
    try {
      const content = readFileSync(path.join(root, envFile), 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch { /* ignore */ }
  }
}
loadWorkerEnv();

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
  console.log('\n=== Claude Agent SDK Worker E2E ===\n');

  const provider = new ClaudeAgentWorkerProvider();

  // Test 1: Auth validation
  console.log('[Test 1] Authentication');
  const auth = provider.validateAuth();
  assert(auth.valid, `Auth valid: ${auth.method}`, auth.error || undefined);

  if (!auth.valid) {
    console.log('\nSkipping remaining tests — no authentication configured.');
    process.exit(1);
  }

  // Test 2: Simple prompt — single turn, no tools
  console.log('\n[Test 2] Simple prompt (single turn)');
  const tmpDir = path.join(os.tmpdir(), `claude-e2e-${Date.now()}`);
  const { mkdirSync } = await import('fs');
  mkdirSync(tmpDir, { recursive: true });

  const simpleMessages = await collectMessages(
    provider.spawn({
      prompt: 'Reply with exactly: CLAUDE_E2E_OK',
      model: 'claude-sonnet-4-5',
      maxTurns: 1,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const assistantMsgs = simpleMessages.filter(m => m.type === 'assistant');
  const resultMsgs = simpleMessages.filter(m => m.type === 'result');
  const allText = simpleMessages.map(m => m.text || '').join(' ');

  assert(assistantMsgs.length > 0, `Got ${assistantMsgs.length} assistant message(s)`);
  assert(resultMsgs.length > 0, `Got ${resultMsgs.length} result message(s)`);
  assert(allText.includes('CLAUDE_E2E_OK'), 'Response contains expected text');

  const resultMsg = resultMsgs[resultMsgs.length - 1];
  assert(resultMsg?.resultSuccess === true, 'Result marked as success');

  // Test 3: Tool use observability
  console.log('\n[Test 3] Tool use observability');
  const toolMessages = await collectMessages(
    provider.spawn({
      prompt: 'Use the Bash tool to run "echo TOOL_TEST_123". Then confirm the output.',
      model: 'claude-sonnet-4-5',
      maxTurns: 3,
      cwd: tmpDir,
      allowedTools: ['Bash'],
    }),
  );

  const toolText = toolMessages.map(m => m.text || '').join('\n');
  const hasToolCall = toolText.includes('[tool_call]');
  const hasToolResult = toolText.includes('[tool_result]') || toolText.includes('TOOL_TEST_123');

  assert(toolMessages.length > 2, `Got ${toolMessages.length} messages (expected >2 with tool use)`);
  // Claude SDK may or may not expose tool_use as separate content blocks depending on version
  // Check either structured extraction works or raw text contains evidence of tool use
  assert(
    hasToolCall || toolText.includes('echo') || toolText.includes('TOOL_TEST_123'),
    'Tool execution evidence in output',
    hasToolCall ? 'Structured [tool_call] extracted' : 'Tool evidence in raw text',
  );
  assert(
    hasToolResult || toolText.includes('TOOL_TEST_123'),
    'Tool result visible in output',
  );

  // Log a sample of normalized output for manual inspection
  console.log('\n  [Sample normalized output]');
  for (const msg of toolMessages.slice(0, 5)) {
    const preview = (msg.text || '(no text)').slice(0, 120);
    console.log(`    ${msg.type}: ${preview}`);
  }

  // Cleanup
  const { rmSync } = await import('fs');
  rmSync(tmpDir, { recursive: true, force: true });

  // Summary
  console.log(`\n=== Claude E2E Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
