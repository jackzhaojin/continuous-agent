/**
 * Harness core types — v2.2
 *
 * A Harness is a multi-agent plan-then-build pipeline that ships with its own
 * orchestrator. Harnesses live as first-class modules under src/harnesses/ and
 * are runnable two ways:
 *
 *   1. Standalone, via the unified CLI (src/harnesses/cli.ts).
 *   2. Wrapped as a meta-worker by the executive loop, through
 *      src/agentic/execution/harness-executor.ts and execution_pattern 'harness'.
 *
 * The HarnessOrchestrator interface is the single boundary both usage modes
 * sit behind.
 */

import type {
  AgentWorkerProvider,
  AgentWorkerVendor,
  AgentWorkerMessage,
} from '../../core/vendor/types.js';

export type HarnessModeType =
  | 'bootstrap'
  | 'adopt'
  | 'extend'
  | 'extend-deep'
  | 'resume';

export interface HarnessMode {
  type: HarnessModeType;
  reason: string;
  /** Raw STATUS.json contents if present (for resume/extend). */
  existingStatus?: unknown;
  /** Raw TASKS.json contents if present (generic/eds only). */
  existingTasks?: unknown;
}

export interface HarnessRunConfig {
  /** Absolute path to the PROMPT.md file that defines the work. */
  promptFile: string;
  /** Absolute path to the target working directory. May be outside ai-sandbox. */
  targetDir: string;
  mode: HarnessMode;
  /** Pre-resolved vendor provider (from vendor-registry.ts). */
  provider: AgentWorkerProvider;
  vendor: AgentWorkerVendor;
  /** Per-agent model overrides (e.g. { SPEC_WHY: 'opus', BUILD: 'kimi-k2.5' }). */
  modelOverrides: Record<string, string>;
  maxTurnsPerAgent?: number;
  abortSignal?: AbortSignal;
  /** Executive-mode only: events are routed through this sink into STEPS.json. */
  stepSink?: StepSink;
}

/**
 * Side-channel used by executive mode to mirror harness events into STEPS.json.
 * Standalone CLI sets this to undefined.
 */
export interface StepSink {
  onPhaseStart(phase: string): Promise<void>;
  onPhaseComplete(phase: string, ok: boolean): Promise<void>;
  onSubtaskCreated(subtask: { id: string; title: string; parent: string }): Promise<void>;
  onRetry(phase: string, attempt: number, max: number, reason: string): Promise<void>;
}

export type HarnessEvent =
  | { type: 'run_start'; harness: string; mode: HarnessModeType; target: string; at: string }
  | { type: 'phase_start'; phase: string; agent?: string; at: string }
  | { type: 'phase_complete'; phase: string; success: boolean; artifacts?: string[]; at: string }
  | { type: 'agent_start'; agent: string; model: string; vendor: string; at: string }
  | {
      type: 'agent_message';
      agent: string;
      role: 'assistant' | 'user' | 'system';
      text?: string;
      raw: unknown;
    }
  | {
      type: 'agent_complete';
      agent: string;
      success: boolean;
      errors?: string[];
      duration_ms: number;
    }
  | { type: 'subtask_created'; subtask_id: string; parent: string; reason: string }
  | { type: 'retry_scheduled'; agent: string; attempt: number; max: number; reason: string }
  | { type: 'status_written'; path: string }
  | { type: 'run_complete'; success: boolean; errors?: string[]; at: string }
  | { type: 'run_failed'; error: string; at: string };

export interface HarnessStatePhase {
  name: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  attempts: number;
}

export interface HarnessStateTask {
  id: string;
  title: string;
  status: string;
  attempts: number;
}

export interface HarnessState {
  mode: HarnessModeType;
  phases: HarnessStatePhase[];
  tasks: HarnessStateTask[];
  statusJsonPath: string;
  tasksJsonPath?: string;
}

/**
 * The interface every harness module (generic, eds, study, …) must implement.
 * Registered in src/harnesses/core/harness-registry.ts.
 */
export interface HarnessOrchestrator {
  readonly name: string;
  /**
   * Static ordered list of phase names. Used by the executive mode to pre-seed
   * STEPS.json before the run() generator is drained. Must be known at
   * construction time — not discovered mid-run.
   */
  readonly phaseList: readonly string[];

  detectMode(targetDir: string, promptFile: string): Promise<HarnessMode>;

  /**
   * Execute the harness as a single async generator. Each `agent_message`
   * event wraps an `AgentWorkerMessage` from the underlying provider so
   * harness-executor.ts can re-emit them into the standard worker transcript.
   */
  run(config: HarnessRunConfig): AsyncIterable<HarnessEvent>;

  getState(targetDir: string): Promise<HarnessState>;
}

// ── Vendor-agnostic agent runner config ─────────────────────────

export interface SkillBody {
  name: string;
  body: string;
}

export interface RunHarnessAgentArgs {
  /** Human name of the agent being invoked (e.g. 'spec_why', 'task_build', 'coordinator'). */
  agentName: string;
  /** Composed prompt markdown, pre-adaptation. */
  promptMarkdown: string;
  /** Resolved model string for this call. */
  model: string;
  /** Working directory for the agent (typically the harness target dir). */
  cwd: string;
  /** Claude-native tool names — e.g. ['Read', 'Write', 'Bash']. Mapped per vendor. */
  allowedTools: string[];
  maxTurns: number;
  provider: AgentWorkerProvider;
  vendor: AgentWorkerVendor;
  /** Study harness only — skill bodies eagerly injected for non-Claude vendors. */
  skillBodies?: SkillBody[];
  /** Optional CLAUDE.md content to inject for non-Claude vendors. */
  claudeMdContent?: string;
  abortSignal?: AbortSignal;
}

/** The return type of runHarnessAgent — a pass-through message stream. */
export type HarnessAgentMessageStream = AsyncIterable<AgentWorkerMessage>;
