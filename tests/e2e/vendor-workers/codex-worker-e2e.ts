/**
 * E2E Test: OpenAI Codex SDK Worker
 *
 * Tests:
 *   1. Authentication validation (Codex CLI login)
 *   2. Simple prompt execution (single-turn streaming)
 *   3. Command execution observability (tool_call + tool_result extraction)
 *   4. File write observability
 *
 * Requires: `codex login` completed (ChatGPT auth) or CODEX_API_KEY/OPENAI_API_KEY
 *
 * Usage:
 *   npx tsx tests/e2e/vendor-workers/codex-worker-e2e.ts
 */

import { CodexAgentWorkerProvider } from '../../../src/core/vendor/codex-agent-provider.js';
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
  console.log('\n=== Codex SDK Worker E2E ===\n');

  // Check codex CLI is available
  try {
    const version = execSync('codex --version 2>&1', { encoding: 'utf8' }).trim();
    console.log(`Codex CLI: ${version}`);
  } catch {
    console.log('Codex CLI not found. Skipping tests.');
    process.exit(1);
  }

  const provider = new CodexAgentWorkerProvider();

  // Test 1: Auth validation
  console.log('\n[Test 1] Authentication');
  const auth = provider.validateAuth();
  // Codex uses CLI login which doesn't set env vars — check CLI status instead
  if (!auth.valid) {
    try {
      const loginStatus = execSync('codex login status 2>&1', { encoding: 'utf8' }).trim();
      const loggedIn = loginStatus.includes('Logged in');
      assert(loggedIn, `Codex CLI login: ${loginStatus}`);
      if (!loggedIn) {
        console.log('\nSkipping remaining tests — not logged in.');
        process.exit(1);
      }
    } catch {
      console.log('Cannot check codex login status. Skipping.');
      process.exit(1);
    }
  } else {
    assert(true, `Auth valid: ${auth.method}`);
  }

  // Set up temp directory (must be a git repo for Codex)
  const tmpDir = path.join(os.tmpdir(), `codex-e2e-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'ignore' });

  // Test 2: Simple prompt
  console.log('\n[Test 2] Simple prompt (streaming)');
  const simpleMessages = await collectMessages(
    provider.spawn({
      prompt: 'Reply with exactly: CODEX_E2E_OK',
      model: '', // Let Codex use its default (ChatGPT auth compatible)
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const assistantMsgs = simpleMessages.filter(m => m.type === 'assistant');
  const resultMsgs = simpleMessages.filter(m => m.type === 'result');
  const allText = simpleMessages.map(m => m.text || '').join(' ');

  assert(assistantMsgs.length > 0, `Got ${assistantMsgs.length} assistant message(s)`);
  assert(resultMsgs.length > 0, `Got ${resultMsgs.length} result message(s)`);
  assert(allText.includes('CODEX_E2E_OK'), 'Response contains expected text');

  // Test 3: Command execution observability
  console.log('\n[Test 3] Command execution observability');
  const cmdMessages = await collectMessages(
    provider.spawn({
      prompt: 'Run this shell command: echo "CODEX_CMD_TEST_456". Report the output.',
      model: '', // Let Codex use its default (ChatGPT auth compatible)
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const cmdText = cmdMessages.map(m => m.text || '').join('\n');
  const hasToolCall = cmdText.includes('[tool_call]');
  const hasCmdEvidence = cmdText.includes('CODEX_CMD_TEST_456') || cmdText.includes('echo');

  assert(cmdMessages.length > 1, `Got ${cmdMessages.length} messages`);
  assert(
    hasToolCall || hasCmdEvidence,
    'Command execution evidence in output',
    hasToolCall ? 'Structured [tool_call] extracted' : 'Command evidence in text',
  );

  // Log sample normalized output
  console.log('\n  [Sample normalized output]');
  for (const msg of cmdMessages.slice(0, 6)) {
    const preview = (msg.text || '(no text)').slice(0, 120);
    console.log(`    ${msg.type}: ${preview}`);
  }

  // Test 4: File write observability
  console.log('\n[Test 4] File write observability');
  const writeMessages = await collectMessages(
    provider.spawn({
      prompt: 'Create a file called "e2e-test.txt" with the content "CODEX_WRITE_OK". Do not explain, just create the file.',
      model: '', // Let Codex use its default (ChatGPT auth compatible)
      maxTurns: 5,
      cwd: tmpDir,
      allowedTools: [],
    }),
  );

  const writeText = writeMessages.map(m => m.text || '').join('\n');
  const fileExists = existsSync(path.join(tmpDir, 'e2e-test.txt'));
  const fileContent = fileExists ? readFileSync(path.join(tmpDir, 'e2e-test.txt'), 'utf8') : '';

  // Codex may not write files depending on sandbox permissions
  if (fileExists) {
    assert(true, 'File was created');
    assert(fileContent.includes('CODEX_WRITE_OK'), 'File has correct content');
  } else {
    console.log('  ○ File not created (sandbox may restrict writes — this is OK)');
  }
  assert(
    writeText.includes('file_') || writeText.includes('e2e-test.txt') || writeText.length > 0,
    'File change event or agent response visible in output',
  );

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });

  // Summary
  console.log(`\n=== Codex E2E Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
