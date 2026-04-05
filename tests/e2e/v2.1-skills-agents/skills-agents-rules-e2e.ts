/**
 * E2E Test: Skills, Agents, and Rules Integration
 *
 * Spawns a real Claude Agent SDK worker session with cwd set to
 * the continuous-agent root, verifying that .claude/skills/, .claude/agents/,
 * and .claude/rules/ are loaded and accessible to the worker.
 *
 * Tests:
 *   1. Worker can see and list .claude/skills/ (verifies settingSources loading)
 *   2. Worker can read a specific skill's SKILL.md content
 *   3. Worker is aware of rules (scoped context injection)
 *   4. skill-prompt-loader works end-to-end (ChatCompletionProvider + skill file)
 *   5. Worker acknowledges agent definitions exist
 *
 * Requires: CLAUDE_CODE_OAUTH_TOKEN set (via .env.worker or environment)
 *
 * Usage:
 *   npx tsx tests/e2e/v2.1-skills-agents/skills-agents-rules-e2e.ts
 */

import { ClaudeAgentWorkerProvider, ClaudeChatProvider } from '../../../src/core/vendor/claude-agent-provider.js';
import { loadSkillPrompt } from '../../../src/agentic/intelligence/skill-prompt-loader.js';
import type { AgentWorkerMessage } from '../../../src/core/vendor/types.js';
import { AGENT_ROOT, loadAgentEnv, createAssert } from './_test-helpers.js';

loadAgentEnv();

const { assert, counts } = createAssert();

async function collectMessages(stream: AsyncIterable<AgentWorkerMessage>): Promise<string> {
  const parts: string[] = [];
  for await (const msg of stream) {
    if (msg.text) parts.push(msg.text);
  }
  return parts.join('\n');
}

