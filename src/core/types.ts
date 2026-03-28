/**
 * Shared TypeScript types for the Continuous Executive Agent
 */

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
  // On-disk STEPS.json fields (optional at runtime)
  id?: string;                  // Stable identifier (e.g., "step-0")
  order?: number;               // Execution order (0-based, mirrors step_number)
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
