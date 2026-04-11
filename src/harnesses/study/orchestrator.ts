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
 * ## Vendor support
 *
 * Claude continues to use the native coordinator flow (Task/Skill tooling).
 * Non-Claude vendors (Codex/Kimi) use a deterministic fallback path that
 * runs specialist agents phase-by-phase from the orchestrator. This keeps the
 * study harness runnable end-to-end across vendors without requiring
 * provider-native Task/Skill support.
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

  if (config.vendor !== 'claude') {
    await appendProgress(
      targetDir,
      `[study] vendor=${config.vendor}: using orchestrator-managed specialist flow (Task/Skill-free compatibility mode)`,
    );
    await runSpecialistFallback(config, bus, state, harnessRoot, coordinatorContext);
    return;
  }

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

async function runSpecialistFallback(
  config: HarnessRunConfig,
  bus: HarnessEventBus,
  state: Awaited<ReturnType<typeof loadState>>,
  harnessRoot: string,
  coordinatorContext: Record<string, string>,
): Promise<void> {
  const pipeline = [
    { phase: 'DECOMPOSE', agent: 'topic-decompose' },
    { phase: 'RESEARCH', agent: 'research' },
    { phase: 'SYNTHESIZE', agent: 'synthesize' },
    { phase: 'CONTENT', agent: 'podcast-script' },
    { phase: 'TTS', agent: 'quiz-gen' },
    { phase: 'DEPOSIT', agent: 'ui-scaffold' },
    { phase: 'VALIDATE', agent: 'ui-validate' },
  ] as const;

  for (const step of pipeline) {
    const phaseState = state.phases[step.phase];
    if (phaseState?.status === 'complete') {
      bus.emit({
        type: 'phase_complete',
        phase: step.phase,
        success: true,
        at: new Date().toISOString(),
      });
      continue;
    }

    const context = buildFallbackContext(config, coordinatorContext);
    const specialist = await loadAgent(step.agent, context);
    const model = specialist.model || config.modelOverrides[step.agent] || 'claude-sonnet-4-6';

    bus.emit({
      type: 'agent_start',
      agent: step.agent,
      model,
      vendor: config.vendor,
      at: new Date().toISOString(),
    });

    const result = await runHarnessAgent({
      agentName: step.agent,
      promptMarkdown: specialist.prompt,
      model,
      cwd: harnessRoot,
      allowedTools: specialist.tools.length ? specialist.tools : ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
      maxTurns: config.maxTurnsPerAgent ?? 160,
      provider: config.provider,
      vendor: config.vendor,
      abortSignal: config.abortSignal,
    });

    for (const msg of result.messages) {
      bus.emit({
        type: 'agent_message',
        agent: step.agent,
        role: toRole(msg),
        text: msg.text,
        raw: msg.raw,
      });
    }

    const pass = didAgentPass(result);
    bus.emit({
      type: 'agent_complete',
      agent: step.agent,
      success: pass,
      errors: result.errors,
      duration_ms: result.durationMs,
    });

    await markPhase(state, step.phase, pass, result.errors.join(', ') || null);
    await saveState(config.targetDir, state);
    await appendProgress(
      config.targetDir,
      `[study] ${step.phase} via ${step.agent} (${config.vendor}) => ${pass ? 'pass' : 'fail'}`,
    );

    bus.emit({
      type: 'phase_complete',
      phase: step.phase,
      success: pass,
      at: new Date().toISOString(),
    });

    if (!pass) {
      state.pipeline = 'FAILED';
      await saveState(config.targetDir, state);
      throw new Error(`Study phase ${step.phase} failed with ${config.vendor}: ${result.errors.join(', ') || 'unknown error'}`);
    }
  }

  state.pipeline = 'COMPLETE';
  state.currentPhase = null;
  state.currentActivity = null;
  await saveState(config.targetDir, state);
}

function buildFallbackContext(
  config: HarnessRunConfig,
  coordinatorContext: Record<string, string>,
): Record<string, string> {
  const base = {
    ...coordinatorContext,
    INPUT_PATH: config.promptFile,
    SOURCE_URL: config.promptFile,
    TOPIC_ID: 'topic-1',
    TOPIC_TITLE: 'Primary Study Topic',
    TOPIC_DESCRIPTION: 'Core content extracted from manifest',
    RESEARCH_DIR: join(config.targetDir, 'research'),
    SYNTHESIS_PATH: join(config.targetDir, 'research', 'synthesis.md'),
    QUESTIONS_PER_DOMAIN: '5',
    DOMAIN_ID: 'domain-1',
    DOMAIN_TITLE: 'Primary Domain',
    DEV_SERVER_URL: 'http://localhost:4173',
    SCAFFOLD_MODE: 'bootstrap',
  };
  return {
    ...base,
    OUTPUT_PATH: join(config.targetDir, 'ai-docs', 'phases', 'fallback-output.md'),
    RESEARCH_PATH: join(config.targetDir, 'research', 'synthesis.md'),
  };
}

async function markPhase(
  state: Awaited<ReturnType<typeof loadState>>,
  phase: (typeof PHASES)[number],
  success: boolean,
  error: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const prev = state.phases[phase];
  const startedAt = prev.startedAt ?? now;
  const durationSeconds = Math.max(
    0,
    Math.round((Date.parse(now) - Date.parse(startedAt)) / 1000),
  );

  state.currentPhase = phase;
  state.currentActivity = success ? 'complete' : 'failed';
  state.phases[phase] = {
    ...prev,
    status: success ? 'complete' : 'failed',
    attempts: (prev.attempts ?? 0) + 1,
    error: success ? null : error,
    startedAt,
    completedAt: now,
    durationSeconds,
  };
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
