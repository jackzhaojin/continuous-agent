/**
 * I6 — Skill consultation verifier PASSes when a worker log shows ReadFile
 * against required SKILL.md paths, FAILs when it doesn't, and short-circuits
 * on Claude vendor.
 *
 * Run: npx tsx tests/adhoc/i6-skill-consultation-verifier.adhoc.ts
 */

import path from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { verifySkillConsultation } from '../../src/deterministic/verifiers/skill-consultation-verifier.ts';

const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');
const TODAY = new Date().toISOString().split('T')[0];
const DATE_DIR = path.join(LEDGERS_DIR, TODAY);

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

function writeFixture(contractId: string, vendor: string, requiredSkills: string[], logBody: string | null): string[] {
  mkdirSync(DATE_DIR, { recursive: true });
  const manifestPath = path.join(DATE_DIR, `worker-${contractId}.manifest.json`);
  writeFileSync(
    manifestPath,
    JSON.stringify({ contract_id: contractId, vendor, required_skills: requiredSkills, created_at: new Date().toISOString() }, null, 2),
    'utf-8',
  );
  const createdPaths = [manifestPath];
  if (logBody !== null) {
    const logPath = path.join(DATE_DIR, `worker-${contractId}.log`);
    writeFileSync(logPath, logBody, 'utf-8');
    createdPaths.push(logPath);
  }
  return createdPaths;
}

function cleanup(paths: string[]) {
  for (const p of paths) {
    if (existsSync(p)) rmSync(p, { force: true });
  }
}

async function main() {
  console.log('[I6] Skill consultation verifier\n');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // --- Case 1: Kimi PASS — log contains ReadFile + both required SKILL.md paths
  const c1 = `i6-test-kimi-pass-${suffix}`;
  const created1 = writeFixture(c1, 'kimi', ['web-testing', 'jack-git-commit'], [
    '[2026-04-18T00:00:00Z] [tool_call] ReadFile path=.claude/skills/web-testing/SKILL.md',
    '[2026-04-18T00:00:01Z] [tool_call] ReadFile path=.claude/skills/jack-git-commit/SKILL.md',
  ].join('\n'));
  try {
    console.log('[1] Kimi — both skills consulted');
    const r1 = await verifySkillConsultation({ contract_id: c1 });
    assert(r1.result === 'PASS', `PASS when both read (got ${r1.result}: ${r1.message})`);
    assert(Array.isArray((r1.evidence as any).consulted) && (r1.evidence as any).consulted.length === 2, 'consulted list has both skills');
  } finally {
    cleanup(created1);
  }

  // --- Case 2: Kimi FAIL — log contains only one of the required SKILL.md paths
  const c2 = `i6-test-kimi-fail-${suffix}`;
  const created2 = writeFixture(c2, 'kimi', ['web-testing', 'jack-git-commit'], [
    '[2026-04-18T00:00:00Z] [tool_call] ReadFile path=.claude/skills/web-testing/SKILL.md',
    '[2026-04-18T00:00:01Z] wrote component',
  ].join('\n'));
  try {
    console.log('\n[2] Kimi — missing jack-git-commit ReadFile');
    const r2 = await verifySkillConsultation({ contract_id: c2 });
    assert(r2.result === 'FAIL', `FAIL when a required skill is unread (got ${r2.result})`);
    assert((r2.evidence as any).missing?.includes('jack-git-commit'), 'missing list names jack-git-commit');
    assert(!(r2.evidence as any).missing?.includes('web-testing'), 'web-testing not in missing list');
  } finally {
    cleanup(created2);
  }

  // --- Case 3: Codex PASS — uses `read_file` token and path appears on same log
  const c3 = `i6-test-codex-pass-${suffix}`;
  const created3 = writeFixture(c3, 'codex', ['backend-testing'], [
    '[2026-04-18T00:00:00Z] [tool_call] read_file {"path":".claude/skills/backend-testing/SKILL.md"}',
  ].join('\n'));
  try {
    console.log('\n[3] Codex — read_file token recognized');
    const r3 = await verifySkillConsultation({ contract_id: c3 });
    assert(r3.result === 'PASS', `Codex PASS with read_file token (got ${r3.result}: ${r3.message})`);
  } finally {
    cleanup(created3);
  }

  // --- Case 4: Claude short-circuit PASS — SDK lazy-loads, no ReadFile observable
  const c4 = `i6-test-claude-shortcircuit-${suffix}`;
  const created4 = writeFixture(c4, 'claude', ['web-testing'], '(no ReadFile, Claude uses SDK Skill tool)');
  try {
    console.log('\n[4] Claude — verifier short-circuits to PASS');
    const r4 = await verifySkillConsultation({ contract_id: c4 });
    assert(r4.result === 'PASS', `Claude short-circuits to PASS (got ${r4.result})`);
    assert(/SDK.*auto-discovery|lazy/i.test(r4.message), 'message explains SDK bypass');
  } finally {
    cleanup(created4);
  }

  // --- Case 5: No manifest — verifier PASSes (nothing declared required)
  console.log('\n[5] No manifest — verifier skips gracefully');
  const r5 = await verifySkillConsultation({ contract_id: `no-such-contract-${suffix}` });
  assert(r5.result === 'PASS', `no-manifest PASS (got ${r5.result}: ${r5.message})`);

  // --- Case 6: Kimi, manifest present, but log file missing entirely
  const c6 = `i6-test-kimi-nolog-${suffix}`;
  const created6 = writeFixture(c6, 'kimi', ['web-testing'], null);
  try {
    console.log('\n[6] Kimi — manifest present but worker log missing');
    const r6 = await verifySkillConsultation({ contract_id: c6 });
    assert(r6.result === 'FAIL', `FAIL when log missing (got ${r6.result})`);
    assert(/log missing/i.test(r6.message), 'message mentions missing log');
  } finally {
    cleanup(created6);
  }

  // --- Case 7: Path mention without any Read token should still FAIL
  const c7 = `i6-test-path-without-readtoken-${suffix}`;
  const created7 = writeFixture(c7, 'kimi', ['web-testing'], [
    '[2026-04-18T00:00:00Z] worker prose mentioned .claude/skills/web-testing/SKILL.md but never opened it',
  ].join('\n'));
  try {
    console.log('\n[7] Kimi — path name-drop without Read token → FAIL');
    const r7 = await verifySkillConsultation({ contract_id: c7 });
    assert(r7.result === 'FAIL', `FAIL when path mentioned but no Read token (got ${r7.result})`);
  } finally {
    cleanup(created7);
  }

  console.log('');
  if (failures > 0) {
    console.error(`[I6] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I6] all assertions passed');
  }
}

main().catch((err) => {
  console.error('[I6] uncaught error:', err);
  process.exit(1);
});
