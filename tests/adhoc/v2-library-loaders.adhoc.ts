import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadSkillLibrary } from '../../src/deterministic/skill-loader.js';
import { loadPlaybookLibrary } from '../../src/deterministic/playbook-loader.js';

async function createSkillFile(root: string, relativeDir: string, content: string): Promise<void> {
  const dir = path.join(root, relativeDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), content, 'utf8');
}

async function testSkillLoaderValidAndForbidden(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-'));

  try {
    await createSkillFile(
      root,
      'git',
      `---
name: git
version: 1.0.0
category: skill
description: Git helper
tags: [git]
track_record:
  total_executions: 2
  successes: 2
  failures: 0
  last_executed: "2026-03-29T00:00:00Z"
  confidence: 20
  maturity: Emerging
---
# Git skill
`
    );

    await createSkillFile(
      root,
      'bad-skill',
      `---
name: invalid
category: skill
context_requires: [repo]
---
# invalid
`
    );

    const result = await loadSkillLibrary(root);
    assert.equal(result.skills.length, 1, 'only valid skills should load');
    assert.equal(result.skills[0].name, 'git');
    assert.equal(result.warnings.length, 1, 'forbidden field should produce warning');
    assert.match(result.warnings[0].code, /SKILL_FORBIDDEN_FIELDS/);

    let strictThrew = false;
    try {
      await loadSkillLibrary(root, { strict: true });
    } catch {
      strictThrew = true;
    }
    assert.equal(strictThrew, true, 'strict mode should throw on warnings');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testPlaybookLoaderPatternsAndStrictMode(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'playbooks-'));

  try {
    await createSkillFile(
      root,
      'worker/build-from-plan',
      `---
name: build-from-plan
version: 1.0.0
category: worker
description: Build plan implementation flow
goal: Ship implementation from a plan
context_requires:
  - plan_document: "A structured plan with phases and acceptance criteria"
  - project_type: "nextjs | rust | python"
  - output_path: "Target directory"
context_optional:
  - existing_codebase: "Path to existing codebase"
composes_skills: [git, bash]
execution_pattern: loop-until-progress
tags: [worker]
track_record:
  total_executions: 3
  successes: 2
  failures: 1
  last_executed: null
  confidence: 10
  maturity: Emerging
---
# Playbook
`
    );

    await createSkillFile(
      root,
      'bad-category',
      `---
name: bad
category: skill
execution_pattern: plan-then-execute
---
# bad
`
    );

    await createSkillFile(
      root,
      'invalid-pattern',
      `---
name: invalid-pattern
category: domain
execution_pattern: unknown-pattern
---
# invalid pattern fallback
`
    );

    const result = await loadPlaybookLibrary(root);
    assert.equal(result.playbooks.length, 1, 'only valid playbooks should load');

    const valid = result.playbooks.find((p) => p.name === 'build-from-plan');
    assert.ok(valid, 'expected build-from-plan playbook');
    assert.equal(valid?.execution_pattern, 'loop-until-progress');
    assert.deepEqual(valid?.context_requires[0], {
      plan_document: 'A structured plan with phases and acceptance criteria',
    });
    assert.deepEqual(valid?.context_optional[0], {
      existing_codebase: 'Path to existing codebase',
    });
    assert.equal(valid?.category, 'worker');

    const fallback = result.playbooks.find((p) => p.name === 'invalid-pattern');
    assert.equal(fallback, undefined, 'invalid execution pattern should be skipped');

    assert.equal(result.warnings.length, 2, 'invalid category and pattern should produce warnings');
    assert.match(result.warnings[0].code, /PLAYBOOK_CATEGORY_INVALID/);
    assert.match(result.warnings[1].code, /PLAYBOOK_EXECUTION_PATTERN_INVALID/);

    let strictThrew = false;
    try {
      await loadPlaybookLibrary(root, { strict: true });
    } catch {
      strictThrew = true;
    }
    assert.equal(strictThrew, true, 'strict mode should throw on warnings');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testSkillLoaderValidAndForbidden();
  await testPlaybookLoaderPatternsAndStrictMode();
  console.log('PASS v2-library-loaders adhoc tests');
}

main().catch((error) => {
  console.error('FAIL v2-library-loaders adhoc tests');
  console.error(error);
  process.exit(1);
});
