/**
 * Adhoc: path defaults follow the checkout, not a fixed `~/dev/<repo>` layout.
 *
 * ~/dev was regrouped by GitHub owner on 2026-10-14 (e.g.
 * `~/dev/jackzhaojin/{continuous-agent,ai-sandbox,ai-sandbox-worktrees}`).
 * With no env overrides, the agent path is this checkout and the sandbox repos
 * are its siblings. `AGENT_PATH`, `AI_SANDBOX_PATH` and
 * `AI_SANDBOX_WORKTREES_PATH` still win when set.
 *
 * Run: `npx tsx tests/adhoc/2026-10-14-dev-layout-defaults/agent-paths.adhoc.ts`
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAgentPath, getSiblingRepoPath } from '../../../src/core/agent-paths.js';
import {
  getAiSandboxPath,
  getAiSandboxWorktreesPath,
} from '../../../src/deterministic/build-target-resolver.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PARENT = path.dirname(REPO_ROOT);

const ENV_KEYS = ['AGENT_PATH', 'AI_SANDBOX_PATH', 'AI_SANDBOX_WORKTREES_PATH'] as const;

let passed = 0;
let failed = 0;

/** Run `fn` with the given env (undefined = unset), restoring the previous values after. */
function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void): void {
  const prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    const v = env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        process.stdout.write(`  ✓ ${name}\n`);
        passed++;
      },
      (err) => {
        process.stdout.write(`  ✗ ${name}\n    ${(err as Error).message}\n`);
        failed++;
      },
    );
}

async function main(): Promise<void> {
  process.stdout.write('agent-paths adhoc\n');

  await test('AGENT_PATH unset → this checkout', () => {
    withEnv({}, () => {
      assert.equal(getAgentPath(), REPO_ROOT);
      assert.ok(existsSync(path.join(getAgentPath(), 'package.json')), 'agent path must hold package.json');
      assert.ok(existsSync(path.join(getAgentPath(), 'templates')), 'agent path must hold templates/');
    });
  });

  await test('AGENT_PATH override wins', () => {
    withEnv({ AGENT_PATH: '/explicit/agent' }, () => {
      assert.equal(getAgentPath(), '/explicit/agent');
    });
  });

  await test('sandbox defaults are siblings of the checkout', () => {
    withEnv({}, () => {
      assert.equal(getAiSandboxPath(), path.join(PARENT, 'ai-sandbox'));
      assert.equal(getAiSandboxWorktreesPath(), path.join(PARENT, 'ai-sandbox-worktrees'));
      assert.equal(getSiblingRepoPath('ai-sandbox'), getAiSandboxPath());
    });
  });

  await test('AI_SANDBOX_PATH / AI_SANDBOX_WORKTREES_PATH overrides win', () => {
    withEnv({ AI_SANDBOX_PATH: '/explicit/sandbox', AI_SANDBOX_WORKTREES_PATH: '/explicit/worktrees' }, () => {
      assert.equal(getAiSandboxPath(), '/explicit/sandbox');
      assert.equal(getAiSandboxWorktreesPath(), '/explicit/worktrees');
    });
  });

  await test('AGENT_PATH override does not move the sandbox defaults', () => {
    withEnv({ AGENT_PATH: '/elsewhere/continuous-agent' }, () => {
      assert.equal(getAiSandboxPath(), path.join(PARENT, 'ai-sandbox'));
      assert.equal(getAiSandboxWorktreesPath(), path.join(PARENT, 'ai-sandbox-worktrees'));
    });
  });

  // Smoke check against the real layout. Skips if the sandbox is not cloned
  // next to this checkout (CI, fresh machines).
  await test('default ai-sandbox is a git repo on disk (smoke)', () => {
    withEnv({}, () => {
      const sandbox = getAiSandboxPath();
      if (!existsSync(sandbox)) {
        process.stdout.write(`    (skipped: ${sandbox} not on disk)\n`);
        return;
      }
      execSync(`git -C "${sandbox}" rev-parse --git-dir`, { stdio: 'pipe' });
      assert.ok(existsSync(getAiSandboxWorktreesPath()), `worktrees parent must exist at ${getAiSandboxWorktreesPath()}`);
    });
  });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`);
  process.exit(1);
});
