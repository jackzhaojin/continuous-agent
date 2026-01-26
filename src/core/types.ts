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
 * Individual step within a multi-step task
 * Steps are tracked inline in goals.md under parent tasks
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
}

/**
 * Work item from goals.md
 * Enhanced with step tracking for incremental execution
 */
export interface WorkItem {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'complete';

  // Output persistence - allows resuming work across restarts
  output_path?: string;     // Project directory for this task (persisted in goals.md)

  // Self-enhancement flag - when true, work modifies the agent itself
  // Detected by [SELF-ENHANCE] prefix in goal title
  selfEnhance?: boolean;

  // Branch tracking for self-enhancement tasks
  // Persisted in goals.md to allow resuming work on same branch
  branch?: string;

  // Step tracking for multi-step tasks
  steps?: WorkStep[];
  current_step?: number;    // Index of current step (0-based)
  progress_pct?: number;    // Calculated from completed steps
  breakdown_generated_at?: string; // When auto-breakdown was performed
}

/**
 * Task contract for worker delegation
 * Defines the scope and expectations for a worker agent
 */
export interface TaskContract {
  id: string;
  goal: string;
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
  output_path?: string; // Target folder in agent-outputs where work was done
  exit_code?: number; // Exit code from worker process (1 = failure, 0 = success)
}

/**
 * State of the executive loop
 */
export interface LoopState {
  running: boolean;
  iteration: number;
  last_work_at: string | null;
  current_task: string | null;
}
