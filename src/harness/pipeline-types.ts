/**
 * Pipeline types for the deterministic-pipeline execution pattern.
 *
 * A pipeline is a fixed ordered sequence of steps where each step spawns
 * a worker with a specific playbook. Step N's output feeds step N+1.
 */

/**
 * A single step within a pipeline playbook's `pipeline_steps` array.
 * Parsed from YAML frontmatter in the playbook SKILL.md.
 */
export interface PipelineStep {
  /** 1-based step number */
  step: number;
  /** Human-readable step name (e.g. "research", "build", "validate") */
  name: string;
  /** Reference to a playbook (e.g. "worker/build-from-plan") */
  playbook: string;
  /** Worker type hint — influences model/tool selection */
  worker_type: string;
  /** Number of retries before marking this step as failed (default 2) */
  retries: number;
  /** Optional condition that must be met for this step to run */
  condition?: string;
  /** Description of what this step produces (e.g. "CONSTITUTION.md", "code_changes") */
  output: string;
}

/**
 * Result of executing a single pipeline step.
 */
export interface StepResult {
  /** Step name */
  name: string;
  /** Step number (1-based) */
  step: number;
  /** Whether the step succeeded */
  success: boolean;
  /** Path to the output produced by this step (within the project directory) */
  output_path?: string;
  /** Textual output/summary from the worker */
  output_text?: string;
  /** Error message if the step failed */
  error?: string;
  /** Duration of this step in milliseconds */
  duration_ms: number;
  /** Number of attempts made (including retries) */
  attempts: number;
}

/**
 * Overall result of a full pipeline execution.
 */
export interface PipelineResult {
  /** Whether every step succeeded */
  success: boolean;
  /** Results for each step, in execution order */
  step_results: StepResult[];
  /** Total pipeline duration in milliseconds */
  duration_ms: number;
  /** Path to the project directory where work was done */
  output_path?: string;
  /** Name of the pipeline playbook that was executed */
  pipeline_name: string;
}

/**
 * Parse raw pipeline_steps from playbook frontmatter into typed PipelineStep[].
 * Tolerant of missing fields — applies defaults where possible.
 */
export function parsePipelineSteps(raw: unknown): PipelineStep[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const steps: PipelineStep[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;

    const step = typeof record.step === 'number' ? record.step : steps.length + 1;
    const name = typeof record.name === 'string' ? record.name : `step-${step}`;
    const playbook = typeof record.playbook === 'string' ? record.playbook : '';
    const worker_type = typeof record.worker_type === 'string' ? record.worker_type : 'build';
    const retries = typeof record.retries === 'number' ? record.retries : 2;
    const condition = typeof record.condition === 'string' ? record.condition : undefined;
    const output = typeof record.output === 'string' ? record.output : '';

    // playbook is required — skip steps without it
    if (!playbook) {
      continue;
    }

    steps.push({ step, name, playbook, worker_type, retries, condition, output });
  }

  return steps;
}
