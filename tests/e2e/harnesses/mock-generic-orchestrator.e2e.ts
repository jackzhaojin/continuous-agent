/**
 * E2E integration test — full generic orchestrator run against a mock provider.
 *
 *   npx tsx tests/e2e/harnesses/mock-generic-orchestrator.e2e.ts
 *
 * This test does NOT hit any real LLM API. It wires a MockAgentWorkerProvider
 * into runGenericOrchestrator() and asserts:
 *   1. run_start → SPEC phase → task loop → run_complete event sequence fires
 *   2. STATUS.json and TASKS.json land on disk in the expected layout
 *   3. Per-agent .md + _handoff.json outputs are written
 *   4. PROGRESS_LOG.md accumulates phase markers
 *   5. A final pipeline=COMPLETE is reached
 *
 * The mock provider returns canned agent output that includes a trailing
 * `"result":"pass"` handoff JSON block so didAgentPass() returns true and
 * the orchestrator advances through every phase.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GenericHarness } from '../../../src/harnesses/generic/index.js';
import type {
  AgentWorkerConfig,
  AgentWorkerMessage,
  AgentWorkerProvider,
  AuthValidation,
} from '../../../src/core/vendor/types.js';
import type { HarnessEvent } from '../../../src/harnesses/core/types.js';

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

// ── Mock provider ───────────────────────────────────────────────

interface CannedResponse {
  /** Markdown text the agent emits before the final json block. */
  text: string;
  /** The handoff JSON body (will be fenced automatically). */
  handoff: Record<string, unknown>;
}

/**
 * Returns canned output per agent. The `agentName` passed to the mock comes
 * from the prompt's first heading — so we detect which agent is being invoked
 * by looking at the prompt content.
 */
function cannedForPrompt(prompt: string): CannedResponse {
  if (/WHY Agent/i.test(prompt)) {
    return {
      text: 'CONSTITUTION written',
      handoff: { result: 'pass', filesWritten: ['SPEC/CONSTITUTION.md'] },
    };
  }
  if (/WHAT Agent/i.test(prompt)) {
    return {
      text: 'WHY_WHAT written',
      handoff: { result: 'pass' },
    };
  }
  if (/HOW Agent/i.test(prompt)) {
    return { text: 'HOW written', handoff: { result: 'pass' } };
  }
  if (/WHEN Agent/i.test(prompt) || /TASKS\.json/i.test(prompt)) {
    return {
      text: 'TASKS written',
      handoff: { result: 'pass', tasksGenerated: 1 },
    };
  }
  if (/Research Agent/i.test(prompt) || /research/i.test(prompt.slice(0, 100))) {
    return {
      text: 'Research complete',
      handoff: {
        result: 'pass',
        scope: { level: 'minor', rationale: 'small change' },
      },
    };
  }
  if (/Build Agent/i.test(prompt) || /BUILD/i.test(prompt.slice(0, 100))) {
    return {
      text: 'Build complete',
      handoff: { result: 'pass', filesModified: ['index.js'] },
    };
  }
  if (/Validate Agent/i.test(prompt) || /VALIDATE/i.test(prompt.slice(0, 100))) {
    return {
      text: 'Validation complete',
      handoff: { result: 'pass' },
    };
  }
  return { text: 'done', handoff: { result: 'pass' } };
}

class MockAgentWorkerProvider implements AgentWorkerProvider {
  readonly vendorId = 'mock';
  readonly vendorName = 'mock';
  calls: Array<{ model: string; cwd: string; agentHint: string }> = [];

