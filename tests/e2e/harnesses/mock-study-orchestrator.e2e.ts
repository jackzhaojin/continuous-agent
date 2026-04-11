/**
 * E2E integration test — study orchestrator against a mock provider.
 *
 *   npx tsx tests/e2e/harnesses/mock-study-orchestrator.e2e.ts
 *
 * The study harness delegates the entire 7-phase pipeline to a single
 * coordinator agent. This test verifies:
 *   1. The orchestrator creates the target directory skeleton
 *   2. The coordinator agent is invoked exactly once
 *   3. STATUS.json is written with the 7-phase phase map
 *   4. phase_start events fire for all 7 phases before the coordinator runs
 *   5. A run_complete event arrives with success=true when the mock says pass
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StudyHarness } from '../../../src/harnesses/study/index.js';
import type {
  AgentWorkerConfig,
  AgentWorkerMessage,
  AgentWorkerProvider,
  AuthValidation,
} from '../../../src/core/vendor/types.js';
import type { HarnessEvent } from '../../../src/harnesses/core/types.js';
import { PHASES as STUDY_PHASES } from '../../../src/harnesses/study/state-store.js';

let passed = 0;
let failed = 0;

function check(label: string, fn: () => Promise<void>): Promise<void> {
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

class MockStudyProvider implements AgentWorkerProvider {
  readonly vendorId = 'mock';
  readonly vendorName = 'mock';
  calls: Array<{ agent: string; toolCount: number }> = [];

  validateAuth(): AuthValidation {
    return { valid: true, method: 'mock', error: null };
  }

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    this.calls.push({ agent: 'coordinator', toolCount: config.allowedTools.length });
    const body = `Coordinator done\n\n\`\`\`json\n${JSON.stringify({ result: 'pass' })}\n\`\`\``;
    yield { type: 'assistant', text: body, raw: {} };
    yield {
      type: 'result',
      text: body,
      resultSuccess: true,
      raw: { mock: true },
    };
  }
}

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'mock-study-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function collectEvents(
  stream: AsyncIterable<HarnessEvent>,
): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  for await (const evt of stream) events.push(evt);
  return events;
}

async function main(): Promise<void> {
  console.log('\n=== mock-provider study orchestrator e2e ===\n');

  await check('bootstrap run invokes coordinator once + emits 7 phase_starts', async () => {
    await withTmp(async (dir) => {
      const manifestPath = join(dir, 'manifest.yaml');
      await writeFile(
        manifestPath,
        'title: Test Study\ndomains: []\n',
      );

      const harness = new StudyHarness();
      const provider = new MockStudyProvider();
      const mode = await harness.detectMode(dir, manifestPath);
      assert.equal(mode.type, 'bootstrap');

      const events = await collectEvents(
        harness.run({
          promptFile: manifestPath,
          targetDir: dir,
          mode,
          provider,
          vendor: 'claude',
          modelOverrides: {},
        }),
      );

      // run_complete is the last event
      const last = events[events.length - 1]!;
      assert.equal(last.type, 'run_complete');
      assert.equal((last as Extract<HarnessEvent, { type: 'run_complete' }>).success, true);

      // All 7 phase_start events fired
      const phaseStarts = events
        .filter((e) => e.type === 'phase_start')
        .map((e) => (e as Extract<HarnessEvent, { type: 'phase_start' }>).phase);
      for (const p of STUDY_PHASES) {
        assert.ok(phaseStarts.includes(p), `phase_start for ${p} missing`);
      }

      // Coordinator invoked exactly once
      assert.equal(provider.calls.length, 1);
      assert.ok(
        provider.calls[0]!.toolCount >= 5,
        `coordinator expected >=5 tools, got ${provider.calls[0]!.toolCount}`,
      );

      // Target skeleton directories exist
      assert.ok(existsSync(join(dir, 'ai-docs', 'phases')));
      assert.ok(existsSync(join(dir, 'research')));
      assert.ok(existsSync(join(dir, 'sources')));
      assert.ok(existsSync(join(dir, 'podcasts', 'scripts')));
      assert.ok(existsSync(join(dir, 'podcasts', 'audio')));

      // STATUS.json contains all 7 phases
      const statusPath = join(dir, 'ai-docs', 'STATUS.json');
      assert.ok(existsSync(statusPath));
      const status = JSON.parse(await readFile(statusPath, 'utf-8'));
      for (const p of STUDY_PHASES) {
        assert.ok(status.phases[p], `STATUS.json missing phase ${p}`);
      }
      assert.equal(status.pipeline, 'RUNNING');

      // PROGRESS_LOG.md captured the run
      const log = await readFile(join(dir, 'ai-docs', 'PROGRESS_LOG.md'), 'utf-8');
      assert.ok(/PIPELINE STARTED/.test(log));
      assert.ok(/Coordinator agent finished/.test(log));
    });
  });

  await check('already-COMPLETE pipeline skips coordinator', async () => {
    await withTmp(async (dir) => {
      // Pre-seed a COMPLETE state
      const aiDocs = join(dir, 'ai-docs');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(aiDocs, { recursive: true });
      const phases: Record<string, object> = {};
      for (const p of STUDY_PHASES) {
        phases[p] = {
          status: 'complete',
          attempts: 1,
          error: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationSeconds: 1,
          progress: null,
          metrics: null,
        };
      }
      await writeFile(
        join(aiDocs, 'STATUS.json'),
        JSON.stringify({
          version: '1.1',
          pipeline: 'COMPLETE',
          currentPhase: null,
          currentActivity: null,
          regenFrom: null,
          phases,
          topicCount: 0,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );

      const manifestPath = join(dir, 'manifest.yaml');
      await writeFile(manifestPath, 'title: Resume test');

      const harness = new StudyHarness();
      const provider = new MockStudyProvider();
      const mode = await harness.detectMode(dir, manifestPath);
      assert.equal(mode.type, 'extend');

      await collectEvents(
        harness.run({
          promptFile: manifestPath,
          targetDir: dir,
          mode,
          provider,
          vendor: 'claude',
          modelOverrides: {},
        }),
      );

      assert.equal(
        provider.calls.length,
        0,
        'coordinator should not be invoked on COMPLETE pipeline',
      );
    });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
