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
 * Work item from goals.md
 */
export interface WorkItem {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  description: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'complete';
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
