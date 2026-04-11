/**
 * Study harness orchestrator — native TypeScript port.
 *
 * Ported from study-harness-v2026-03-v1/src/orchestrator.js. Unlike the generic
 * and eds harnesses (which drive every agent themselves), the study harness
 * delegates the entire 7-phase pipeline to a single coordinator agent that
 * uses Claude's native Task and Skill tools to spawn specialists from
 * src/harnesses/study/agents/<name>/AGENT.md and invoke skills from
 * src/harnesses/study/skills/<name>/SKILL.md.
 *
 * ## Vendor support (P5)
 *
 * Vendor parity for the study harness is currently **Claude-only**. The
 * coordinator relies on the Claude Agent SDK's `Task` and `Skill` tools,
 * which are provider-native and can't be emulated without a custom
 * `__spawn__` JSON protocol + stream interception layer. The scaffolding
 * for that emulation is intentionally NOT shipped in P5 — it's a large and
 * risky piece that would block the rest of v2.2.
 *
 * A Codex/Kimi port of the coordinator is tracked as a known-gap and should
 * be done in v2.3 alongside the P6 consolidation (generic + eds shared base).
 *
 * ## What this orchestrator does
 *
 *   1. Creates the target directory skeleton (ai-docs/phases/, research/,
 *      sources/, podcasts/scripts/, podcasts/audio/).
 *   2. Loads the study state from ai-docs/STATUS.json and marks the run as
 *      RUNNING.
 *   3. Loads the coordinator AGENT.md, applies context substitution, and
 *      invokes it via runHarnessAgent() using Claude SDK's native Task/Skill.
 *   4. After the coordinator returns, re-reads STATUS.json and emits a
 *      final phase_complete + run_complete with the pipeline's terminal
 *      phase.
 */

