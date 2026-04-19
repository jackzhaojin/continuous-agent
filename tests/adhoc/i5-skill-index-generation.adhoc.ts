/**
 * I5 — Worker-base contains a manual index of every skill on disk.
 *
 * v2.4.1 reverted the runtime-generated INDEX manifest. The decision about which
 * skills exist and what they do is authored by hand inside `worker-base/SKILL.md`
 * (under "Worker Skill Index"). This test keeps the manual list honest: every
 * SKILL.md directory under `claude-files-to-output/skills/` must have exactly
 * one corresponding `.claude/skills/<dir>/SKILL.md` row in worker-base.
 *
 * Also enforces worker-base stays under the line-count ceiling so the index
 * doesn't silently push it past reasonable size.
 *
 * Run: npx tsx tests/adhoc/i5-skill-index-generation.adhoc.ts
 */

import path from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import { loadSkillLibrary } from '../../src/deterministic/skill-loader.ts';

const SKILLS_ROOT = path.join(process.cwd(), 'claude-files-to-output', 'skills');
const WORKER_BASE_PATH = path.join(SKILLS_ROOT, 'worker-base', 'SKILL.md');
const WORKER_BASE_CEILING = 260; // v2.4.1 success criterion 5 — raised from 250 to 260 after the manual index landed

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

function listSkillDirs(): string[] {
  return readdirSync(SKILLS_ROOT)
    .filter((name) => {
      const full = path.join(SKILLS_ROOT, name);
      if (!statSync(full).isDirectory()) return false;
      try {
        statSync(path.join(full, 'SKILL.md'));
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}

async function main() {
  console.log('[I5] Manual worker-base skill index integrity\n');

  const workerBase = readFileSync(WORKER_BASE_PATH, 'utf-8');
  const dirs = listSkillDirs();

  console.log(`[1] Skill directories on disk: ${dirs.length}`);
  assert(dirs.length >= 15, `at least 15 skill dirs (got ${dirs.length}: ${dirs.join(', ')})`);
  assert(dirs.includes('worker-base'), 'worker-base directory present');
  assert(dirs.includes('eds-content-driven-development'), 'eds-content-driven-development imported');
  assert(dirs.includes('eds-building-blocks'), 'eds-building-blocks imported');

  console.log('\n[2] worker-base carries the manual Worker Skill Index header');
  assert(workerBase.includes('## MANDATORY: Skill Consultation Before Code'), 'has MANDATORY directive');
  assert(workerBase.includes('### Worker Skill Index'), 'has Worker Skill Index subsection');
  assert(workerBase.includes('### Which skill applies to which step'), 'has decision-table subsection');
  assert(workerBase.includes('| Path | What it covers |'), 'Worker Skill Index has the expected table header');

  console.log('\n[3] Every on-disk skill has a row in the Worker Skill Index');
  for (const dir of dirs) {
    const pathToken = `.claude/skills/${dir}/SKILL.md`;
    assert(workerBase.includes(pathToken), `index lists ${dir}`);
  }

  console.log('\n[4] Loader sees the full library cleanly');
  const { skills, warnings } = await loadSkillLibrary(SKILLS_ROOT);
  assert(warnings.length === 0, `no loader warnings (got ${warnings.length})`);
  assert(skills.length === dirs.length, `loader skill count matches directory count (loader=${skills.length}, dirs=${dirs.length})`);

  console.log('\n[5] No row in worker-base points at a skill that no longer exists');
  const rowRegex = /`\.claude\/skills\/([a-z0-9-]+)\/SKILL\.md`/g;
  const referenced = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(workerBase)) !== null) {
    referenced.add(match[1]);
  }
  const dirSet = new Set(dirs);
  for (const name of referenced) {
    assert(dirSet.has(name), `worker-base reference to ${name} has a backing directory`);
  }

  console.log('\n[6] worker-base size under ceiling');
  const lineCount = workerBase.split('\n').length;
  assert(lineCount <= WORKER_BASE_CEILING, `worker-base ≤ ${WORKER_BASE_CEILING} lines (got ${lineCount})`);
  console.log(`    (worker-base SKILL.md is ${lineCount} lines)`);

  console.log('\n[7] No custom frontmatter fields leaked back in');
  assert(!workerBase.split('---')[1]?.includes('when_required'), 'worker-base frontmatter has no when_required');
  // Spot-check a couple more SKILL.md files to make sure the revert held.
  for (const dir of ['web-testing', 'backend-testing', 'jack-git-commit', 'eds-content-driven-development']) {
    const body = readFileSync(path.join(SKILLS_ROOT, dir, 'SKILL.md'), 'utf-8');
    const frontmatter = body.split('---')[1] ?? '';
    assert(!frontmatter.includes('when_required'), `${dir} frontmatter has no when_required`);
  }

  console.log('');
  if (failures > 0) {
    console.error(`[I5] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I5] all assertions passed');
  }
}

main().catch((err) => {
  console.error('[I5] uncaught error:', err);
  process.exit(1);
});
