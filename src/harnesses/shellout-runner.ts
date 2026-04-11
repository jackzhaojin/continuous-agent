/**
 * Transitional shell-out runner — P1/P2 only.
 *
 * Implements HarnessOrchestrator by spawning the existing JS harness's
 * `node src/index.js run --target … --prompt …` subprocess, tailing its
 * stdout/stderr as synthetic agent_message events, and polling STATUS.json
 * to synthesize phase_start / phase_complete events.
 *
 * Each harness that has not yet been ported to TypeScript delegates its
 * run() method to runShellOutHarness() below. Once P3/P4/P5 port the harness
 * natively, the delegation is removed and this whole file is deleted at the
 * end of P5.
 *
 * Env vars:
 *   GENERIC_HARNESS_ROOT — override path to generic-harness-v2 JS tree
 *   EDS_HARNESS_ROOT     — override path to eds-site-builder-harness-v1 JS tree
 *   STUDY_HARNESS_ROOT   — override path to study-harness-v1 JS tree
 *
 * Defaults point at Jack's local jack-dev-server-configs checkout. For OSS
 * users, set the env vars to wherever they've cloned the harness submodules.
 */

import { spawn, execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import type {
  HarnessEvent,
  HarnessMode,
  HarnessModeType,
  HarnessRunConfig,
  HarnessState,
  HarnessStatePhase,
} from './core/types.js';
import { HarnessEventBus } from './core/harness-event-bus.js';

export type ShelloutHarnessName = 'generic' | 'eds' | 'study';

interface ShelloutLayout {
  /** Root directory of the JS harness package. */
  root: string;
  /** Path to STATUS.json relative to the target dir. */
  statusJsonRelative: string;
  /** Path to TASKS.json relative to the target dir, if applicable. */
  tasksJsonRelative?: string;
  /** How to label the phase list when STATUS.json has not been written yet. */
  bootstrapPhases: readonly string[];
}

const DEFAULT_ROOTS: Record<ShelloutHarnessName, string> = {
  generic: path.join(
    os.homedir(),
    'dev/jack-dev-server-configs/local/generic-harness-v2026-01-v2',
  ),
  eds: path.join(
    os.homedir(),
    'dev/jack-dev-server-configs/local/eds-site-builder-harness-v2026-01-v1',
  ),
  study: path.join(
    os.homedir(),
    'dev/jack-dev-server-configs/local/study-harness-v2026-03-v1',
  ),
};

// These phase names mirror what the JS harness actually writes to
// PROGRESS_LOG.md via `Phase: <NAME>` markers. See the JS harness:
//   generic-harness-v2026-01-v2/src/orchestrator.js (appendProgress 'Phase: …' calls)
// Do NOT change these without verifying against a real run — status-mirror.ts
// matches step rows by title, so these must match whatever
// `normalizeGenericPhase` emits below.
const GENERIC_PHASES = [
  'SPEC',
  'RESEARCH',
  'BUILD',
  'VALIDATE',
  'COMPLETE',
] as const;

const STUDY_PHASES = [
  'DECOMPOSE',
  'RESEARCH',
  'SYNTHESIZE',
  'CONTENT',
  'TTS',
  'DEPOSIT',
  'VALIDATE',
] as const;

function layoutFor(name: ShelloutHarnessName): ShelloutLayout {
  const envKey =
    name === 'generic'
      ? 'GENERIC_HARNESS_ROOT'
      : name === 'eds'
        ? 'EDS_HARNESS_ROOT'
        : 'STUDY_HARNESS_ROOT';
  const root = process.env[envKey] ?? DEFAULT_ROOTS[name];

  if (name === 'study') {
    return {
      root,
      statusJsonRelative: 'ai-docs/STATUS.json',
      bootstrapPhases: STUDY_PHASES,
    };
  }
  // generic + eds share the same on-disk layout.
  return {
    root,
    statusJsonRelative: 'ai-docs/SPEC/STATUS.json',
    tasksJsonRelative: 'ai-docs/SPEC/TASKS.json',
    bootstrapPhases: GENERIC_PHASES,
  };
}

function readJsonIfExists(p: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Files that don't count as "existing project content" for mode detection —
 * a fresh git clone with just these files should still be considered empty
 * and default to `bootstrap`.
 */
const SCAFFOLDING_FILES = new Set<string>([
  '.git',
  '.gitignore',
  '.gitattributes',
  'README.md',
  'README.rst',
  'README.txt',
  'README',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'NOTICE',
  'NOTICE.md',
  '.DS_Store',
  '.vscode',
  '.idea',
]);

function targetHasProjectContent(targetDir: string): boolean {
  if (!fs.existsSync(targetDir)) return false;
  let entries: string[];
  try {
    entries = fs.readdirSync(targetDir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!SCAFFOLDING_FILES.has(entry)) return true;
  }
  return false;
}

export async function detectModeViaShellout(
  name: ShelloutHarnessName,
  targetDir: string,
  _promptFile: string,
): Promise<HarnessMode> {
  const layout = layoutFor(name);
  const statusPath = path.join(targetDir, layout.statusJsonRelative);
  const existingStatus = readJsonIfExists(statusPath);
  const existingTasks = layout.tasksJsonRelative
    ? readJsonIfExists(path.join(targetDir, layout.tasksJsonRelative))
    : undefined;

  let type: HarnessModeType = 'bootstrap';
  let reason = 'no STATUS.json and no existing project content — bootstrap run';

  if (existingStatus) {
    const status = existingStatus as { phase?: string; pipeline?: string; mode?: string };
    if (status.phase === 'EXECUTING' || status.phase === 'PAUSED' || status.pipeline === 'RUNNING') {
      type = 'resume';
      reason = `STATUS.json indicates in-progress run (phase=${status.phase ?? status.pipeline})`;
    } else if (status.phase === 'COMPLETE') {
      type = 'extend';
      reason = 'STATUS.json indicates completed prior run — extending';
    } else {
      // INIT or unknown — treat as a fresh start that happens to have stale state.
      type = targetHasProjectContent(targetDir) ? 'adopt' : 'bootstrap';
      reason = `STATUS.json phase=${status.phase ?? 'unknown'} — defaulting to ${type}`;
    }
  } else if (targetHasProjectContent(targetDir)) {
    // Any non-scaffolding files present → assume the user wants adopt.
    // This matches how the JS harness's own detectScenario() picks adopt
    // when code exists without ai-docs/SPEC/.
    type = 'adopt';
    reason = 'target has existing project content — adopting';
  }

  return { type, reason, existingStatus, existingTasks };
}

export async function getStateViaShellout(
  name: ShelloutHarnessName,
  targetDir: string,
): Promise<HarnessState> {
  const layout = layoutFor(name);
  const statusPath = path.join(targetDir, layout.statusJsonRelative);
  const tasksPath = layout.tasksJsonRelative
    ? path.join(targetDir, layout.tasksJsonRelative)
    : undefined;

  const rawStatus = readJsonIfExists(statusPath);
  const rawTasks = tasksPath ? readJsonIfExists(tasksPath) : undefined;

  const phases: HarnessStatePhase[] = [...layout.bootstrapPhases].map((p) => ({
    name: p,
    status: 'pending',
    attempts: 0,
  }));

  // Study harness: STATUS.json has per-phase detail.
  if (name === 'study' && rawStatus && typeof rawStatus === 'object') {
    const s = rawStatus as { phases?: Record<string, { status?: string; attempts?: number }> };
    if (s.phases) {
      for (const phase of phases) {
        const info = s.phases[phase.name];
        if (info) {
          phase.status = (info.status as HarnessStatePhase['status']) ?? 'pending';
          phase.attempts = info.attempts ?? 0;
        }
      }
    }
  }

  // Generic/EDS: STATUS.json has a flat `phase` cursor — mark everything up to
  // it as complete.
  if ((name === 'generic' || name === 'eds') && rawStatus && typeof rawStatus === 'object') {
    const s = rawStatus as { phase?: string };
    if (s.phase) {
      const idx = phases.findIndex((p) => normalizeGenericPhase(s.phase!) === p.name);
      for (let i = 0; i < phases.length; i += 1) {
        if (idx === -1 || i < idx) phases[i]!.status = 'complete';
        else if (i === idx) phases[i]!.status = 'in_progress';
      }
    }
  }

  const tasks = Array.isArray((rawTasks as { tasks?: unknown[] } | undefined)?.tasks)
    ? ((rawTasks as { tasks: Array<{ id: string; title?: string; status?: string; attempts?: number }> }).tasks.map(
        (t) => ({
          id: t.id,
          title: t.title ?? t.id,
          status: t.status ?? 'pending',
          attempts: t.attempts ?? 0,
        }),
      ))
    : [];

  return {
    mode: 'resume',
    phases,
    tasks,
    statusJsonPath: statusPath,
    tasksJsonPath: tasksPath,
  };
}

/**
 * Normalize a raw phase string from either STATUS.json (`phase` field:
 * INIT | EXECUTING | PAUSED | COMPLETE) or from a PROGRESS_LOG.md
 * `Phase: <NAME>` marker (ADOPT, BOOTSTRAP, SPEC_WHY, RESEARCH, BUILD,
 * VALIDATE, COMPLETE, …) into one of our GENERIC_PHASES values.
 *
 * Returns null when the input isn't a phase we surface (e.g. STATUS.json's
 * `INIT` and `EXECUTING` are run-level states, not step phases).
 */
function normalizeGenericPhase(raw: string): string | null {
  const u = raw.trim().toUpperCase();
  if (!u) return null;
  // Run-level STATUS.json values — not mapped to step phases.
  if (u === 'INIT' || u === 'EXECUTING' || u === 'PAUSED') return null;
  if (u === 'COMPLETE') return 'COMPLETE';
  // Spec sub-phases (bootstrap path: SPEC_WHY/WHAT/HOW/WHEN agents) all
  // collapse into a single SPEC step for the coarse shell-out mirror.
  if (u === 'ADOPT' || u === 'BOOTSTRAP' || u === 'SPEC' || u.startsWith('SPEC_')) {
    return 'SPEC';
  }
  // Per-task execution phases emitted by generic-harness-v2.
  if (u === 'RESEARCH') return 'RESEARCH';
  if (u === 'BUILD') return 'BUILD';
  if (u === 'VALIDATE') return 'VALIDATE';
  // Unknown — drop the event rather than surface a bogus step name.
  return null;
}

/**
 * Incremental tail of PROGRESS_LOG.md — returns phase names from
 * `Phase: <NAME>` lines appearing beyond `fromByte`, along with the new
 * byte offset to resume from on the next poll.
 */
function tailProgressLog(
  logPath: string,
  fromByte: number,
): { phases: string[]; nextByte: number } {
  if (!fs.existsSync(logPath)) return { phases: [], nextByte: fromByte };
  let stat;
  try {
    stat = fs.statSync(logPath);
  } catch {
    return { phases: [], nextByte: fromByte };
  }
  if (stat.size <= fromByte) return { phases: [], nextByte: fromByte };
  let chunk = '';
  try {
    const fd = fs.openSync(logPath, 'r');
    const len = stat.size - fromByte;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, fromByte);
    fs.closeSync(fd);
    chunk = buf.toString('utf8');
  } catch {
    return { phases: [], nextByte: fromByte };
  }
  const phases: string[] = [];
  const re = /^\[[^\]]+\]\s+Phase:\s+(\S+)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chunk)) !== null) {
    if (match[1]) phases.push(match[1]);
  }
  return { phases, nextByte: stat.size };
}