// ── Tests ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== V2.1 Skills, Agents & Rules E2E ===\n');
  console.log(`Agent root: ${AGENT_ROOT}`);

  const workerProvider = new ClaudeAgentWorkerProvider();

  // Pre-flight: auth check
  const auth = workerProvider.validateAuth();
  if (!auth.valid) {
    console.log(`\n${FAIL} Auth not configured: ${auth.error}`);
    console.log('Set CLAUDE_CODE_OAUTH_TOKEN in .env.worker');
    process.exit(1);
  }
  console.log(`Auth: ${auth.method}\n`);

  // ──────────────────────────────────────────────────────────────
  // Test 1: Worker can list skills in .claude/skills/
  // ──────────────────────────────────────────────────────────────
  console.log('[Test 1] Worker lists .claude/skills/');
  const listOutput = await collectMessages(
    workerProvider.spawn({
      prompt: [
        'List all directories inside .claude/skills/ in this project.',
        'Use the Bash tool to run: ls .claude/skills/',
        'Then report each skill name you found, one per line.',
        'Prefix your list with "SKILLS_FOUND:" on its own line.',
      ].join('\n'),
      model: 'claude-sonnet-4-5',
      maxTurns: 3,
      cwd: AGENT_ROOT,
      allowedTools: ['Bash', 'Read'],
      settingSources: ['user', 'project'],
    }),
  );

  const expectedSkills = [
    'email-triage', 'goal-breakdown', 'failure-diagnosis',
    'work-selection', 'retrospective', 'task-contract', 'validator',
  ];
  const foundSkills = expectedSkills.filter(s => listOutput.includes(s));
  assert(foundSkills.length >= 5, `Found ${foundSkills.length}/${expectedSkills.length} expected skills`);

  // ──────────────────────────────────────────────────────────────
  // Test 2: Worker can read a specific skill SKILL.md
  // ──────────────────────────────────────────────────────────────
  console.log('\n[Test 2] Worker reads email-triage skill');
  const readOutput = await collectMessages(
    workerProvider.spawn({
      prompt: [
        'Read the file .claude/skills/email-triage/SKILL.md.',
        'Tell me: what is the skill name from its frontmatter, and what are the 3 actions it defines (archive/queue/reply)?',
        'Prefix your answer with "SKILL_READ:" on its own line.',
      ].join('\n'),
      model: 'claude-sonnet-4-5',
      maxTurns: 3,
      cwd: AGENT_ROOT,
      allowedTools: ['Read'],
      settingSources: ['user', 'project'],
    }),
  );

  assert(readOutput.includes('email-triage'), 'Worker found skill name "email-triage"');
  assert(
    readOutput.includes('archive') && readOutput.includes('queue') && readOutput.includes('reply'),
    'Worker identified all 3 actions (archive, queue, reply)',
  );

  // ──────────────────────────────────────────────────────────────
  // Test 3: Rules files exist and are accessible
  // Rules with paths: scoping auto-load when Claude works on those
  // files. Here we verify the rules files exist and are readable,
  // and that the worker can discover them.
  // ──────────────────────────────────────────────────────────────
  console.log('\n[Test 3] Rules files accessible');
  const rulesOutput = await collectMessages(
    workerProvider.spawn({
      prompt: [
        'List all files in .claude/rules/ directory.',
        'Report how many rule files you found and name at least 3 of them.',
        'Prefix with "RULES_FOUND:" on its own line.',
      ].join('\n'),
      model: 'claude-sonnet-4-5',
      maxTurns: 3,
      cwd: AGENT_ROOT,
      allowedTools: ['Bash', 'Read'],
      settingSources: ['user', 'project'],
    }),
  );

  const expectedRules = ['executive-loop', 'identity-system', 'worker-spawner', 'credentials-and-env'];
  const foundRules = expectedRules.filter(r => rulesOutput.includes(r));
  assert(foundRules.length >= 3, `Found ${foundRules.length}/${expectedRules.length} expected rules`);
  assert(rulesOutput.includes('.md'), 'Rules are .md files');

  // ──────────────────────────────────────────────────────────────
  // Test 4: skill-prompt-loader + ChatCompletionProvider end-to-end
  // Load a skill prompt, render variables, send to LLM, get response
  // ──────────────────────────────────────────────────────────────
  console.log('\n[Test 4] skill-prompt-loader + ChatCompletion end-to-end');
  const chatProvider = new ClaudeChatProvider();
  const chatAuth = chatProvider.validateAuth();
  assert(chatAuth.valid, `Chat provider auth: ${chatAuth.method}`);

  if (chatAuth.valid) {
    // Load the failure-diagnosis skill with test variables
    const diagnosisPrompt = await loadSkillPrompt('failure-diagnosis', {
      TASK_TITLE: 'E2E Test Task',
      TASK_DESCRIPTION: 'This is a test — respond with a valid JSON diagnosis',
      ATTEMPTS: '3',
      LAST_ERROR: 'TEST_ERROR_E2E: intentional test error',
      VALIDATION_REPORTS: 'git-clean: PASS\nnode-build: FAIL (exit code 1)',
      WORKER_LOGS: 'npm ERR! Missing script: "build"',
    });

    assert(diagnosisPrompt.length > 500, `Skill prompt loaded (${diagnosisPrompt.length} chars)`);
    assert(!diagnosisPrompt.includes('{{'), 'No unrendered variables in prompt');

    const chatResult = await chatProvider.complete({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: diagnosisPrompt }],
      maxTokens: 500,
    });

    assert(chatResult.text.length > 50, `Chat response received (${chatResult.text.length} chars)`);

    // Should be valid JSON diagnosis
    const jsonMatch = chatResult.text.match(/\{[\s\S]*\}/);
    assert(jsonMatch !== null, 'Response contains JSON');

    if (jsonMatch) {
      try {
        const diagnosis = JSON.parse(jsonMatch[0]);
        assert('rootCause' in diagnosis, `Diagnosis has rootCause: "${(diagnosis.rootCause || '').slice(0, 80)}"`);
        assert('shouldRetry' in diagnosis, `Diagnosis has shouldRetry: ${diagnosis.shouldRetry}`);
        assert('escalateToHuman' in diagnosis, `Diagnosis has escalateToHuman: ${diagnosis.escalateToHuman}`);
      } catch (e) {
        assert(false, `JSON parse failed: ${e}`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Test 5: Worker sees agent definitions
  // ──────────────────────────────────────────────────────────────
  console.log('\n[Test 5] Agent definitions visible');
  const agentOutput = await collectMessages(
    workerProvider.spawn({
      prompt: [
        'List the files in .claude/agents/ directory.',
        'For each agent file found, report its filename.',
        'Prefix with "AGENTS_FOUND:" on its own line.',
      ].join('\n'),
      model: 'claude-sonnet-4-5',
      maxTurns: 3,
      cwd: AGENT_ROOT,
      allowedTools: ['Bash', 'Read'],
      settingSources: ['user', 'project'],
    }),
  );

  assert(agentOutput.includes('self-enhancer'), 'Found self-enhancer agent');
  assert(agentOutput.includes('skill-builder'), 'Found skill-builder agent');

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n=== V2.1 Skills/Agents/Rules E2E: ${counts.passed} passed, ${counts.failed} failed ===\n`);
  process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
