/**
 * Shared TypeScript types for the Continuous Executive Agent
 */

/**
 * Worker execution pattern (V2.0)
 */
export type ExecutionPattern =
  | 'plan-then-execute'
  | 'loop-until-progress'
  | 'plan-mode'
  | 'deterministic-pipeline'
  | 'harness';

/**
 * Individual health check result
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

/**
 * Overall health status of the system
 */
export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  timestamp: string;
}

/**
 * Individual step within a multi-step goal.
 * Used at runtime in the executive loop and stored in STEPS.json per goal bundle.
 *
 * The runtime shape uses `step_number` (numeric) while the on-disk STEPS.json shape
 * uses `id` (string like "step-0") + `order`. Both sets of fields are present here;
 * runtime code primarily uses `step_number`, while STEPS.json I/O uses `id`/`order`.
 */
/**
 * Origin of a step — how it landed in STEPS.json.
 *
 * - `breakdown`         — created by the initial LLM breakdown of the goal
 * - `re_breakdown`      — created when an earlier step failed and was re-broken
 * - `prerequisite`      — hard-locked setup step (e.g., DB schema + seed data)
 * - `integration_gate`  — end-to-end journey verification gate
 * - `validator_defect`  — filed by an integration-validator worker after a failed gate
 */
export type StepOrigin =
  | 'breakdown'
  | 're_breakdown'
  | 'prerequisite'
  | 'integration_gate'
  | 'validator_defect';

/**
 * "Kind" of a step — what pattern of worker should handle it.
 *
 * - `build`              — normal implementation work (default)
 * - `user_visible_build` — build step where the change is user-facing; triggers Phase 5b validator worker
 * - `integration_gate`   — a dedicated E2E journey-verification step (also triggers Phase 5b)
 * - `prerequisite`       — schema/seed/setup step that blocks all downstream UI
 */
export type StepKind =
  | 'build'
  | 'user_visible_build'
  | 'integration_gate'
  | 'prerequisite';

/**
 * Structured evidence attached to a validator-filed defect step.
 */
export interface DefectEvidence {
  title: string;
  root_cause?: string;
  evidence?: string;
  acceptance_criteria?: string[];
  filed_by_contract?: string;
  filed_at?: string;
  parent_step_id?: string;
  regression_failures?: string[];
}

/**
 * Structured handoff content written by a worker at the end of a step.
 * Read by the next step's worker AND by the integration-validator.
 */
export interface StructuredHandoff {
  step_id?: string;
  what_i_built?: string;
  what_connects?: string;
  what_i_verified?: string;
  known_gaps?: string;
  next_step_should_know?: string;
  journey_blocks_added?: number;  // How many blocks added to tests/e2e/journey.spec.ts this step
}

export interface WorkStep {
  step_number: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  dependencies?: number[];  // Step numbers this depends on (0-based)
  estimated_turns?: number;
  actual_turns?: number;
  output_path?: string;
  completed_at?: string;
  started_at?: string;
  re_breakdown_count?: number; // Track re-breakdowns for exit code 1 handling
  retry_count?: number;        // Persisted retry attempts (survives PM2 restarts)
  completed_by_contract?: string;
  build_health?: 'pass' | 'fail' | 'skip';
  build_error?: string | null;
  // On-disk STEPS.json fields (optional at runtime)
  id?: string;                  // Stable identifier (e.g., "step-0", "step-5.1", "step-5.1.1")
  order?: number;               // Execution order (0-based, mirrors step_number)

  // Hierarchical defect-subtask fields (v2.1.7)
  parent_id?: string | null;        // Parent step ID if this is a subtask (e.g., "step-5" for "step-5.1")
  subtask_of?: string | null;       // Alias of parent_id used by filing APIs — same value
  origin?: StepOrigin;              // How this step landed in STEPS.json
  kind?: StepKind;                  // What kind of worker should handle this step
  blocks_parent?: boolean;          // Parent cannot be marked complete until this passes (default: true for defect subtasks)
  blocked_on_subtask?: boolean;     // Set on parent when it has an open defect subtask
  defect_evidence?: DefectEvidence; // Attached by the validator when origin === 'validator_defect'

  // Structured handoff from the worker that completed this step
  handoff?: StructuredHandoff;
}

