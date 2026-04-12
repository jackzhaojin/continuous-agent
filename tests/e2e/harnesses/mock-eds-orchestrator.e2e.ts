/**
 * E2E integration test — EDS orchestrator against a mock provider.
 *
 *   npx tsx tests/e2e/harnesses/mock-eds-orchestrator.e2e.ts
 *
 * Mirrors mock-generic-orchestrator but additionally asserts:
 *   - .gitignore contains .playwright-mcp
 *   - .hlxignore contains ai-docs/ and .playwright-mcp
 *   - Progress log notes that the ignore files were updated
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EdsHarness } from '../../../src/harnesses/eds/index.js';
import type {
  AgentWorkerConfig,
  AgentWorkerMessage,
  AgentWorkerProvider,
  AuthValidation,
} from '../../../src/core/vendor/types.js';
import type { HarnessEvent } from '../../../src/harnesses/core/types.js';

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

class MockEdsProvider implements AgentWorkerProvider {
  readonly vendorId = 'mock';
  readonly vendorName = 'mock';
  callCount = 0;

  validateAuth(): AuthValidation {
    return { valid: true, method: 'mock', error: null };
  }

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    this.callCount++;
    const body = `Done\n\n\`\`\`json\n${JSON.stringify({ result: 'pass' })}\n\`\`\``;

    yield { type: 'assistant', text: body, raw: {} };
    yield {
      type: 'result',
      text: body,
      resultSuccess: true,
      raw: { mock: true },
    };

    const docsDir = join(config.cwd, 'ai-docs');
    const { mkdir, writeFile } = await import('node:fs/promises');
    const specDir = join(docsDir, 'SPEC');
    await mkdir(specDir, { recursive: true });
    if (/WHY Agent/i.test(config.prompt)) {
      await writeFile(join(specDir, 'CONSTITUTION.md'), '# mock');
    }
    if (/WHAT Agent/i.test(config.prompt)) {
      await writeFile(join(specDir, 'WHY_WHAT.md'), '# mock');
    }
    if (/HOW Agent/i.test(config.prompt)) {
      await writeFile(join(specDir, 'HOW.md'), '# mock');
    }
    if (/WHEN Agent/i.test(config.prompt)) {
      await writeFile(
        join(specDir, 'TASKS.json'),
        JSON.stringify({
          version: '1.0',
          tasks: [
            {
              id: '1',
              title: 'Build a hero block',
              description: 'Static hero',
              acceptanceCriteria: ['hero.js exists'],
              status: 'pending',
              dependencies: [],
            },
          ],
        }),
      );
    }
  }
}

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'mock-eds-'));
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
  console.log('\n=== mock-provider EDS orchestrator e2e ===\n');

  await check('bootstrap EDS run writes ignore files + completes pipeline', async () => {
    await withTmp(async (dir) => {
      const promptPath = join(dir, 'PROMPT.md');
      await writeFile(promptPath, '# EDS site build prompt\n');

      const harness = new EdsHarness();
      const provider = new MockEdsProvider();
      const mode = await harness.detectMode(dir, promptPath);

      const events = await collectEvents(
        harness.run({
          promptFile: promptPath,
          targetDir: dir,
          mode,
          provider,
          vendor: 'claude',
          modelOverrides: {},
        }),
      );

      const last = events[events.length - 1]!;
      assert.equal(last.type, 'run_complete');
      assert.equal((last as Extract<HarnessEvent, { type: 'run_complete' }>).success, true);

      // run_start must say harness='eds'
      const start = events.find((e) => e.type === 'run_start')!;
      assert.equal((start as Extract<HarnessEvent, { type: 'run_start' }>).harness, 'eds');

      // EDS-specific: ignore files written
      assert.ok(existsSync(join(dir, '.gitignore')), '.gitignore missing');
      assert.ok(existsSync(join(dir, '.hlxignore')), '.hlxignore missing');
      const git = await readFile(join(dir, '.gitignore'), 'utf-8');
      const hlx = await readFile(join(dir, '.hlxignore'), 'utf-8');
      assert.ok(git.includes('.playwright-mcp'));
      assert.ok(!git.includes('ai-docs/')); // ai-docs stays in git
      assert.ok(hlx.includes('ai-docs/'));
      assert.ok(hlx.includes('.playwright-mcp'));

      // Progress log notes the ignore-file update
      const log = await readFile(join(dir, 'ai-docs', 'SPEC', 'PROGRESS_LOG.md'), 'utf-8');
      assert.ok(/\.hlxignore updated/.test(log), 'hlxignore update not logged');

      // Pipeline reached COMPLETE
      const status = JSON.parse(
        await readFile(join(dir, 'ai-docs', 'SPEC', 'STATUS.json'), 'utf-8'),
      );
      assert.equal(status.phase, 'COMPLETE');
      assert.equal(status.tasks.length, 1);
      assert.equal(status.tasks[0].status, 'complete');
    });
  });

  await check('re-running in same dir leaves ignore files idempotent', async () => {
    await withTmp(async (dir) => {
      await writeFile(join(dir, '.gitignore'), '.playwright-mcp\nnode_modules\n');
      await writeFile(join(dir, '.hlxignore'), 'ai-docs/\n.playwright-mcp\n');

      const promptPath = join(dir, 'PROMPT.md');
      await writeFile(promptPath, '# EDS prompt');

      const harness = new EdsHarness();
      const provider = new MockEdsProvider();
      const mode = await harness.detectMode(dir, promptPath);

      await collectEvents(
        harness.run({
          promptFile: promptPath,
          targetDir: dir,
          mode,
          provider,
          vendor: 'claude',
          modelOverrides: {},
        }),
      );

      const git = await readFile(join(dir, '.gitignore'), 'utf-8');
      const hlx = await readFile(join(dir, '.hlxignore'), 'utf-8');
      // Count .playwright-mcp occurrences — idempotency check
      assert.equal(git.match(/\.playwright-mcp/g)?.length, 1, '.playwright-mcp duplicated');
      assert.equal(
        hlx.match(/\.playwright-mcp/g)?.length,
        1,
        '.playwright-mcp duplicated in hlxignore',
      );
      assert.ok(git.includes('node_modules'), 'preserved existing .gitignore content');
    });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
