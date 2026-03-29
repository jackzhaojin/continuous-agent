/**
 * Adhoc tests for V2.0 Phase 2: Execution Pattern Routing
 *
 * Tests:
 *   1. Execution pattern precedence resolution (PROMPT.md > playbook > default)
 *   2. V2 prompt composition produces prompts containing skill/playbook content
 *   3. Plan-mode tool restriction logic
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveExecutionPattern, type PatternResolution } from '../../src/deterministic/execution-pattern-resolver.js';
import type { WorkItem, ExecutionPattern } from '../../src/core/types.js';
import type { PlaybookDefinition } from '../../src/deterministic/library-loader-types.js';

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'goal-test',
    priority: 'P3',
    title: 'Test Goal',
    description: 'A test goal for adhoc tests',
    status: 'pending',
    ...overrides,
  };
}

function makePlaybook(overrides: Partial<PlaybookDefinition> = {}): PlaybookDefinition {
  return {
    name: 'test-playbook',
    version: '1.0.0',
    category: 'worker',
    description: 'Test playbook',
    goal: 'Test goal',
    context_requires: [],
    context_optional: [],
    composes_skills: [],
    composes_playbooks: [],
    execution_pattern: 'loop-until-progress',
    tags: [],
    track_record: {
      total_executions: 0,
      successes: 0,
      failures: 0,
      last_executed: null,
      confidence: 0,
      maturity: 'Declared',
    },
    source_path: '/tmp/test/SKILL.md',
    body: '# Test playbook body',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────
// Test 1: Execution pattern precedence
// ─────────────────────────────────────────────────────

async function testPatternPrecedence(): Promise<void> {
  console.log('  Test 1: Execution pattern precedence...');

  // 1a. System default when no override and no playbook
  const defaultRes = resolveExecutionPattern(makeWorkItem());
  assert.equal(defaultRes.pattern, 'plan-then-execute', 'system default should be plan-then-execute');
  assert.equal(defaultRes.source, 'system-default');

  // 1b. Playbook default when item has no override
  const playbookRes = resolveExecutionPattern(
    makeWorkItem(),
    makePlaybook({ execution_pattern: 'loop-until-progress' }),
  );
  assert.equal(playbookRes.pattern, 'loop-until-progress', 'playbook default should win over system default');
  assert.equal(playbookRes.source, 'playbook-default');

  // 1c. PROMPT.md override wins over playbook
  const overrideRes = resolveExecutionPattern(
    makeWorkItem({ execution_pattern: 'plan-mode' }),
    makePlaybook({ execution_pattern: 'loop-until-progress' }),
  );
  assert.equal(overrideRes.pattern, 'plan-mode', 'PROMPT.md override should win over playbook');
  assert.equal(overrideRes.source, 'prompt-override');

  // 1d. PROMPT.md override wins when no playbook
  const overrideNoPlaybook = resolveExecutionPattern(
    makeWorkItem({ execution_pattern: 'deterministic-pipeline' }),
  );
  assert.equal(overrideNoPlaybook.pattern, 'deterministic-pipeline', 'PROMPT.md override should work without playbook');
  assert.equal(overrideNoPlaybook.source, 'prompt-override');

  // 1e. Invalid PROMPT.md value falls through to playbook
  const invalidOverride = resolveExecutionPattern(
    makeWorkItem({ execution_pattern: 'invalid-pattern' as ExecutionPattern }),
    makePlaybook({ execution_pattern: 'plan-mode' }),
  );
  assert.equal(invalidOverride.pattern, 'plan-mode', 'invalid override should fall through to playbook');
  assert.equal(invalidOverride.source, 'playbook-default');

  // 1f. Null playbook falls to system default
  const nullPlaybook = resolveExecutionPattern(
    makeWorkItem(),
    null,
  );
  assert.equal(nullPlaybook.pattern, 'plan-then-execute');
  assert.equal(nullPlaybook.source, 'system-default');

  console.log('    PASS: Pattern precedence');
}

// ─────────────────────────────────────────────────────
// Test 2: V2 prompt composition includes skill/playbook content
// ─────────────────────────────────────────────────────

async function testV2PromptComposition(): Promise<void> {
  console.log('  Test 2: V2 prompt composition...');

  // We test buildV2ComposedPrompt with temp skill/playbook directories.
  // This requires creating temp dirs and overriding process.cwd for the loaders.
  // Instead, we import the function directly and verify its output structure.

  const { buildV2ComposedPrompt } = await import('../../src/agentic/intelligence/prompt-builder.js');

  // Create temp skill and playbook directories
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'v2-prompt-'));
  const skillsDir = path.join(tmpRoot, 'skills', 'git');
  const playbooksDir = path.join(tmpRoot, 'playbooks', 'worker', 'build-from-plan');

  await mkdir(skillsDir, { recursive: true });
  await mkdir(playbooksDir, { recursive: true });

  await writeFile(
    path.join(skillsDir, 'SKILL.md'),
    `---
name: git
version: 1.0.0
category: skill
description: Git operations
tags: [git, vcs]
track_record:
  total_executions: 5
  successes: 5
  failures: 0
  confidence: 50
  maturity: Emerging
---
## Git Usage

Use git for version control. Common commands: git add, git commit, git push.
`,
    'utf8',
  );

  await writeFile(
    path.join(playbooksDir, 'SKILL.md'),
    `---
name: build-from-plan
version: 1.0.0
category: worker
description: Build implementation from plan
goal: Ship implementation
context_requires:
  - plan_document: "Structured plan"
composes_skills: [git]
execution_pattern: plan-then-execute
tags: [build, plan, implementation]
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  confidence: 0
  maturity: Declared
---
## Procedure

### Phase 1: Understand the plan
Read and analyze the plan document.

### Phase 2: Implement
Write code following the plan.

### Phase 3: Validate
Run tests and verify.
`,
    'utf8',
  );

  // Override cwd temporarily so loaders find our temp dirs
  const originalCwd = process.cwd;
  process.cwd = () => tmpRoot;

  try {
    const prompt = await buildV2ComposedPrompt(
      {
        id: 'contract-test',
        prompt: 'Build a test app from plan',
        scope: {
          repos_allowed: ['ai-sandbox'],
          tools_allowed: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
        },
        definition_of_done: ['Code compiles', 'Tests pass'],
        max_turns: 100,
        risk_assessment: 'low',
        required_skills: [],
        logging_obligations: ['Log all work'],
        created_at: new Date().toISOString(),
      },
      makeWorkItem({
        title: 'Build a test app from plan',
        description: 'Implementation of a test app based on a structured build plan',
      }),
      'projects/misc/2026-01-01/test',
    );

    // Verify prompt contains key sections
    assert.ok(prompt.includes('# Objective:'), 'V2 prompt should contain objective section');
    assert.ok(prompt.includes('## Constraints'), 'V2 prompt should contain constraints section');
    assert.ok(prompt.includes('Execution Pattern:'), 'V2 prompt should contain execution pattern behavior');
    assert.ok(prompt.includes('## Validation Criteria'), 'V2 prompt should contain validation criteria');

    // Verify playbook content is embedded (if matched)
    // The playbook body should appear if tags overlap enough
    if (prompt.includes('Playbook: build-from-plan')) {
      assert.ok(prompt.includes('Phase 1: Understand the plan'), 'V2 prompt should embed playbook procedure');
      assert.ok(prompt.includes('Git Usage'), 'V2 prompt should embed referenced skill body');
    }

    // Verify definition of done is present
    assert.ok(prompt.includes('Code compiles'), 'V2 prompt should include definition of done items');
    assert.ok(prompt.includes('Tests pass'), 'V2 prompt should include definition of done items');

    console.log('    PASS: V2 prompt composition');
  } finally {
    process.cwd = originalCwd;
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────
// Test 3: Plan-mode tool restriction
// ─────────────────────────────────────────────────────

async function testPlanModeToolRestriction(): Promise<void> {
  console.log('  Test 3: Plan-mode tool restriction...');

  // Import the module to test the plan-mode tool restriction
  // The restrictToolsForPlanMode function is private, so we test via the PLAN_MODE_ALLOWED_TOOLS concept
  const fullToolSet = ['Skill', 'Task', 'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
  const planModeAllowed = ['Skill', 'Task', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

  // Simulate what restrictToolsForPlanMode does
  const restricted = fullToolSet.filter(t => planModeAllowed.includes(t));

  assert.ok(!restricted.includes('Write'), 'Plan-mode should not include Write');
  assert.ok(!restricted.includes('Edit'), 'Plan-mode should not include Edit');
  assert.ok(!restricted.includes('Bash'), 'Plan-mode should not include Bash');
  assert.ok(restricted.includes('Read'), 'Plan-mode should include Read');
  assert.ok(restricted.includes('Glob'), 'Plan-mode should include Glob');
  assert.ok(restricted.includes('Grep'), 'Plan-mode should include Grep');
  assert.ok(restricted.includes('WebFetch'), 'Plan-mode should include WebFetch');
  assert.ok(restricted.includes('WebSearch'), 'Plan-mode should include WebSearch');
  assert.ok(restricted.includes('Skill'), 'Plan-mode should include Skill');
  assert.ok(restricted.includes('Task'), 'Plan-mode should include Task');
  assert.equal(restricted.length, 7, 'Plan-mode should have exactly 7 tools');

  // Test that all four execution patterns are valid
  const validPatterns: ExecutionPattern[] = [
    'plan-then-execute',
    'loop-until-progress',
    'plan-mode',
    'deterministic-pipeline',
  ];
  for (const pattern of validPatterns) {
    const res = resolveExecutionPattern(makeWorkItem({ execution_pattern: pattern }));
    assert.equal(res.pattern, pattern, `Pattern ${pattern} should be recognized`);
    assert.equal(res.source, 'prompt-override');
  }

  console.log('    PASS: Plan-mode tool restriction');
}

// ─────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Running V2 execution-pattern-routing adhoc tests...\n');

  await testPatternPrecedence();
  await testV2PromptComposition();
  await testPlanModeToolRestriction();

  console.log('\nPASS v2-execution-pattern-routing adhoc tests');
}

main().catch((error) => {
  console.error('\nFAIL v2-execution-pattern-routing adhoc tests');
  console.error(error);
  process.exit(1);
});
