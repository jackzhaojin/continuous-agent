/**
 * I4 — worker-base skill must contain the UI-library guidance subsection.
 *
 * Run: npx tsx tests/adhoc/i4-ui-library-guidance.adhoc.ts
 */

import { readFileSync } from 'fs';
import path from 'path';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

function main() {
  console.log('[I4] worker-base UI library guidance\n');
  const skillPath = path.join(
    process.cwd(),
    'claude-files-to-output',
    'skills',
    'worker-base',
    'SKILL.md',
  );
  const body = readFileSync(skillPath, 'utf-8');

  console.log('[1] Section present');
  assert(body.includes('### UI Libraries'), 'UI Libraries heading present');

  console.log('\n[2] shadcn + Radix + headlessui mentioned');
  assert(body.includes('shadcn/ui'), 'shadcn/ui referenced');
  assert(body.includes('@radix-ui/react'), 'Radix referenced');
  assert(body.includes('@headlessui/react'), 'headlessui referenced');

  console.log('\n[3] Forbidden patterns called out');
  assert(/Custom `Select`/.test(body), 'Custom Select warning present');
  assert(body.includes('SelectValue'), 'SelectValue anti-pattern referenced');
  assert(body.includes('react-hook-form'), 'react-hook-form controlled pattern mentioned');

  console.log('\n[4] Decision procedure present');
  assert(body.includes('components.json'), 'components.json decision check present');
  assert(body.includes('npx shadcn@latest'), 'shadcn install command referenced');

  console.log('');
  if (failures > 0) {
    console.error(`[I4] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I4] all assertions passed');
  }
}

main();
