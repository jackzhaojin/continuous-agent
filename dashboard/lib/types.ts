/**
 * Dashboard data types — mirrors the schema from dashboard-data.json
 */

export interface ActiveWorker {
  goal_slug: string;
  execution_pattern?: string;
  started_at: string;
  turn_count?: number;
  max_turns?: number;
}

export interface AgentStatus {
  loop_running: boolean;
  current_phase: number;
  active_worker: ActiveWorker | null;
  last_inbox_check?: string;
  last_slack_sent?: string;
}

export interface GoalSummary {
  slug: string;
  title: string;
  created?: string;
  priority?: string;
  status?: string;
  execution_pattern?: string;
  step?: string;
  started_at?: string;
  blocked_reason?: string;
  blocked_since?: string;
}

export interface GoalPipeline {
  drafts: GoalSummary[];
  ondeck: GoalSummary[];
  in_progress: GoalSummary[];
  blocked: GoalSummary[];
}

export interface NeedsYouItem {
  id: string;
  priority: string;
  title: string;
  added: string;
  goal_slug?: string;
}

export interface ActivityEntry {
  timestamp: string;
  event: string;
  goal?: string;
  pattern?: string;
  duration_minutes?: number;
  [key: string]: unknown;
}

export interface SkillHealth {
  name: string;
  category: 'skill' | 'playbook';
  confidence: number;
  maturity: string;
  executions: number;
}

export interface DashboardStats {
  goals_completed_7d: number;
  goals_blocked: number;
  avg_completion_minutes: number;
  retry_rate: number;
  total_worker_turns_7d: number;
}

export interface DashboardData {
  generated_at: string;
  agent_status: AgentStatus;
  goal_pipeline: GoalPipeline;
  needs_you: NeedsYouItem[];
  activity_feed: ActivityEntry[];
  skill_health: SkillHealth[];
  stats: DashboardStats;
}

/** Default empty dashboard data */
export const EMPTY_DASHBOARD: DashboardData = {
  generated_at: '',
  agent_status: {
    loop_running: false,
    current_phase: 0,
    active_worker: null,
  },
  goal_pipeline: {
    drafts: [],
    ondeck: [],
    in_progress: [],
    blocked: [],
  },
  needs_you: [],
  activity_feed: [],
  skill_health: [],
  stats: {
    goals_completed_7d: 0,
    goals_blocked: 0,
    avg_completion_minutes: 0,
    retry_rate: 0,
    total_worker_turns_7d: 0,
  },
};
