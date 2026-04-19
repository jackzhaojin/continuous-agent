/**
 * I1 — backend-testing skill is present, well-formed, and loaded by the skill library.
 *
 * Run: npx tsx tests/adhoc/i1-backend-testing-skill-present.adhoc.ts
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { loadSkillLibrary } from '../../src/deterministic/skill-loader.js';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

async function main() {
  console.log('[I1] backend-testing skill tests\n');

  const skillRoot = path.join(process.cwd(), 'claude-files-to-output', 'skills');
  const skillPath = path.join(skillRoot, 'backend-testing', 'SKILL.md');

  console.log('[1] File exists');
  assert(existsSync(skillPath), `SKILL.md at ${skillPath}`);

  console.log('\n[2] File contents');
  const body = readFileSync(skillPath, 'utf-8');
  assert(body.startsWith('---'), 'starts with frontmatter');
  assert(body.includes('name: backend-testing'), 'has name field');
  assert(body.includes('curl'), 'mentions curl');
  assert(body.includes('/api/health'), 'references /api/health');
  assert(body.includes('Persistence round-trip'), 'documents round-trip check');
  assert(body.includes('structured handoff'), 'references structured handoff');
  assert(/when to use this skill vs\. web-testing/i.test(body), 'explains scope vs web-testing');

  console.log('\n[3] Skill library picks it up');
  const { skills, warnings } = await loadSkillLibrary(skillRoot);
  const backend = skills.find(s => s.name === 'backend-testing');
  assert(backend !== undefined, 'skill loads from library');
  assert(backend?.body.includes('curl'), 'loaded body has curl content');
  if (warnings.length > 0) {
    console.log('  (skill-loader warnings:', warnings, ')');
  }

  console.log('');
  if (failures > 0) {
    console.error(`[I1] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I1] all assertions passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
