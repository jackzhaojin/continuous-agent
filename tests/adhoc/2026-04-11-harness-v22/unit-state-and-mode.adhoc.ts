/**
 * Adhoc unit tests — state stores + mode detection.
 *
 *   npx tsx tests/adhoc/2026-04-11-harness-v22/unit-state-and-mode.adhoc.ts
 *
 * Covers:
 *   - generic state-store: round trip STATUS.json/TASKS.json/PROGRESS_LOG.md
 *   - study state-store: round trip + phase defaults
 *   - generic mode-detector: scenario matrix (empty / code / docs / both)
 *   - generic mode-detector: detectHarnessMode → resume vs scenario
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadState as loadGenericState,
  saveState as saveGenericState,
  loadTasks as loadGenericTasks,
  saveTasks as saveGenericTasks,
  appendProgress as appendGenericProgress,
  INITIAL_STATE as GENERIC_INITIAL_STATE,
} from '../../../src/harnesses/generic/state-store.js';
import {
  loadState as loadStudyState,
  saveState as saveStudyState,
  initialState as studyInitialState,
  PHASES as STUDY_PHASES,
} from '../../../src/harnesses/study/state-store.js';
import {
  detectScenario,
  detectSpecGaps,
  hasSignificantCode,
  hasCompleteAIDocs,
  isDirEmpty,
  detectHarnessMode,
} from '../../../src/harnesses/generic/mode-detector.js';

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${label}`);
      console.log(`      ${(err as Error).message}`);
      failed++;
    }
  })();
}

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'harness-unit-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log('\n=== state stores + mode detector unit tests ===\n');

  // ── generic state-store ─────────────────────────────────
  console.log('[generic state-store]');
  await check('loadState returns INITIAL_STATE when no file', async () => {
    await withTmp(async (dir) => {
      const state = await loadGenericState(dir);
      assert.equal(state.phase, GENERIC_INITIAL_STATE.phase);
      assert.equal(state.completedCount, 0);
      assert.deepEqual(state.tasks, []);
    });
  });
  await check('saveState → loadState round trip preserves fields', async () => {
    await withTmp(async (dir) => {
      const state = {
        ...GENERIC_INITIAL_STATE,
        phase: 'EXECUTING' as const,
        mode: 'bootstrap',
        currentTaskId: '1',
        tasks: [
          { id: '1', title: 'Task one', status: 'in_progress' as const },
          { id: '2', title: 'Task two', status: 'pending' as const },
        ],
      };
      await saveGenericState(dir, state);
      const loaded = await loadGenericState(dir);
      assert.equal(loaded.phase, 'EXECUTING');
      assert.equal(loaded.currentTaskId, '1');
      assert.equal(loaded.tasks.length, 2);
      assert.equal(loaded.tasks[0]!.id, '1');
      assert.ok(loaded.updatedAt); // saveState sets this
    });
  });
  await check('loadTasks returns empty when missing', async () => {
    await withTmp(async (dir) => {
      const t = await loadGenericTasks(dir);
      assert.deepEqual(t.tasks, []);
    });
  });
  await check('saveTasks round trip', async () => {
    await withTmp(async (dir) => {
      await saveGenericTasks(dir, {
        version: '1.0',
        tasks: [{ id: '1', title: 'x', status: 'pending' }],
      });
      const t = await loadGenericTasks(dir);
      assert.equal(t.tasks.length, 1);
      assert.equal(t.tasks[0]!.title, 'x');
    });
  });
  await check('appendProgress creates file and appends', async () => {
    await withTmp(async (dir) => {
      await appendGenericProgress(dir, 'first');
      await appendGenericProgress(dir, 'second');
      const log = await readFile(join(dir, 'SPEC', 'PROGRESS_LOG.md'), 'utf-8');
      assert.ok(log.includes('first'));
      assert.ok(log.includes('second'));
      assert.ok(log.includes('# Progress Log'));
    });
  });

  // ── study state-store ───────────────────────────────────
  console.log('\n[study state-store]');
  await check('initialState contains all 7 phases', () => {
    const s = studyInitialState();
    for (const phase of STUDY_PHASES) {
      assert.ok(s.phases[phase], `phase ${phase} missing`);
      assert.equal(s.phases[phase]!.status, 'pending');
    }
  });
  await check('study loadState returns initial when missing', async () => {
    await withTmp(async (dir) => {
      const s = await loadStudyState(dir);
      assert.equal(s.pipeline, 'INIT');
      assert.equal(STUDY_PHASES.every((p) => !!s.phases[p]), true);
    });
  });
  await check('study saveState → loadState round trip', async () => {
    await withTmp(async (dir) => {
      const s = studyInitialState();
      s.pipeline = 'RUNNING';
      s.phases.DECOMPOSE!.status = 'complete';
      s.phases.DECOMPOSE!.attempts = 2;
      s.phases.RESEARCH!.status = 'in_progress';
      await saveStudyState(dir, s);
      const loaded = await loadStudyState(dir);
      assert.equal(loaded.pipeline, 'RUNNING');
      assert.equal(loaded.phases.DECOMPOSE!.status, 'complete');
      assert.equal(loaded.phases.DECOMPOSE!.attempts, 2);
      assert.equal(loaded.phases.RESEARCH!.status, 'in_progress');
      assert.equal(loaded.phases.SYNTHESIZE!.status, 'pending');
    });
  });
  await check('study saveState uses atomic tmp+rename', async () => {
    await withTmp(async (dir) => {
      const s = studyInitialState();
      await saveStudyState(dir, s);
      // STATUS.json.tmp should not linger
      const aiDocs = join(dir, 'ai-docs');
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(aiDocs);
      assert.ok(files.includes('STATUS.json'));
      assert.ok(!files.includes('STATUS.json.tmp'));
    });
  });

  // ── mode detector: primitives ───────────────────────────
  console.log('\n[mode-detector primitives]');
  await check('isDirEmpty(missing) returns true', async () => {
    assert.equal(await isDirEmpty('/tmp/does-not-exist-xyz'), true);
  });
  await check('isDirEmpty(empty) returns true', async () => {
    await withTmp(async (dir) => {
      assert.equal(await isDirEmpty(dir), true);
    });
  });
  await check('isDirEmpty(non-empty) returns false', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, 'foo.txt'), 'x');
      assert.equal(await isDirEmpty(dir), false);
    });
  });
  await check('hasSignificantCode: false when only markdown', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, 'README.md'), 'x');
      assert.equal(await hasSignificantCode(dir), false);
    });
  });
  await check('hasSignificantCode: true when root .js present', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, 'index.js'), 'console.log(1)');
      assert.equal(await hasSignificantCode(dir), true);
    });
  });
  await check('hasSignificantCode: true when src/ has .ts', async () => {
    await withTmp(async (dir) => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'index.ts'), 'export {}');
      assert.equal(await hasSignificantCode(dir), true);
    });
  });
  await check('hasSignificantCode: skips ai-docs/node_modules', async () => {
    await withTmp(async (dir) => {
      await mkdir(join(dir, 'ai-docs'), { recursive: true });
      await writeFile(join(dir, 'ai-docs', 'note.ts'), '');
      await mkdir(join(dir, 'node_modules'), { recursive: true });
      await writeFile(join(dir, 'node_modules', 'dep.js'), '');
      assert.equal(await hasSignificantCode(dir), false);
    });
  });
  await check('hasCompleteAIDocs: false when SPEC incomplete', async () => {
    await withTmp(async (dir) => {
      const specDir = join(dir, 'SPEC');
      await mkdir(specDir, { recursive: true });
      await writeFile(join(specDir, 'CONSTITUTION.md'), '');
      assert.equal(hasCompleteAIDocs(dir), false);
    });
  });
  await check('hasCompleteAIDocs: true when full suite present', async () => {
    await withTmp(async (dir) => {
      const specDir = join(dir, 'SPEC');
      await mkdir(specDir, { recursive: true });
      for (const f of [
        'CONSTITUTION.md',
        'WHY_WHAT.md',
        'HOW.md',
        'TASKS.json',
        'STATUS.json',
      ]) {
        await writeFile(join(specDir, f), '');
      }
      assert.equal(hasCompleteAIDocs(dir), true);
    });
  });
  await check('detectSpecGaps reports missing + hasStatus', async () => {
    await withTmp(async (dir) => {
      const specDir = join(dir, 'SPEC');
      await mkdir(specDir, { recursive: true });
      await writeFile(join(specDir, 'STATUS.json'), '{}');
      const gaps = detectSpecGaps(dir);
      assert.equal(gaps.hasStatus, true);
      assert.ok(gaps.missing.includes('CONSTITUTION.md'));
      assert.equal(gaps.missing.length, 4);
    });
  });

  // ── mode detector: scenario matrix ──────────────────────
  console.log('\n[mode-detector scenario matrix]');
  await check('empty dir → scenario 1 / bootstrap', async () => {
    await withTmp(async (dir) => {
      const s = await detectScenario(dir, dir);
      assert.equal(s.scenario, 1);
      assert.equal(s.mode, 'bootstrap');
    });
  });
  await check('code only → scenario 2 / adopt', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, 'index.js'), '');
      const s = await detectScenario(dir, dir);
      assert.equal(s.scenario, 2);
      assert.equal(s.mode, 'adopt');
    });
  });
  await check('code + full docs → scenario 3 / extend', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, 'index.js'), '');
      const specDir = join(dir, 'SPEC');
      await mkdir(specDir, { recursive: true });
      for (const f of [
        'CONSTITUTION.md',
        'WHY_WHAT.md',
        'HOW.md',
        'TASKS.json',
        'STATUS.json',
      ]) {
        await writeFile(join(specDir, f), '');
      }
      const s = await detectScenario(dir, dir);
      assert.equal(s.scenario, 3);
      assert.equal(s.mode, 'extend');
    });
  });
  await check('detectHarnessMode: empty target → bootstrap', async () => {
    await withTmp(async (dir) => {
      const m = await detectHarnessMode(dir, '/tmp/fake.md');
      assert.equal(m.type, 'bootstrap');
    });
  });
  await check('detectHarnessMode: ai-docs/STATUS.json + full spec → resume', async () => {
    await withTmp(async (dir) => {
      const spec = join(dir, 'ai-docs', 'SPEC');
      await mkdir(spec, { recursive: true });
      for (const f of [
        'CONSTITUTION.md',
        'WHY_WHAT.md',
        'HOW.md',
        'TASKS.json',
        'STATUS.json',
      ]) {
        await writeFile(join(spec, f), '');
      }
      const m = await detectHarnessMode(dir, '/tmp/fake.md');
      assert.equal(m.type, 'resume');
    });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
