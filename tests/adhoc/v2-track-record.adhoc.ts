import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

import {
  updateTrackRecord,
  updateSkillAndPlaybookRecords,
  generateCapabilitySummary,
} from '../../src/deterministic/skill-updater.js';

// ── Helpers ────────────────────────────────────────────────────────────

async function createSkillFile(root: string, relativeDir: string, content: string): Promise<string> {
  const dir = path.join(root, relativeDir);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'SKILL.md');
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

async function readFrontmatter(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return (yaml.load(match[1]) as Record<string, unknown>) ?? {};
}

async function readBody(filePath: string): Promise<string> {
  const raw = await readFile(filePath, 'utf-8');
  const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1] : raw;
}

// ── Tests ──────────────────────────────────────────────────────────────

async function testConfidencePassIncrement(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-pass-'));
  try {
    const filePath = await createSkillFile(root, 'git', `---
name: git
category: skill
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  last_executed: null
  confidence: 50
  maturity: Declared
---
# Git skill body
`);

    const result = await updateTrackRecord(filePath, true);
    assert.equal(result.after.confidence, 60, 'confidence should increase by 10 on PASS');
    assert.equal(result.after.total_executions, 1);
    assert.equal(result.after.successes, 1);
    assert.equal(result.after.failures, 0);
    assert.equal(result.before.confidence, 50);
    console.log('  PASS: testConfidencePassIncrement');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testConfidenceFailDecrement(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-fail-'));
  try {
    const filePath = await createSkillFile(root, 'bash', `---
name: bash
category: skill
track_record:
  total_executions: 5
  successes: 3
  failures: 2
  last_executed: null
  confidence: 40
  maturity: Demonstrated
---
# Bash skill
`);

    const result = await updateTrackRecord(filePath, false);
    assert.equal(result.after.confidence, 25, 'confidence should decrease by 15 on FAIL');
    assert.equal(result.after.failures, 3);
    console.log('  PASS: testConfidenceFailDecrement');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testConfidenceCappedAt100(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-cap100-'));
  try {
    const filePath = await createSkillFile(root, 'node', `---
name: node
category: skill
track_record:
  total_executions: 10
  successes: 10
  failures: 0
  last_executed: null
  confidence: 95
  maturity: Reliable
---
# Node
`);

    const result = await updateTrackRecord(filePath, true);
    assert.equal(result.after.confidence, 100, 'confidence should cap at 100');
    console.log('  PASS: testConfidenceCappedAt100');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testConfidenceFlooredAt0(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-floor0-'));
  try {
    const filePath = await createSkillFile(root, 'docker', `---
name: docker
category: skill
track_record:
  total_executions: 3
  successes: 0
  failures: 3
  last_executed: null
  confidence: 10
  maturity: Declared
---
# Docker
`);

    const result = await updateTrackRecord(filePath, false);
    assert.equal(result.after.confidence, 0, 'confidence should floor at 0');
    console.log('  PASS: testConfidenceFlooredAt0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testMaturityDeclaredToDemonstrated(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-mat1-'));
  try {
    const filePath = await createSkillFile(root, 'k8s', `---
name: k8s
category: skill
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  last_executed: null
  confidence: 0
  maturity: Declared
---
# K8s
`);

    const result = await updateTrackRecord(filePath, true);
    assert.equal(result.after.maturity, 'Demonstrated', 'first PASS should move to Demonstrated');
    console.log('  PASS: testMaturityDeclaredToDemonstrated');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testMaturityDemonstratedToReliable(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-mat2-'));
  try {
    // 2 successes, 0 failures. One more PASS should get to 3 successes / 3 total = Reliable
    const filePath = await createSkillFile(root, 'api', `---
name: api
category: skill
track_record:
  total_executions: 2
  successes: 2
  failures: 0
  last_executed: null
  confidence: 20
  maturity: Demonstrated
---
# API
`);

    const result = await updateTrackRecord(filePath, true);
    assert.equal(result.after.maturity, 'Reliable', '>=3 successes with <20% failure rate should be Reliable');
    assert.equal(result.after.successes, 3);
    console.log('  PASS: testMaturityDemonstratedToReliable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testMaturityRegression(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-mat3-'));
  try {
    // 3 successes, 0 failures = Reliable. Add a failure -> 3/4 = 25% failure rate >= 20%
    // But 3 successes still >= 3 and failure rate 25% >= 20%, so NOT Reliable
    // But successes >= 1 so Demonstrated
    const filePath = await createSkillFile(root, 'deploy', `---
name: deploy
category: skill
track_record:
  total_executions: 3
  successes: 3
  failures: 0
  last_executed: null
  confidence: 50
  maturity: Reliable
---
# Deploy
`);

    const result = await updateTrackRecord(filePath, false);
    assert.equal(result.after.maturity, 'Demonstrated', 'high failure rate should regress from Reliable');
    console.log('  PASS: testMaturityRegression');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testReviewNeededAfter3ConsecutiveFailures(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-review-'));
  try {
    const filePath = await createSkillFile(root, 'fragile', `---
name: fragile
category: skill
track_record:
  total_executions: 5
  successes: 3
  failures: 2
  last_executed: null
  confidence: 50
  maturity: Demonstrated
---
# Fragile skill
`);

    // Fail 1
    let result = await updateTrackRecord(filePath, false);
    assert.equal(result.reviewNeeded, false, 'one failure should not trigger review');

    // Fail 2
    result = await updateTrackRecord(filePath, false);
    assert.equal(result.reviewNeeded, false, 'two failures should not trigger review');

    // Fail 3
    result = await updateTrackRecord(filePath, false);
    assert.equal(result.reviewNeeded, true, 'three consecutive failures should trigger review');

    // Verify review_needed is written to frontmatter
    const fm = await readFrontmatter(filePath);
    assert.equal(fm.review_needed, true, 'review_needed should be persisted in frontmatter');

    // A PASS should clear it
    result = await updateTrackRecord(filePath, true);
    assert.equal(result.reviewNeeded, false, 'PASS should clear review_needed');
    const fm2 = await readFrontmatter(filePath);
    assert.equal(fm2.review_needed, undefined, 'review_needed should be removed from frontmatter on PASS');

    console.log('  PASS: testReviewNeededAfter3ConsecutiveFailures');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testBodyPreserved(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-body-'));
  try {
    const bodyContent = `# My Skill

This is a detailed skill body with:
- Lists
- **Bold text**
- Code blocks

\`\`\`typescript
const x = 1;
\`\`\`

End of body.
`;
    const filePath = await createSkillFile(root, 'preserve', `---
name: preserve-test
category: skill
description: Test body preservation
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  confidence: 0
  maturity: Declared
---
${bodyContent}`);

    await updateTrackRecord(filePath, true);
    const afterBody = await readBody(filePath);
    assert.equal(afterBody, bodyContent, 'body content should be preserved exactly');
    console.log('  PASS: testBodyPreserved');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testDualLibraryUpdate(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-dual-'));
  const skillsDir = path.join(root, 'skills');
  const playbooksDir = path.join(root, 'playbooks');

  try {
    await createSkillFile(skillsDir, 'git', `---
name: git
category: skill
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  confidence: 0
  maturity: Declared
---
# Git
`);

    await createSkillFile(skillsDir, 'bash', `---
name: bash
category: skill
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  confidence: 0
  maturity: Declared
---
# Bash
`);

    await createSkillFile(playbooksDir, 'build-app', `---
name: build-app
category: worker
description: Build an app
goal: Ship it
execution_pattern: plan-then-execute
track_record:
  total_executions: 0
  successes: 0
  failures: 0
  confidence: 0
  maturity: Declared
---
# Build App playbook
`);

    const updates = await updateSkillAndPlaybookRecords(
      ['git', 'bash'],
      'build-app',
      true,
      { skillsDir, playbooksDir }
    );

    assert.equal(updates.length, 3, 'should update 2 skills + 1 playbook');
    for (const update of updates) {
      assert.equal(update.after.confidence, 10, 'each should get +10 confidence');
      assert.equal(update.after.successes, 1);
      assert.equal(update.after.maturity, 'Demonstrated');
    }

    console.log('  PASS: testDualLibraryUpdate');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testSummaryGeneration(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-summary-'));
  const skillsDir = path.join(root, 'skills');
  const playbooksDir = path.join(root, 'playbooks');
  const outputPath = path.join(root, 'capabilities', 'summary.yml');

  try {
    await createSkillFile(skillsDir, 'git', `---
name: git
category: skill
track_record:
  total_executions: 5
  successes: 4
  failures: 1
  last_executed: "2026-03-29T00:00:00Z"
  confidence: 40
  maturity: Reliable
---
# Git
`);

    await createSkillFile(playbooksDir, 'deploy', `---
name: deploy
category: worker
description: Deploy
goal: Deploy it
execution_pattern: loop-until-progress
track_record:
  total_executions: 2
  successes: 1
  failures: 1
  last_executed: "2026-03-28T00:00:00Z"
  confidence: 10
  maturity: Demonstrated
---
# Deploy
`);

    const entries = await generateCapabilitySummary({
      skillsDir,
      playbooksDir,
      outputPath,
    });

    assert.equal(entries.length, 2, 'should have 2 entries');

    const gitEntry = entries.find((e) => e.name === 'git');
    assert.ok(gitEntry, 'should have git entry');
    assert.equal(gitEntry?.type, 'skill');
    assert.equal(gitEntry?.confidence, 40);
    assert.equal(gitEntry?.maturity, 'Reliable');

    const deployEntry = entries.find((e) => e.name === 'deploy');
    assert.ok(deployEntry, 'should have deploy entry');
    assert.equal(deployEntry?.type, 'playbook');
    assert.equal(deployEntry?.category, 'worker');

    // Verify the file was written
    const fileContent = await readFile(outputPath, 'utf-8');
    const parsed = yaml.load(fileContent) as Record<string, unknown>;
    assert.ok(Array.isArray((parsed as Record<string, unknown>).capabilities), 'summary file should have capabilities array');

    console.log('  PASS: testSummaryGeneration');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testMissingSkillGraceful(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tr-missing-'));
  const skillsDir = path.join(root, 'skills');
  const playbooksDir = path.join(root, 'playbooks');

  try {
    await mkdir(skillsDir, { recursive: true });
    await mkdir(playbooksDir, { recursive: true });

    // Should not throw when skills/playbooks don't exist
    const updates = await updateSkillAndPlaybookRecords(
      ['nonexistent'],
      'also-nonexistent',
      true,
      { skillsDir, playbooksDir }
    );

    assert.equal(updates.length, 0, 'should return empty updates for missing skills');
    console.log('  PASS: testMissingSkillGraceful');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ── Runner ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Running v2-track-record adhoc tests...\n');

  await testConfidencePassIncrement();
  await testConfidenceFailDecrement();
  await testConfidenceCappedAt100();
  await testConfidenceFlooredAt0();
  await testMaturityDeclaredToDemonstrated();
  await testMaturityDemonstratedToReliable();
  await testMaturityRegression();
  await testReviewNeededAfter3ConsecutiveFailures();
  await testBodyPreserved();
  await testDualLibraryUpdate();
  await testSummaryGeneration();
  await testMissingSkillGraceful();

  console.log('\nPASS v2-track-record adhoc tests');
}

main().catch((error) => {
  console.error('\nFAIL v2-track-record adhoc tests');
  console.error(error);
  process.exit(1);
});
