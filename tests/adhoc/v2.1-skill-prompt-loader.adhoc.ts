/**
 * Adhoc test: skill-prompt-loader
 * Verifies that executive skill prompts load from .claude/skills/ and render variables.
 */

import { loadSkillPrompt } from '../../src/agentic/intelligence/skill-prompt-loader.js';

async function test() {
  console.log('=== Testing skill-prompt-loader ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Load email-triage skill
  try {
    const prompt = await loadSkillPrompt('email-triage', {
      AGENT_EMAIL: 'test@example.com',
      EMAIL_SUMMARIES: '[0] From: human@gmail.com\n    Subject: New goal\n    Body: Build me a todo app',
    });
    const ok = prompt.includes('test@example.com') && prompt.includes('human@gmail.com') && !prompt.includes('{{AGENT_EMAIL}}');
    if (!ok) throw new Error('Variable rendering failed');
    console.log(`  PASS: email-triage loaded (${prompt.length} chars, variables rendered)`);
    passed++;
  } catch (e) { console.log(`  FAIL: email-triage — ${e}`); failed++; }

  // Test 2: Load goal-breakdown skill
  try {
    const prompt = await loadSkillPrompt('goal-breakdown', {
      COMPLEXITY_ESTIMATE: '200',
      STEP_GUIDANCE: '5-15 steps',
      TURN_RANGE: '20-100',
      GOAL_TITLE: 'Build a dashboard',
      BUNDLE_CONTEXT: 'React + TypeScript dashboard with charts',
    });
    const ok = prompt.includes('Build a dashboard') && prompt.includes('5-15 steps') && !prompt.includes('{{GOAL_TITLE}}');
    if (!ok) throw new Error('Variable rendering failed');
    console.log(`  PASS: goal-breakdown loaded (${prompt.length} chars, variables rendered)`);
    passed++;
  } catch (e) { console.log(`  FAIL: goal-breakdown — ${e}`); failed++; }

  // Test 3: Load failure-diagnosis skill
  try {
    const prompt = await loadSkillPrompt('failure-diagnosis', {
      TASK_TITLE: 'Deploy app',
      TASK_DESCRIPTION: 'Deploy to production',
      ATTEMPTS: '5',
      LAST_ERROR: 'npm build failed',
      VALIDATION_REPORTS: 'Build exit code 1',
      WORKER_LOGS: 'Error: missing dependency',
    });
    const ok = prompt.includes('Deploy app') && prompt.includes('5') && !prompt.includes('{{TASK_TITLE}}');
    if (!ok) throw new Error('Variable rendering failed');
    console.log(`  PASS: failure-diagnosis loaded (${prompt.length} chars, variables rendered)`);
    passed++;
  } catch (e) { console.log(`  FAIL: failure-diagnosis — ${e}`); failed++; }

  // Test 4: Existing skills still loadable (work-selection)
  try {
    const prompt = await loadSkillPrompt('work-selection', {});
    const ok = prompt.includes('Work Selection') && prompt.length > 100;
    if (!ok) throw new Error('Skill content missing');
    console.log(`  PASS: work-selection (existing skill) loaded (${prompt.length} chars)`);
    passed++;
  } catch (e) { console.log(`  FAIL: work-selection — ${e}`); failed++; }

  // Test 5: Missing skill throws meaningful error
  try {
    await loadSkillPrompt('nonexistent-skill-xyz');
    console.log('  FAIL: should have thrown for missing skill');
    failed++;
  } catch (e: any) {
    if (e.message.includes('Executive skill not found')) {
      console.log(`  PASS: missing skill throws — "${e.message.slice(0, 70)}..."`);
      passed++;
    } else {
      console.log(`  FAIL: wrong error — ${e.message}`);
      failed++;
    }
  }

  // Test 6: Frontmatter is stripped (no --- block in output)
  try {
    const prompt = await loadSkillPrompt('email-triage', {
      AGENT_EMAIL: 'x@x.com',
      EMAIL_SUMMARIES: 'test',
    });
    const ok = !prompt.startsWith('---') && !prompt.includes('name: email-triage');
    if (!ok) throw new Error('YAML frontmatter leaked into prompt');
    console.log(`  PASS: frontmatter stripped from output`);
    passed++;
  } catch (e) { console.log(`  FAIL: frontmatter — ${e}`); failed++; }

  console.log(`\n${passed === 6 ? 'PASS' : 'FAIL'} v2.1-skill-prompt-loader: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

test();