/**
 * Read the JS harness's actual mode from PROGRESS_LOG.md, which writes
 * `Mode: <mode> (Scenario ...)` as the second line of every run. Returns
 * null if the log doesn't exist yet or the marker hasn't been written.
 */
function readActualModeFromProgressLog(logPath: string): HarnessModeType | null {
  if (!fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const match = content.match(/^\[[^\]]+\]\s+Mode:\s+(\S+)/m);
    if (!match) return null;
    const m = match[1]!.toLowerCase();
    if (m === 'bootstrap' || m === 'adopt' || m === 'extend' || m === 'extend-deep' || m === 'resume') {
      return m as HarnessModeType;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Run a JS harness as a subprocess and stream synthetic HarnessEvents.
 *
 * Event sources:
 *   1. STATUS.json polled every 2s → run-level transitions (INIT → EXECUTING → COMPLETE).
 *   2. PROGRESS_LOG.md tailed every 2s → granular `Phase: <NAME>` markers
 *      (the JS harness emits SPEC/RESEARCH/BUILD/VALIDATE/COMPLETE transitions here,
 *      STATUS.json only has the coarse run state).
 *   3. Subprocess stdout/stderr → forwarded verbatim as agent_message events.
 */
export function runShellOutHarness(
  name: ShelloutHarnessName,
  config: HarnessRunConfig,
): AsyncIterable<HarnessEvent> {
  const bus = new HarnessEventBus();
  const layout = layoutFor(name);
  const statusPath = path.join(config.targetDir, layout.statusJsonRelative);
  const progressLogPath = path.join(
    config.targetDir,
    name === 'study' ? 'ai-docs/PROGRESS_LOG.md' : 'ai-docs/SPEC/PROGRESS_LOG.md',
  );

  (async () => {
    const at = () => new Date().toISOString();
    bus.emit({
      type: 'run_start',
      harness: name,
      mode: config.mode.type,
      target: config.targetDir,
      at: at(),
    });

    if (!fs.existsSync(layout.root)) {
      bus.emit({
        type: 'run_failed',
        error: `Harness JS tree not found at ${layout.root}. Set ${
          name === 'generic'
            ? 'GENERIC_HARNESS_ROOT'
            : name === 'eds'
              ? 'EDS_HARNESS_ROOT'
              : 'STUDY_HARNESS_ROOT'
        } to override.`,
        at: at(),
      });
      bus.close();
      return;
    }

    fs.mkdirSync(config.targetDir, { recursive: true });

    const args = [
      path.join(layout.root, 'src/index.js'),
      'run',
      '--target',
      config.targetDir,
      '--prompt',
      config.promptFile,
    ];
    if (config.mode.type !== 'bootstrap') {
      args.push('--mode', config.mode.type === 'resume' ? 'resume' : 'auto');
    }

    const proc = spawn('node', args, {
      cwd: layout.root,
      env: {
        ...process.env,
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
        ...envFromModelOverrides(config.modelOverrides),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastPhase: string | undefined;
    let progressByte = 0;
    let modeUpgraded = false;

    const poll = setInterval(() => {
      // (1) Upgrade mode once PROGRESS_LOG.md reveals what the JS harness
      // actually picked — our pre-run detection is a coarse approximation.
      if (!modeUpgraded) {
        const actual = readActualModeFromProgressLog(progressLogPath);
        if (actual && actual !== config.mode.type) {
          bus.emit({
            type: 'agent_message',
            agent: 'shellout',
            role: 'system',
            text: `[mode upgrade] pre-run estimate was '${config.mode.type}', JS harness picked '${actual}'`,
            raw: { priorMode: config.mode.type, actualMode: actual },
          });
        }
        if (actual) modeUpgraded = true;
      }

      // (2) Tail PROGRESS_LOG.md for granular Phase markers.
      const tail = tailProgressLog(progressLogPath, progressByte);
      progressByte = tail.nextByte;
      for (const raw of tail.phases) {
        const cursor = normalizeGenericPhase(raw);
        if (!cursor) continue;
        if (cursor === lastPhase) continue;
        if (lastPhase) {
          bus.emit({ type: 'phase_complete', phase: lastPhase, success: true, at: at() });
        }
        bus.emit({ type: 'phase_start', phase: cursor, at: at() });
        lastPhase = cursor;
      }

      // (3) STATUS.json presence — useful diagnostic even though we don't
      // drive phase transitions off it anymore.
      if (fs.existsSync(statusPath)) {
        bus.emit({ type: 'status_written', path: statusPath });
      }
    }, 2000);

    config.abortSignal?.addEventListener('abort', () => {
      proc.kill('SIGTERM');
    });

    const forwardLine = (role: 'assistant' | 'system', buf: Buffer) => {
      const text = buf.toString('utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        bus.emit({
          type: 'agent_message',
          agent: 'shellout',
          role,
          text: line,
          raw: { role, line },
        });
      }
    };
    proc.stdout.on('data', (b) => forwardLine('assistant', b));
    proc.stderr.on('data', (b) => forwardLine('system', b));

    proc.on('error', (err) => {
      clearInterval(poll);
      bus.emit({ type: 'run_failed', error: String(err), at: at() });
      bus.close();
    });

    proc.on('exit', (code) => {
      clearInterval(poll);
      // Drain any final PROGRESS_LOG.md entries that arrived between the
      // last poll and the subprocess exit.
      const finalTail = tailProgressLog(progressLogPath, progressByte);
      progressByte = finalTail.nextByte;
      for (const raw of finalTail.phases) {
        const cursor = normalizeGenericPhase(raw);
        if (!cursor) continue;
        if (cursor === lastPhase) continue;
        if (lastPhase) {
          bus.emit({ type: 'phase_complete', phase: lastPhase, success: true, at: at() });
        }
        bus.emit({ type: 'phase_start', phase: cursor, at: at() });
        lastPhase = cursor;
      }
      if (lastPhase) {
        bus.emit({
          type: 'phase_complete',
          phase: lastPhase,
          success: code === 0,
          at: at(),
        });
      }

      // Safety-net finalization commit — catches any ai-docs/ state writes
      // the JS harness orchestrator made after its last BUILD agent commit.
      // Mirrors the JS harness's own commitHarnessFinalization(); present
      // here so continuous-agent self-heals against un-patched or alternate
      // harness JS trees. No-op if the JS harness already committed.
      commitShelloutFinalization(config.targetDir, code === 0, bus)
        .catch(() => { /* already logged via bus */ })
        .finally(() => {
          bus.emit({
            type: 'run_complete',
            success: code === 0,
            errors: code === 0 ? undefined : [`harness subprocess exited with code ${code}`],
            at: at(),
          });
          bus.close();
        });
    });
  })().catch((err) => {
    bus.emit({ type: 'run_failed', error: String(err), at: new Date().toISOString() });
    bus.close();
  });

  return bus;
}

/**
 * Safety-net finalization commit, mirrored from the JS harness's own
 * `commitHarnessFinalization()` in generic-harness-v2026-01-v2/src/orchestrator.js.
 *
 * Why mirrored? The JS harness has its own fix, but we also want
 * continuous-agent to be self-healing against un-patched or alternate
 * harness JS trees (different forks, pinned versions, etc). After the
 * subprocess exits cleanly, we sweep any uncommitted `ai-docs/` state
 * writes into a single finalization commit. No-op if:
 *   - targetDir isn't a git working tree
 *   - there's nothing uncommitted under ai-docs/
 *   - the JS harness already committed (so our second call finds nothing)
 *
 * Never pushes. Never touches files outside ai-docs/.
 * Ported to the P3 native TS orchestrator as-is.
 */
async function commitShelloutFinalization(
  targetDir: string,
  runSucceeded: boolean,
  bus: HarnessEventBus,
): Promise<void> {
  if (!runSucceeded) return; // don't finalize failed runs
  // Is this a git working tree?
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: targetDir });
  } catch {
    return;
  }
  try {
    const { stdout: dirty } = await execFileAsync(
      'git',
      ['status', '--porcelain', '--', 'ai-docs'],
      { cwd: targetDir },
    );
    if (!dirty.trim()) return; // nothing uncommitted under ai-docs/
    await execFileAsync('git', ['add', '-A', '--', 'ai-docs'], { cwd: targetDir });
    const { stdout: staged } = await execFileAsync(
      'git',
      ['diff', '--cached', '--name-only', '--', 'ai-docs'],
      { cwd: targetDir },
    );
    if (!staged.trim()) return; // nothing actually staged
    const message = 'chore(harness): finalize run (shellout safety-net)';
    await execFileAsync(
      'git',
      ['commit', '--no-verify', '-m', message],
      { cwd: targetDir },
    );
    bus.emit({
      type: 'agent_message',
      agent: 'shellout',
      role: 'system',
      text: '[finalize] committed dangling ai-docs/ state as shellout safety-net',
      raw: { finalization: 'shellout-runner' },
    });
  } catch (err) {
    bus.emit({
      type: 'agent_message',
      agent: 'shellout',
      role: 'system',
      text: `[finalize] commit failed (non-fatal): ${(err as Error).message}`,
      raw: { finalization: 'shellout-runner', error: String(err) },
    });
  }
}

function envFromModelOverrides(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    env[`MODEL_${key.toUpperCase()}`] = value;
  }
  return env;
}
