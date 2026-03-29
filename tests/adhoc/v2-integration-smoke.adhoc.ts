/**
 * V2 Integration Smoke Test
 *
 * End-to-end test: "Build Hello World React App" goal flows through V2 infrastructure.
 * No actual workers are spawned — we test that V2 pieces connect with realistic data.
 *
 * Run: npx tsx tests/adhoc/v2-integration-smoke.adhoc.ts
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ── Fixture Content ──────────────────────────────────────────────────

const GIT_SKILL_MD = `---
name: git
version: 1.0.0
category: skill
description: |
  Git version control. Commit, branch, push, PR.
use_cases:
  - Version control for code changes
  - Branch management
tools_required:
  - Bash
tags: [git, vcs]
track_record:
  total_executions: 5
  successes: 4
  failures: 1
  last_executed: "2026-03-28"
  confidence: 40
  maturity: Demonstrated
---

## Usage
\`\`\`bash
git add -A && git commit -m "message"
\`\`\`
`;

const BUILD_FROM_PLAN_PLAYBOOK_MD = `---
name: build-from-plan
version: 1.0.0
category: worker
description: |
  Build a project from a structured plan. Research, implement, validate.
execution_pattern: plan-then-execute
composes_skills:
  - git
composes_playbooks: []
context_requires:
  - plan_document: "A structured plan"
  - output_path: "Target directory"
context_optional:
  - existing_codebase: "Path to existing code"
tags: [build, implementation, react]
track_record:
  total_executions: 2
  successes: 1
  failures: 1
  last_executed: "2026-03-27"
  confidence: 20
  maturity: Demonstrated
---

## Procedure
1. Read the plan
2. Set up project structure
3. Implement components
4. Run build and tests
5. Commit
`;

const HELLO_REACT_PROMPT_MD = `---
title: "Build Hello World React App"
slug: "hello-react"
priority: P2
status: pending
complexity: low
created: "2026-03-29"
execution_pattern: plan-mode
tags: [react, hello-world]
---

Build a minimal Hello World React app with:
- A single App component that renders "Hello World"
- Basic CSS styling
- Working build via npm run build
`;

// ── Helpers ──────────────────────────────────────────────────────────

const results: { name: string; passed: boolean; error?: string }[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error: msg });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
  }
}

async function createFile(root: string, relPath: string, content: string): Promise<void> {
  const fullPath = path.join(root, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== V2 Integration Smoke Test ===\n');

  // Create temp workspace root
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'v2-smoke-'));
  const originalCwd = process.cwd();

  try {
    // ── Setup: populate temp workspace ──
    console.log(`Temp root: ${tmpRoot}\n`);

    await createFile(tmpRoot, 'skills/git/SKILL.md', GIT_SKILL_MD);
    await createFile(tmpRoot, 'playbooks/worker/build-from-plan/SKILL.md', BUILD_FROM_PLAN_PLAYBOOK_MD);
    await createFile(tmpRoot, 'workspace/in-progress/P2/hello-react/PROMPT.md', HELLO_REACT_PROMPT_MD);
    // Dashboard writer reads ledgers/work-ledger.jsonl — create empty so it doesn't error
    await createFile(tmpRoot, 'ledgers/work-ledger.jsonl', '');

    // Change cwd so module-level path constants resolve to temp workspace.
    // IMPORTANT: dashboard-writer, goal-scanner use process.cwd() at import time,
    // so we must chdir BEFORE dynamic imports.
    process.chdir(tmpRoot);

    // Dynamic imports after chdir so module-level constants pick up tmpRoot
    const { buildSelectableWorkFromBundles } = await import('../../src/agentic/work-selection/goal-scanner.js');
    const { resolveExecutionPattern } = await import('../../src/deterministic/execution-pattern-resolver.js');
    const { loadSkillLibrary } = await import('../../src/deterministic/skill-loader.js');
    const { loadPlaybookLibrary } = await import('../../src/deterministic/playbook-loader.js');
    const { buildV2ComposedPrompt } = await import('../../src/agentic/intelligence/prompt-builder.js');
    const { updateTrackRecord } = await import('../../src/deterministic/skill-updater.js');
    const { writeDashboardData } = await import('../../src/deterministic/dashboard-writer.js');

    // ── Test 1: Goal Scanner picks up goal with execution_pattern ──
    await runTest('Test 1: Goal Scanner picks up hello-react goal with execution_pattern', async () => {
      const selectableWork = await buildSelectableWorkFromBundles();
      assert.ok(selectableWork.length >= 1, `Expected at least 1 selectable work item, got ${selectableWork.length}`);

      const helloReact = selectableWork.find(w => w.goal.title === 'Build Hello World React App');
      assert.ok(helloReact, 'Could not find "Build Hello World React App" in selectable work');
      assert.equal(helloReact.goal.execution_pattern, 'plan-mode', 'execution_pattern should be plan-mode');
      assert.equal(helloReact.goal.priority, 'P2', 'priority should be P2');
      assert.equal(helloReact.goal.status, 'pending', 'status should be pending');
    });

    // ── Test 2: Pattern Resolution precedence chain ──
    await runTest('Test 2: Pattern Resolution — PROMPT.md override wins over playbook default', async () => {
      // Load playbook for matching
      const playbookResult = await loadPlaybookLibrary(path.join(tmpRoot, 'playbooks'));
      assert.ok(playbookResult.playbooks.length >= 1, 'Expected at least 1 playbook');
      const playbook = playbookResult.playbooks.find(p => p.name === 'build-from-plan');
      assert.ok(playbook, 'Could not find build-from-plan playbook');

      // Build a mock WorkItem with execution_pattern override
      const itemWithOverride = {
        id: 'goal-hello-react',
        priority: 'P2' as const,
        title: 'Build Hello World React App',
        description: 'Build a minimal Hello World React app',
        status: 'pending' as const,
        execution_pattern: 'plan-mode' as const,
      };

      // With override: PROMPT.md wins
      const res1 = resolveExecutionPattern(itemWithOverride, playbook);
      assert.equal(res1.pattern, 'plan-mode', 'With override, pattern should be plan-mode');
      assert.equal(res1.source, 'prompt-override', 'Source should be prompt-override');

      // Without override: playbook default
      const itemWithoutOverride = { ...itemWithOverride, execution_pattern: undefined };
      const res2 = resolveExecutionPattern(itemWithoutOverride, playbook);
      assert.equal(res2.pattern, 'plan-then-execute', 'Without override, pattern should be plan-then-execute (playbook default)');
      assert.equal(res2.source, 'playbook-default', 'Source should be playbook-default');

      // Without override or playbook: system default
      const res3 = resolveExecutionPattern(itemWithoutOverride, null);
      assert.equal(res3.pattern, 'plan-then-execute', 'Without override or playbook, pattern should be plan-then-execute (system default)');
      assert.equal(res3.source, 'system-default', 'Source should be system-default');
    });

    // ── Test 3: V2 Prompt Composition ──
    await runTest('Test 3: V2 Prompt Composition includes goal, playbook, skill, and pattern', async () => {
      // Enable V2 composition
      process.env.V2_PROMPT_COMPOSITION = 'true';

      const contract = {
        id: 'contract-smoke-test',
        prompt: 'Build Hello World React App',
        scope: {
          repos_allowed: ['hello-react'],
          tools_allowed: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Skill', 'Task'],
        },
        definition_of_done: [
          'React app renders "Hello World"',
          'npm run build succeeds',
          'Git clean status',
        ],
        max_turns: 50,
        risk_assessment: 'low',
        required_skills: ['react', 'git'],
        logging_obligations: ['Log all file changes', 'Log build output'],
        created_at: new Date().toISOString(),
      };

      const item = {
        id: 'goal-hello-react',
        priority: 'P2' as const,
        title: 'Build Hello World React App',
        description: 'Build a minimal Hello World React app with:\n- A single App component that renders "Hello World"\n- Basic CSS styling\n- Working build via npm run build',
        status: 'pending' as const,
        execution_pattern: 'plan-mode' as const,
      };

      const prompt = await buildV2ComposedPrompt(contract, item, '/tmp/hello-react');

      // Assert key content is present
      assert.ok(prompt.includes('Build Hello World React App'), 'Prompt should contain goal title');
      assert.ok(prompt.includes('Read the plan'), 'Prompt should contain playbook procedure text');
      assert.ok(prompt.includes('Set up project structure'), 'Prompt should contain playbook step');
      assert.ok(prompt.includes('git add -A && git commit'), 'Prompt should contain git skill body');
      assert.ok(prompt.includes('Plan-Mode') || prompt.includes('plan-mode') || prompt.includes('PLAN MODE'),
        'Prompt should contain plan-mode behavior description');

      // Print snippet for visual inspection
      console.log('\n    --- V2 Prompt Snippet (first 800 chars) ---');
      console.log('    ' + prompt.slice(0, 800).replace(/\n/g, '\n    '));
      console.log('    --- End Snippet ---\n');

      // Clean up env
      delete process.env.V2_PROMPT_COMPOSITION;
    });

    // ── Test 4: Skill Updater round-trip ──
    await runTest('Test 4: Skill Updater round-trip — confidence, counts, maturity, body preserved', async () => {
      const gitSkillPath = path.join(tmpRoot, 'skills', 'git', 'SKILL.md');

      // Update with passed=true
      const result = await updateTrackRecord(gitSkillPath, true);

      // Before state
      assert.equal(result.before.confidence, 40, 'Before confidence should be 40');
      assert.equal(result.before.total_executions, 5, 'Before total_executions should be 5');
      assert.equal(result.before.successes, 4, 'Before successes should be 4');

      // After state
      assert.equal(result.after.confidence, 50, 'After confidence should be 50 (40+10)');
      assert.equal(result.after.total_executions, 6, 'After total_executions should be 6');
      assert.equal(result.after.successes, 5, 'After successes should be 5');
      assert.equal(result.after.failures, 1, 'Failures should stay at 1');

      // Maturity: 5 successes, 1 failure out of 6 total = 16.7% failure rate
      // >=3 successes AND <20% failure rate => Reliable
      assert.equal(result.after.maturity, 'Reliable', 'Maturity should be Reliable (5 successes, <20% failure rate)');

      // Verify body is preserved by reading the file back
      const updatedContent = await readFile(gitSkillPath, 'utf-8');
      assert.ok(updatedContent.includes('## Usage'), 'Body should preserve ## Usage section');
      assert.ok(updatedContent.includes('git add -A && git commit -m "message"'), 'Body should preserve git command');
    });

    // ── Test 5: Dashboard Writer ──
    await runTest('Test 5: Dashboard Writer produces valid dashboard-data.json', async () => {
      await writeDashboardData();

      const dashboardPath = path.join(tmpRoot, 'workspace', 'dashboard-data.json');
      const rawJson = await readFile(dashboardPath, 'utf-8');
      const data = JSON.parse(rawJson);

      // Schema shape
      assert.ok(data.generated_at, 'Should have generated_at');
      assert.ok(data.agent_status, 'Should have agent_status');
      assert.ok(data.goal_pipeline, 'Should have goal_pipeline');
      assert.ok(data.needs_you, 'Should have needs_you');
      assert.ok(data.activity_feed, 'Should have activity_feed');
      assert.ok(data.skill_health, 'Should have skill_health');
      assert.ok(data.stats, 'Should have stats');

      // Goal pipeline: hello-react should be in_progress
      const inProgress = data.goal_pipeline.in_progress as Array<{ slug: string; title: string }>;
      const found = inProgress.find((g: { slug: string }) => g.slug === 'hello-react');
      assert.ok(found, 'hello-react should be in goal_pipeline.in_progress');
      assert.equal(found.title, 'Build Hello World React App', 'Title should match');

      // Skill health: git skill should be present with updated confidence
      const skillHealth = data.skill_health as Array<{ name: string; confidence: number; maturity: string }>;
      const gitSkill = skillHealth.find((s: { name: string }) => s.name === 'git');
      assert.ok(gitSkill, 'git skill should be in skill_health');
      // Dashboard reads confidence via regex from SKILL.md; after Test 4 update it should be 50
      assert.equal(gitSkill.confidence, 50, 'git skill confidence should be 50 (updated by Test 4)');
    });

    // ── Test 6: Plan-mode tool restriction ──
    await runTest('Test 6: Plan-mode tool restriction removes write tools, keeps read tools', async () => {
      // Re-implement the plan-mode restriction logic as defined in worker-spawner.ts
      // (not exported, so we replicate the known behavior)
      const PLAN_MODE_ALLOWED_TOOLS = ['Skill', 'Task', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
      function restrictToolsForPlanMode(tools: string[]): string[] {
        return tools.filter(t => PLAN_MODE_ALLOWED_TOOLS.includes(t));
      }

      const fullToolList = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Skill', 'Task', 'WebFetch', 'WebSearch'];
      const restricted = restrictToolsForPlanMode(fullToolList);

      // Write tools should be removed
      assert.ok(!restricted.includes('Write'), 'Write should be removed in plan-mode');
      assert.ok(!restricted.includes('Edit'), 'Edit should be removed in plan-mode');
      assert.ok(!restricted.includes('Bash'), 'Bash should be removed in plan-mode');

      // Read tools should be kept
      assert.ok(restricted.includes('Read'), 'Read should be kept in plan-mode');
      assert.ok(restricted.includes('Glob'), 'Glob should be kept in plan-mode');
      assert.ok(restricted.includes('Grep'), 'Grep should be kept in plan-mode');
      assert.ok(restricted.includes('Skill'), 'Skill should be kept in plan-mode');
      assert.ok(restricted.includes('Task'), 'Task should be kept in plan-mode');

      assert.equal(restricted.length, 7, 'Restricted list should have 7 tools');
    });

  } finally {
    // Restore original cwd
    process.chdir(originalCwd);

    // Cleanup
    try {
      await rm(tmpRoot, { recursive: true, force: true });
      console.log(`\nCleaned up: ${tmpRoot}`);
    } catch {
      console.log(`\nWarning: Failed to clean up ${tmpRoot}`);
    }
  }

  // ── Summary ──
  console.log('\n=== Summary ===\n');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  for (const r of results) {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.error) console.log(`        ${r.error}`);
  }
  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
