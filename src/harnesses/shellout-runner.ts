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

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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

const GENERIC_PHASES = [
  'SPEC_WHY',
  'SPEC_WHAT',
  'SPEC_HOW',
  'SPEC_WHEN',
  'TASK_RESEARCH',
  'TASK_BUILD',
  'TASK_VALIDATE',
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
  let reason = 'no STATUS.json found — bootstrap run';

  if (existingStatus) {
    const status = existingStatus as { phase?: string; pipeline?: string };
    if (
      (status.phase && status.phase !== 'INIT' && status.phase !== 'PHASE_COMPLETE') ||
      (status.pipeline === 'RUNNING')
    ) {
      type = 'resume';
      reason = `STATUS.json indicates in-progress run (phase=${status.phase ?? status.pipeline})`;
    } else {
      type = 'extend';
      reason = 'STATUS.json indicates completed prior run — extending';
    }
  } else if (fs.existsSync(path.join(targetDir, 'package.json'))) {
    type = 'adopt';
    reason = 'no STATUS.json but target has package.json — adopting existing project';
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

function normalizeGenericPhase(raw: string): string {
  // The JS generic harness uses PHASE_BOOTSTRAP / PHASE_SPEC_PLAN / PHASE_PLAN
  // / PHASE_EXECUTE / PHASE_VALIDATE / PHASE_COMPLETE while we expose
  // SPEC_WHY…TASK_VALIDATE for the executive. This is a coarse approximation
  // used only for shell-out mode.
  if (raw === 'PHASE_SPEC_PLAN' || raw === 'SPEC_PARSE') return 'SPEC_WHY';
  if (raw === 'PHASE_PLAN') return 'SPEC_WHAT';
  if (raw === 'PHASE_EXECUTE') return 'TASK_BUILD';
  if (raw === 'PHASE_VALIDATE') return 'TASK_VALIDATE';
  if (raw === 'PHASE_COMPLETE') return 'TASK_VALIDATE';
  return raw;
}

/**
 * Run a JS harness as a subprocess and stream synthetic HarnessEvents.
 */
export function runShellOutHarness(
  name: ShelloutHarnessName,
  config: HarnessRunConfig,
): AsyncIterable<HarnessEvent> {
  const bus = new HarnessEventBus();
  const layout = layoutFor(name);
  const statusPath = path.join(config.targetDir, layout.statusJsonRelative);

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

    const emittedPhases = new Set<string>();
    let lastPhase: string | undefined;

    const poll = setInterval(() => {
      const raw = readJsonIfExists(statusPath);
      if (!raw || typeof raw !== 'object') return;
      const status = raw as { phase?: string; currentPhase?: string };
      const cursor = normalizeGenericPhase(status.phase ?? status.currentPhase ?? '');
      if (!cursor) return;
      if (cursor !== lastPhase) {
        if (lastPhase && !emittedPhases.has(lastPhase)) {
          bus.emit({ type: 'phase_complete', phase: lastPhase, success: true, at: at() });
          emittedPhases.add(lastPhase);
        }
        bus.emit({ type: 'phase_start', phase: cursor, at: at() });
        lastPhase = cursor;
      }
      bus.emit({ type: 'status_written', path: statusPath });
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
      if (lastPhase && !emittedPhases.has(lastPhase)) {
        bus.emit({
          type: 'phase_complete',
          phase: lastPhase,
          success: code === 0,
          at: at(),
        });
      }
      bus.emit({
        type: 'run_complete',
        success: code === 0,
        errors: code === 0 ? undefined : [`harness subprocess exited with code ${code}`],
        at: at(),
      });
      bus.close();
    });
  })().catch((err) => {
    bus.emit({ type: 'run_failed', error: String(err), at: new Date().toISOString() });
    bus.close();
  });

  return bus;
}

function envFromModelOverrides(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    env[`MODEL_${key.toUpperCase()}`] = value;
  }
  return env;
}
