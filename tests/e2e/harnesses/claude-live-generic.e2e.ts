/**
 * LIVE e2e test — runs the generic harness against the real Claude SDK.
 *
 *   RUN_LIVE_E2E=1 npx tsx tests/e2e/harnesses/claude-live-generic.e2e.ts
 *
 * Gated: without RUN_LIVE_E2E=1 the script exits 0 immediately. This prevents
 * CI and `run-all.sh` from burning OAuth credits on every invocation.
 *
 * Requires: CLAUDE_CODE_OAUTH_TOKEN in .env.worker or environment.
 *
 * Budget warning: a full bootstrap run spawns 7+ agents (4 spec + research +
 * build + validate) and can consume hundreds of thousands of tokens. Do not
 * invoke this in a tight loop.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { GenericHarness } from '../../../src/harnesses/generic/index.js';
import { getAgentWorkerProviderForVendor } from '../../../src/core/vendor/vendor-registry.js';

function loadWorkerEnv(): void {
  const root = resolve(import.meta.dirname, '../../..');
  for (const envFile of ['.env.worker', '.env']) {
    try {
      const content = readFileSync(join(root, envFile), 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch {}
  }
}

async function main(): Promise<number> {
  if (process.env.RUN_LIVE_E2E !== '1') {
    console.log('[claude-live-generic] Gated — set RUN_LIVE_E2E=1 to run.');
    return 0;
  }

  loadWorkerEnv();

  const provider = getAgentWorkerProviderForVendor('claude');
  const auth = provider.validateAuth();
  if (!auth.valid) {
    console.error(`[claude-live-generic] Claude auth invalid: ${auth.error}`);
    return 1;
  }

  const dir = await mkdtemp(join(tmpdir(), 'live-generic-'));
  console.log(`[claude-live-generic] target=${dir}`);
  try {
    const promptPath = join(dir, 'PROMPT.md');
    await writeFile(
      promptPath,
      [
        '# Hello Node Smoke Test',
        '',
        '```yaml',
        'playwright_testing: false',
        '```',
        '',
        'Build the smallest possible Node.js project:',
        '',
        '- a `hello.js` file that prints "hello harness"',
        '- a `package.json` with `"type": "module"` and a `start` script',
        '',
        'That is the complete scope. Do not add tests, linting, or frameworks.',
        '',
      ].join('\n'),
    );

    const harness = new GenericHarness();
    const mode = await harness.detectMode(dir, promptPath);
    console.log(`[claude-live-generic] mode=${mode.type}`);

    let lastEvent = '';
    let success = false;
    for await (const evt of harness.run({
      promptFile: promptPath,
      targetDir: dir,
      mode,
      provider,
      vendor: 'claude',
      modelOverrides: {},
      maxTurnsPerAgent: 30,
    })) {
      lastEvent = evt.type;
      if (evt.type === 'phase_start') {
        console.log(`  ▶ phase_start ${(evt as { phase: string }).phase}`);
      } else if (evt.type === 'phase_complete') {
        const p = evt as { phase: string; success: boolean };
        console.log(`  ${p.success ? '✔' : '✗'} phase_complete ${p.phase}`);
      } else if (evt.type === 'agent_start') {
        const a = evt as { agent: string; model: string };
        console.log(`    ↪ ${a.agent} (${a.model})`);
      } else if (evt.type === 'agent_complete') {
        const a = evt as { agent: string; success: boolean; duration_ms: number };
        console.log(`    ${a.success ? '✔' : '✗'} ${a.agent} ${a.duration_ms}ms`);
      } else if (evt.type === 'run_complete') {
        success = (evt as { success: boolean }).success;
        console.log(`  ${success ? '✅' : '❌'} run_complete`);
      } else if (evt.type === 'run_failed') {
        console.log(`  ❌ run_failed: ${(evt as { error: string }).error}`);
      }
    }

    console.log(`[claude-live-generic] last event: ${lastEvent}, success: ${success}`);
    return success ? 0 : 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