  validateAuth(): AuthValidation {
    return { valid: true, method: 'mock', error: null };
  }

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    const canned = cannedForPrompt(config.prompt);
    const agentHint = config.prompt.match(/^#\s*([^\n]+)/)?.[1] ?? '';
    this.calls.push({ model: config.model, cwd: config.cwd, agentHint });

    // Emit one assistant message, then a result.
    const body = `${canned.text}\n\n\`\`\`json\n${JSON.stringify(canned.handoff, null, 2)}\n\`\`\``;
    yield {
      type: 'assistant',
      text: body,
      raw: { mock: true, prompt: config.prompt.slice(0, 60) },
    };
    yield {
      type: 'result',
      text: body,
      resultSuccess: true,
      raw: { mock: true, subtype: 'success' },
    };

    // The mock has no real file-writing tools. For the spec pipeline we
    // emulate the write by looking at cwd — for the generic harness, docsDir
    // is always `${cwd}/ai-docs` (orchestrator passes cwd=codeDir=targetDir).
    const docsDir = join(config.cwd, 'ai-docs');
    {
      const specDir = join(docsDir, 'SPEC');
      await mkdir(specDir, { recursive: true });
      if (/WHY Agent/i.test(config.prompt)) {
        await writeFile(join(specDir, 'CONSTITUTION.md'), '# CONSTITUTION\n(mock)\n');
      }
      if (/WHAT Agent/i.test(config.prompt)) {
        await writeFile(join(specDir, 'WHY_WHAT.md'), '# WHY_WHAT\n(mock)\n');
      }
      if (/HOW Agent/i.test(config.prompt)) {
        await writeFile(join(specDir, 'HOW.md'), '# HOW\n(mock)\n');
      }
      if (/WHEN Agent/i.test(config.prompt)) {
        await writeFile(
          join(specDir, 'TASKS.json'),
          JSON.stringify(
            {
              version: '1.0',
              tasks: [
                {
                  id: '1',
                  title: 'Mock smoke task',
                  description: 'Write a hello file',
                  acceptanceCriteria: ['hello.txt exists'],
                  status: 'pending',
                  dependencies: [],
                },
              ],
            },
            null,
            2,
          ),
        );
      }
    }
  }
}

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'mock-generic-'));
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
  console.log('\n=== mock-provider generic orchestrator e2e ===\n');

  await check('bootstrap run completes full pipeline', async () => {
    await withTmp(async (dir) => {
      const promptPath = join(dir, 'PROMPT.md');
      await writeFile(promptPath, '# Hello World Prompt\n\nBuild a simple hello.txt file.\n');

      const harness = new GenericHarness();
      const provider = new MockAgentWorkerProvider();
      const mode = await harness.detectMode(dir, promptPath);
      assert.equal(mode.type, 'bootstrap');

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

      const types = events.map((e) => e.type);
      assert.ok(types.includes('run_start'), 'missing run_start');
      assert.ok(types.includes('phase_start'), 'missing phase_start');
      assert.ok(types.includes('run_complete'), 'missing run_complete');

      // Final event must be run_complete
      const terminal = events[events.length - 1];
      assert.equal(terminal.type, 'run_complete');
      assert.equal((terminal as Extract<HarnessEvent, { type: 'run_complete' }>).success, true);

      // Files on disk
      assert.ok(existsSync(join(dir, 'ai-docs', 'SPEC', 'STATUS.json')), 'STATUS.json missing');
      assert.ok(existsSync(join(dir, 'ai-docs', 'SPEC', 'TASKS.json')), 'TASKS.json missing');
      assert.ok(existsSync(join(dir, 'ai-docs', 'SPEC', 'CONSTITUTION.md')), 'CONSTITUTION.md missing');
      assert.ok(existsSync(join(dir, 'ai-docs', 'SPEC', 'HOW.md')), 'HOW.md missing');
      assert.ok(existsSync(join(dir, 'ai-docs', 'SPEC', 'WHY_WHAT.md')), 'WHY_WHAT.md missing');
      assert.ok(existsSync(join(dir, 'ai-docs', 'SPEC', 'PROGRESS_LOG.md')), 'PROGRESS_LOG.md missing');

      // STATUS.json should reach COMPLETE
      const status = JSON.parse(
        await readFile(join(dir, 'ai-docs', 'SPEC', 'STATUS.json'), 'utf-8'),
      );
      assert.equal(status.phase, 'COMPLETE', `expected COMPLETE, got ${status.phase}`);
      assert.equal(status.tasks.length, 1);
      assert.equal(status.tasks[0].status, 'complete');
      assert.equal(status.completedCount, 1);

      // Per-agent handoff files
      assert.ok(
        existsSync(join(dir, 'ai-docs', 'TASKS', '1', 'research.md')),
        'research.md missing',
      );
      assert.ok(
        existsSync(join(dir, 'ai-docs', 'TASKS', '1', 'research_handoff.json')),
        'research_handoff.json missing',
      );
      assert.ok(
        existsSync(join(dir, 'ai-docs', 'TASKS', '1', 'build_attempt_1.md')),
        'build attempt 1 missing',
      );
      assert.ok(
        existsSync(join(dir, 'ai-docs', 'TASKS', '1', 'validate_attempt_1.md')),
        'validate attempt 1 missing',
      );

      // PROGRESS_LOG.md captures phases
      const log = await readFile(join(dir, 'ai-docs', 'SPEC', 'PROGRESS_LOG.md'), 'utf-8');
      assert.ok(/Phase: RESEARCH/.test(log));
      assert.ok(/Phase: BUILD/.test(log));
      assert.ok(/Phase: VALIDATE/.test(log));
      assert.ok(/ORCHESTRATION COMPLETE/.test(log));

      // Mock provider was called at least N times (4 spec agents + research + build + validate = 7)
      assert.ok(
        provider.calls.length >= 7,
        `expected >=7 provider calls, got ${provider.calls.length}`,
      );
    });
  });

  await check('resume from completed STATUS.json exits quickly', async () => {
    await withTmp(async (dir) => {
      // Pre-seed a COMPLETE state so orchestrator early-exits without re-running
      const specDir = join(dir, 'ai-docs', 'SPEC');
      await mkdir(specDir, { recursive: true });
      for (const f of ['CONSTITUTION.md', 'WHY_WHAT.md', 'HOW.md']) {
        await writeFile(join(specDir, f), '# placeholder');
      }
      await writeFile(
        join(specDir, 'TASKS.json'),
        JSON.stringify({ version: '1.0', tasks: [{ id: '1', title: 'done', status: 'complete' }] }),
      );
      await writeFile(
        join(specDir, 'STATUS.json'),
        JSON.stringify({
          version: '1.0',
          phase: 'COMPLETE',
          currentTaskId: null,
          tasks: [{ id: '1', title: 'done', status: 'complete' }],
          completedCount: 1,
          failedCount: 0,
          mode: 'bootstrap',
          scopeClassification: null,
          pauseReason: null,
          resumeContext: [],
          currentStateSummary: '',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );

      const promptPath = join(dir, 'PROMPT.md');
      await writeFile(promptPath, '# Resume test');

      const harness = new GenericHarness();
      const provider = new MockAgentWorkerProvider();
      const mode = await harness.detectMode(dir, promptPath);
      assert.equal(mode.type, 'resume');

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

      // No new phase_start events expected, just run_start + run_complete
      assert.equal(events[events.length - 1]!.type, 'run_complete');
      assert.equal(provider.calls.length, 0, 'resume should not call provider');
    });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
