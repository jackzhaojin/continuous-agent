/**
 * Ad-hoc test: V2 Prompt Builder — Skill-Based Composition & Vendor Adaptation
 *
 * Tests that prompts are correctly composed from skills for each vendor.
 * Run: npx tsx tests/adhoc/v2-prompt-builder.adhoc.ts
 */

import { buildIntelligentPrompt, type RetryContext } from '../../src/agentic/intelligence/prompt-builder.js';
import type { WorkerContract, WorkItem } from '../../src/core/types.js';

// =====================================================================
// TEST FIXTURES
// =====================================================================

function makeContract(overrides?: Partial<WorkerContract>): WorkerContract {
  return {
    id: 'test-contract-001',
    goal_id: 'test-goal-001',
    prompt: 'Build a Next.js dashboard',
    scope: {
      tools_allowed: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Skill', 'Task'],
      file_access: ['**/*'],
    },
    max_turns: 100,
    definition_of_done: [
      'Dashboard renders with charts',
      'All pages are navigable',
      'No console errors',
    ],
    risk_assessment: 'medium — new project, standard web stack',
    required_skills: ['nextjs', 'react'],
    logging_obligations: ['Log all file changes', 'Report build status'],
    ...overrides,
  };
}

function makeWebItem(overrides?: Partial<WorkItem>): WorkItem {
  return {
    id: 'test-goal-001',
    title: 'Build a Next.js analytics dashboard',
    description: 'Create a responsive analytics dashboard with React charts',
    priority: 'P2',
    status: 'in_progress',
    ...overrides,
  };
}

function makeNonWebItem(overrides?: Partial<WorkItem>): WorkItem {
  return {
    id: 'test-goal-002',
    title: 'Implement CLI data migration tool',
    description: 'Build a Node.js CLI tool for database migration',
    priority: 'P3',
    status: 'in_progress',
    ...overrides,
  };
}

// =====================================================================
// ASSERTIONS
// =====================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, prompt?: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    if (prompt) {
      // Show first 200 chars around where the issue might be
      console.error(`    Prompt length: ${prompt.length} chars`);
    }
    failed++;
  }
}

// =====================================================================
// TESTS
// =====================================================================

async function testClaudeWebProject() {
  console.log('\n=== Test 1: Claude + Web Project ===');
  const contract = makeContract();
  const item = makeWebItem();

  const prompt = await buildIntelligentPrompt(contract, item, 'projects/dashboards/2026-04-05/analytics', undefined, 'claude');

  // Should have core sections
  assert(prompt.includes('# Objective:'), 'Has objective section', prompt);
  assert(prompt.includes('## Constraints'), 'Has constraints section', prompt);
  assert(prompt.includes('Definition of Done'), 'Has DoD', prompt);
  assert(prompt.includes('Validation Criteria'), 'Has validation criteria', prompt);

  // Should have worker-base skill content
  assert(prompt.includes('CONSTITUTION LIMITS'), 'Has constitution limits from worker-base skill', prompt);
  assert(prompt.includes('Monorepo'), 'Has monorepo rules from worker-base skill', prompt);

  // Should have web-testing skill content
  assert(prompt.includes('playwright-cli'), 'Has playwright-cli instructions from web-testing skill', prompt);
  assert(prompt.includes('PRE-FLIGHT CHECK'), 'Has pre-flight check from web-testing skill', prompt);

  // Should have execution pattern
  assert(prompt.includes('Execution Pattern'), 'Has execution pattern section', prompt);

  // Claude: should NOT have tool name mappings (SDK handles this)
  assert(!prompt.includes('Tool Name Mappings'), 'No tool mappings for Claude', prompt);
  // v2.4.1: SKILL_DIRECTIVE in worker-base legitimately names Kimi/Codex when explaining
  // cross-vendor skill discovery. What must not leak into Claude prompts is the Kimi-specific
  // preamble block (identified by its distinctive first heading).
  assert(!prompt.includes('Documentation Adherence (read before anything else)'), 'No Kimi preamble block for Claude', prompt);

  // No unreplaced template variables
  assert(!prompt.includes('{{PROJECT_PATH}}'), 'No unreplaced {{PROJECT_PATH}}', prompt);

  return prompt;
}