/**
 * STEPS.json file schema — per-bundle source of truth for step tracking
 * (Reads STEPS.json first, falls back to TASKS.json for backward compat)
 */
export interface StepsFile {
  version: number;
  created_at: string;
  trigger: 'auto' | 're-breakdown' | 'manual';
  revision: number;        // Bumped on every write
  steps: WorkStep[];
}

/**
 * Work item from goal bundle
 * Enhanced with step tracking for incremental execution
 */
export interface WorkItem {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'complete';

  // Output persistence - allows resuming work across restarts
  output_path?: string;     // Project directory for this task (persisted in PROMPT.md frontmatter)

  // Self-enhancement flag - when true, work modifies the agent itself
  // Detected by [SELF-ENHANCE] prefix in goal title
  selfEnhance?: boolean;

  // Skill-build flag - when true, worker builds a Claude Code skill
  // Detected by [SKILL-BUILD] prefix in goal title
  // Routes to agent codebase (like selfEnhance) and uses skill-builder subagent
  skillBuild?: boolean;

  // Branch tracking for self-enhancement and skill-build tasks
  // Persisted in PROMPT.md frontmatter to allow resuming work on same branch
  branch?: string;

  // Step tracking for multi-step tasks
  steps?: WorkStep[];
  current_step?: number;    // Index of current step (0-based)
  progress_pct?: number;    // Calculated from completed steps
  breakdown_generated_at?: string; // When auto-breakdown was performed

  // V1.2: Goal bundle source path
  source_path?: string;     // Path to goal bundle directory

  // V1.2: Multi-project access - reference to source project for copy-in
  source_project?: string;    // Slug of source project to copy from

  // Per-goal turn override — set in PROMPT.md frontmatter for turn-intensive tasks (e.g., Playwright)
  max_turns?: number;

  // V2.0: Execution pattern override from PROMPT.md frontmatter
  // When set, takes highest precedence in pattern resolution (over playbook default)
  execution_pattern?: ExecutionPattern;

  // V2.1: Per-goal worker vendor override from PROMPT.md frontmatter
  // Priority: goal frontmatter > WORKER_VENDOR env > 'claude' default
  worker_vendor?: 'claude' | 'codex' | 'kimi' | 'kimi-cli' | 'kimi-wire';

  // V2.2: Harness execution pattern fields (only meaningful when execution_pattern='harness')
  harness?: string;               // 'generic' | 'eds' | 'study' — which harness to run
  harness_target?: string;        // Absolute or repo-relative target dir for harness run
  harness_mode?: 'bootstrap' | 'adopt' | 'extend' | 'extend-deep' | 'resume';
  model_overrides?: Record<string, string>;  // Per-agent model overrides for harness

  // v2.1.7: Integration/data contract fields from PROMPT.md frontmatter
  //
  // `definition_of_done_journey`: concrete user flow the product must execute end-to-end.
  //   Required on UI goals — the executive refuses to start without it.
  //   Example: "Fill shipment form → submit → rates page loads quote → select → payment → confirm → reference number displayed"
  definition_of_done_journey?: string;

  // `data_requirements`: prerequisites for the goal — schema, seed data, endpoints.
  //   Breakdown Pass A reads this and prepends a hard-locked prerequisite step.
  data_requirements?: string;

  // `integration_gate_cadence`: override the automatic N-step gate spacing. Default: auto.
  integration_gate_cadence?: number;
}

/**
 * Worker contract for worker delegation
 * Defines the scope and expectations for a worker agent
 */
export interface WorkerContract {
  id: string;
  prompt: string;
  scope: {
    repos_allowed: string[];
    tools_allowed: string[];
  };
  definition_of_done: string[];
  max_turns: number;
  risk_assessment: string;
  required_skills: string[];
  logging_obligations: string[];
  created_at: string;
}

/**
 * Result from a worker agent execution
 */
export interface WorkerResult {
  success: boolean;
  output: string;
  artifacts: string[];
  errors: string[];
  duration_ms: number;
  output_path?: string; // Target folder in ai-sandbox where work was done
  exit_code?: number; // Exit code from worker process (1 = failure, 0 = success)
}

/**
 * State of the executive loop
 */
export interface LoopState {
  running: boolean;
  iteration: number;
  last_work_at: string | null;
  current_contract: string | null;
}