import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HarnessEventBus } from '../core/harness-event-bus.js';
import { runHarnessAgent, didAgentPass } from '../core/harness-agent-runner.js';
import type {
  HarnessEvent,
  HarnessRunConfig,
} from '../core/types.js';
import type { AgentWorkerMessage } from '../../core/vendor/types.js';
import {
  appendProgress,
  loadState,
  saveState,
  PHASES,
} from './state-store.js';
import { loadAgent } from './agent-loader.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export function runStudyOrchestrator(config: HarnessRunConfig): AsyncIterable<HarnessEvent> {
  const bus = new HarnessEventBus();

  (async () => {
    try {
      bus.emit({
        type: 'run_start',
        harness: 'study',
        mode: config.mode.type,
        target: config.targetDir,
        at: new Date().toISOString(),
      });
      await orchestrate(config, bus);
      bus.emit({
        type: 'run_complete',
        success: true,
        at: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bus.emit({
        type: 'run_failed',
        error: msg,
        at: new Date().toISOString(),
      });
      bus.emit({
        type: 'run_complete',
        success: false,
        errors: [msg],
        at: new Date().toISOString(),
      });
    } finally {
      bus.close();
    }
  })();

  return bus;
}

async function orchestrate(config: HarnessRunConfig, bus: HarnessEventBus): Promise<void> {
  const targetDir = config.targetDir;

  // Vendor gate — warn loudly if not Claude.
  if (config.vendor !== 'claude') {
    const msg =
      `[study] WARNING: vendor '${config.vendor}' is not fully supported yet. ` +
      `The coordinator relies on Claude SDK's native Task/Skill tools. ` +
      `Run with --vendor claude for a supported configuration. P5 deferred __spawn__ emulation to v2.3.`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    await appendProgress(targetDir, msg);
  }

  // Setup directories
  await mkdir(join(targetDir, 'ai-docs', 'phases'), { recursive: true });
  await mkdir(join(targetDir, 'research'), { recursive: true });
  await mkdir(join(targetDir, 'sources'), { recursive: true });
  await mkdir(join(targetDir, 'podcasts', 'scripts'), { recursive: true });
  await mkdir(join(targetDir, 'podcasts', 'audio'), { recursive: true });

  const state = await loadState(targetDir);

  if (state.pipeline === 'COMPLETE') {
    await appendProgress(
      targetDir,
      'Pipeline already COMPLETE. Coordinator not invoked. Use a regen-style run to re-execute phases.',
    );
    return;
  }

  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
    state.pipeline = 'RUNNING';
    await saveState(targetDir, state);
  }

  // Read manifest for logging (tolerate missing/invalid)
  let manifestTitle = 'unknown';
  try {
    const manifestContent = await readFile(config.promptFile, 'utf-8');
    const parsed = parseSimpleYamlOrJson(manifestContent);
    if (parsed && typeof parsed === 'object') {
      const m = parsed as Record<string, unknown>;
      manifestTitle = (m.title as string) || (m.name as string) || 'unknown';
    }
  } catch {}

  await appendProgress(targetDir, `PIPELINE STARTED — ${manifestTitle} (vendor=${config.vendor})`);

  // Emit a coarse phase_start for each study phase so the executive UI sees
  // the 7-row pipeline from turn 0. The coordinator will drive the actual
  // status transitions via STATUS.json writes.
  for (const phase of PHASES) {
    bus.emit({ type: 'phase_start', phase, at: new Date().toISOString() });
  }

  // Harness root for SDK settingSources discovery: .claude/agents/ must be
  // reachable from workDir. We point workDir at src/harnesses/study/ so the
  // SDK sees sibling .claude/agents/ symlinks, but since the TS port stores
  // agents under ./agents/ (not .claude/agents/), Task tool auto-discovery
  // WILL miss them. The coordinator prompt uses {{HARNESS_ROOT}} paths to
  // compensate — specialists are invoked via inline `Skill` loads from the
  // harness root.
  const harnessRoot = HERE;

  const coordinatorContext = {
    TARGET_DIR: targetDir,
    MANIFEST_PATH: config.promptFile,
    HARNESS_ROOT: harnessRoot,
    INCLUDE_PODCASTS: 'false',
    DESIGN_REF_DIR: join(harnessRoot, 'design-reference'),
    QUIZ_QUESTIONS_PER_DOMAIN: '5',
    ENHANCEMENT_MODE: 'false',
  };

  const coordinator = await loadAgent('coordinator', coordinatorContext);

  bus.emit({
    type: 'agent_start',
    agent: 'coordinator',
    model: coordinator.model || 'claude-sonnet-4-6',
    vendor: config.vendor,
    at: new Date().toISOString(),
  });

  const result = await runHarnessAgent({
    agentName: 'coordinator',
    promptMarkdown: coordinator.prompt,
    model: coordinator.model || config.modelOverrides.coordinator || 'claude-sonnet-4-6',
    cwd: harnessRoot,
    allowedTools: coordinator.tools.length ? coordinator.tools : ['Task', 'Skill', 'Bash', 'Read', 'Write', 'Glob', 'Grep'],
    maxTurns: config.maxTurnsPerAgent ?? 300,
    provider: config.provider,
    vendor: config.vendor,
    abortSignal: config.abortSignal,
  });

  for (const msg of result.messages) {
    bus.emit({
      type: 'agent_message',
      agent: 'coordinator',
      role: toRole(msg),
      text: msg.text,
      raw: msg.raw,
    });
  }

  bus.emit({
    type: 'agent_complete',
    agent: 'coordinator',
    success: didAgentPass(result),
    errors: result.errors,
    duration_ms: result.durationMs,
  });

  const finalState = await loadState(targetDir);
  await appendProgress(
    targetDir,
    `Coordinator agent finished — pipeline: ${finalState.pipeline}`,
  );

  // Emit per-phase completion based on final state
  for (const phase of PHASES) {
    const ps = finalState.phases[phase];
    if (ps?.status === 'complete') {
      bus.emit({
        type: 'phase_complete',
        phase,
        success: true,
        at: new Date().toISOString(),
      });
    } else if (ps?.status === 'failed') {
      bus.emit({
        type: 'phase_complete',
        phase,
        success: false,
        at: new Date().toISOString(),
      });
    }
  }

  if (!didAgentPass(result)) {
    throw new Error(
      `Study coordinator failed: ${result.errors.join(', ') || 'unknown error'}`,
    );
  }
}

function toRole(msg: AgentWorkerMessage): 'assistant' | 'user' | 'system' {
  if (msg.type === 'assistant') return 'assistant';
  if (msg.type === 'user') return 'user';
  return 'system';
}

/**
 * Minimal manifest parser — tries JSON first, then falls back to a
 * top-level key extraction for YAML. We only need `title`/`name` for logging,
 * so a full YAML parser is overkill.
 */
function parseSimpleYamlOrJson(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  // crude YAML scrape for top-level scalars
  const out: Record<string, string> = {};
  for (const line of trimmed.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
