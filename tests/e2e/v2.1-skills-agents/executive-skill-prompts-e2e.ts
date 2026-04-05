/**
 * E2E Test: Executive Skill Prompts
 *
 * Loads each executive skill from .claude/skills/, renders variables,
 * sends to ChatCompletionProvider, and validates the LLM returns
 * structured output matching the skill's expected format.
 *
 * Tests:
 *   1. email-triage — returns JSON with decisions array
 *   2. goal-breakdown — returns JSON array of steps
 *   3. failure-diagnosis — returns JSON with rootCause/shouldRetry/escalateToHuman
 *
 * Requires: CLAUDE_CODE_OAUTH_TOKEN set (via .env.worker or environment)
 *
 * Usage:
 *   npx tsx tests/e2e/v2.1-skills-agents/executive-skill-prompts-e2e.ts
 */

import { ClaudeChatProvider } from '../../../src/core/vendor/claude-agent-provider.js';
import { loadSkillPrompt } from '../../../src/agentic/intelligence/skill-prompt-loader.js';
import { loadAgentEnv, createAssert } from './_test-helpers.js';

loadAgentEnv();

const { assert, counts } = createAssert();

function extractJson(text: string, type: 'object' | 'array'): unknown | null {
  // Strip markdown code fences first
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = cleaned.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ── Tests ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== V2.1 Executive Skill Prompts E2E ===\n');

  const chatProvider = new ClaudeChatProvider();
  const auth = chatProvider.validateAuth();
  if (!auth.valid) {
    console.log(`${FAIL} Auth not configured: ${auth.error}`);
    process.exit(1);
  }
  console.log(`Auth: ${auth.method}\n`);

  // ──────────────────────────────────────────────────────────────
  // Test 1: email-triage skill
  // ──────────────────────────────────────────────────────────────
  console.log('[Test 1] email-triage → ChatCompletion');

  const triagePrompt = await loadSkillPrompt('email-triage', {
    AGENT_EMAIL: 'agent@example.com',
    EMAIL_SUMMARIES: [
      '[0] From: mailer-daemon@google.com',
      '    Subject: Delivery Status Notification (Failure)',
      '    Body: Your message to user@invalid.com could not be delivered.',
      '',
      '[1] From: jack@company.com',
      '    Subject: New goal: Build a landing page',
      '    Body: Hey agent, please build a landing page for our new product launch.',
    ].join('\n'),
  });

  assert(!triagePrompt.includes('{{'), 'Variables rendered (no {{ left))');

  const triageResult = await chatProvider.complete({
    model: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: triagePrompt }],
    maxTokens: 600,
    temperature: 0.1,
  });

  const triageJson = extractJson(triageResult.text, 'object') as {
    decisions?: Array<{ index: number; action: string; intentType?: string }>;
  } | null;

  assert(triageJson !== null, 'Response is valid JSON');
  assert(
    Array.isArray(triageJson?.decisions) && triageJson!.decisions.length === 2,
    `Got ${triageJson?.decisions?.length ?? 0} decisions (expected 2)`,
  );

  if (triageJson?.decisions) {
    const bounce = triageJson.decisions.find(d => d.index === 0);
    const human = triageJson.decisions.find(d => d.index === 1);
    assert(bounce?.action === 'archive', `Bounce email → archive (got: ${bounce?.action})`);
    assert(
      human?.action === 'queue' && human?.intentType === 'new_goal',
      `Human email → queue/new_goal (got: ${human?.action}/${human?.intentType})`,
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Test 2: goal-breakdown skill
  // ──────────────────────────────────────────────────────────────
  console.log('\n[Test 2] goal-breakdown → ChatCompletion');

  const breakdownPrompt = await loadSkillPrompt('goal-breakdown', {
    COMPLEXITY_ESTIMATE: '180',
    STEP_GUIDANCE: '5-15 steps',
    TURN_RANGE: '20-100',
    GOAL_TITLE: 'Build a React dashboard with charts',
    BUNDLE_CONTEXT: [
      '## Problem',
      'Build a personal finance dashboard in React with:',
      '- Summary cards (income, expenses, savings)',
      '- Line chart for income vs expenses trend',
      '- Pie chart for expense categories',
      '- Transaction table with sorting and filtering',
    ].join('\n'),
  });

  const breakdownResult = await chatProvider.complete({
    model: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: breakdownPrompt }],
    maxTokens: 1000,
    temperature: 0.1,
  });

  const steps = extractJson(breakdownResult.text, 'array') as
    Array<{ title: string; description: string; estimated_turns: number }> | null;

  assert(steps !== null, 'Response is valid JSON array');
  assert(
    Array.isArray(steps) && steps.length >= 3,
    `Got ${steps?.length ?? 0} steps (expected ≥3)`,
  );

  if (steps && steps.length > 0) {
    const step0 = steps[0];
    assert(
      step0.title.toLowerCase().includes('research') || step0.title.toLowerCase().includes('plan'),
      `Step 0 is research/planning: "${step0.title}"`,
    );
    assert(
      typeof step0.estimated_turns === 'number' && step0.estimated_turns >= 20,
      `Step 0 has valid turns: ${step0.estimated_turns}`,
    );

    const allHaveFields = steps.every(
      s => typeof s.title === 'string' && typeof s.description === 'string' && typeof s.estimated_turns === 'number',
    );
    assert(allHaveFields, 'All steps have title, description, estimated_turns');
  }

  // ──────────────────────────────────────────────────────────────
  // Test 3: failure-diagnosis skill
  // ──────────────────────────────────────────────────────────────
  console.log('\n[Test 3] failure-diagnosis → ChatCompletion');

  const diagnosisPrompt = await loadSkillPrompt('failure-diagnosis', {
    TASK_TITLE: 'Deploy Next.js app',
    TASK_DESCRIPTION: 'Deploy the Next.js app to production via Vercel',
    ATTEMPTS: '4',
    LAST_ERROR: 'Error: ENOENT: no such file or directory, open \'.env.production\'',
    VALIDATION_REPORTS: 'git-clean: PASS\nnode-build: FAIL (exit code 1)',
    WORKER_LOGS: [
      'npm run build exited with code 1',
      'Error: ENOENT: .env.production not found',
      'Worker tried creating .env.production but it was empty',
    ].join('\n'),
  });

  // Retry once if empty — Claude SDK single-turn can occasionally return empty
  let diagnosisText = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const diagnosisResult = await chatProvider.complete({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: diagnosisPrompt }],
      maxTokens: 500,
    });
    diagnosisText = diagnosisResult.text;
    if (diagnosisText.length > 20) break;
    if (attempt < 2) console.log(`  [RETRY] Empty response, retrying...`);
  }

  const diagnosis = extractJson(diagnosisText, 'object') as {
    rootCause?: string;
    shouldRetry?: boolean;
    suggestedFix?: string;
    escalateToHuman?: boolean;
    diagnosis?: string;
  } | null;

  assert(diagnosis !== null, 'Response is valid JSON');
  assert(typeof diagnosis?.rootCause === 'string' && diagnosis.rootCause.length > 10, `rootCause: "${(diagnosis?.rootCause || '').slice(0, 80)}"`);
  assert(typeof diagnosis?.shouldRetry === 'boolean', `shouldRetry: ${diagnosis?.shouldRetry}`);
  assert(typeof diagnosis?.escalateToHuman === 'boolean', `escalateToHuman: ${diagnosis?.escalateToHuman}`);

  // This specific error (.env.production missing) should probably escalate
  // since the worker can't create credentials
  const mentionsEnv = (diagnosis?.rootCause || '').toLowerCase().includes('env') ||
    (diagnosis?.diagnosis || '').toLowerCase().includes('env') ||
    (diagnosis?.suggestedFix || '').toLowerCase().includes('env');
  assert(mentionsEnv, 'Diagnosis mentions .env issue');

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n=== Executive Skill Prompts E2E: ${counts.passed} passed, ${counts.failed} failed ===\n`);
  process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