async function testKimiWebProject() {
  console.log('\n=== Test 2: Kimi + Web Project ===');
  const contract = makeContract();
  const item = makeWebItem();

  const prompt = await buildIntelligentPrompt(contract, item, 'projects/dashboards/2026-04-05/analytics', undefined, 'kimi');

  // Should have core sections
  assert(prompt.includes('# Objective:'), 'Has objective section', prompt);
  assert(prompt.includes('## Constraints'), 'Has constraints section', prompt);
  assert(prompt.includes('Definition of Done'), 'Has DoD', prompt);

  // Kimi: should have skill bodies injected
  assert(prompt.includes('CONSTITUTION LIMITS'), 'Has constitution limits injected', prompt);
  assert(prompt.includes('playwright-cli'), 'Has web-testing content injected', prompt);

  // Kimi: should have tool name mappings
  assert(prompt.includes('Tool Name Mappings'), 'Has tool name mappings section', prompt);
  assert(prompt.includes('"Shell"'), 'Has Shell tool mapping', prompt);
  assert(prompt.includes('"ReadFile"'), 'Has ReadFile tool mapping', prompt);
  assert(prompt.includes('"WriteFile"'), 'Has WriteFile tool mapping', prompt);
  assert(prompt.includes('"StrReplaceFile"'), 'Has StrReplaceFile tool mapping', prompt);

  // No unreplaced template variables
  assert(!prompt.includes('{{PROJECT_PATH}}'), 'No unreplaced {{PROJECT_PATH}}', prompt);

  return prompt;
}

async function testCodexNonWebProject() {
  console.log('\n=== Test 3: Codex + Non-Web Project ===');
  const contract = makeContract();
  const item = makeNonWebItem();

  const prompt = await buildIntelligentPrompt(contract, item, 'projects/tools/2026-04-05/migrator', undefined, 'codex');

  // Should have core sections
  assert(prompt.includes('# Objective:'), 'Has objective section', prompt);
  assert(prompt.includes('## Constraints'), 'Has constraints section', prompt);

  // Codex: should have worker-base injected
  assert(prompt.includes('CONSTITUTION LIMITS'), 'Has constitution limits injected', prompt);

  // Non-web: should NOT have web-testing FULL BODY injected
  // v2.4.1: the INDEX manifest lists every skill (including web-testing's one-line description
  // which mentions playwright-cli). What must not appear is the full web-testing BODY — e.g.
  // the ALL-CAPS section headers and the multi-line bash health-check script.
  assert(!prompt.includes('PRE-FLIGHT CHECK'), 'No pre-flight check for non-web', prompt);
  assert(!/You MUST execute these exact shell commands/.test(prompt), 'No web-testing full body for non-web', prompt);

  // Codex: should have tool mappings
  assert(prompt.includes('Tool Name Mappings'), 'Has tool name mappings for Codex', prompt);

  // No unreplaced template variables
  assert(!prompt.includes('{{PROJECT_PATH}}'), 'No unreplaced {{PROJECT_PATH}}', prompt);

  return prompt;
}

async function testClaudeNonWebProject() {
  console.log('\n=== Test 4: Claude + Non-Web Project ===');
  const contract = makeContract();
  const item = makeNonWebItem();

  const prompt = await buildIntelligentPrompt(contract, item, 'projects/tools/2026-04-05/migrator', undefined, 'claude');

  // Should have core sections
  assert(prompt.includes('# Objective:'), 'Has objective section', prompt);

  // Should NOT have web-testing content
  assert(!prompt.includes('PRE-FLIGHT CHECK'), 'No pre-flight check for non-web', prompt);

  // Claude: no tool mappings
  assert(!prompt.includes('Tool Name Mappings'), 'No tool mappings for Claude', prompt);

  return prompt;
}

async function testRetryContext() {
  console.log('\n=== Test 5: Retry Context ===');
  const contract = makeContract();
  const item = makeWebItem();
  const retry: RetryContext = {
    attempts: 2,
    maxRetries: 10,
    triedStrategies: ['standard', 'incremental'],
    lastError: 'Build failed: module not found',
  };

  const prompt = await buildIntelligentPrompt(contract, item, 'projects/dashboards/2026-04-05/analytics', retry, 'claude');

  assert(prompt.includes('Retry Context'), 'Has retry context section', prompt);
  assert(prompt.includes('**Attempt:** 3 / 10'), 'Has correct attempt number', prompt);
  assert(prompt.includes('module not found'), 'Has last error', prompt);

  return prompt;
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  console.log('V2 Prompt Builder — Ad-hoc Test Suite');
  console.log('=====================================');

  try {
    await testClaudeWebProject();
    await testKimiWebProject();
    await testCodexNonWebProject();
    await testClaudeNonWebProject();
    await testRetryContext();
  } catch (error) {
    console.error('\n\nFATAL ERROR:', error);
    process.exit(1);
  }

  console.log(`\n=====================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

main();
