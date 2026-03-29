import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const DASHBOARD_DATA_PATH = path.join(process.cwd(), '..', 'workspace', 'dashboard-data.json');

const EMPTY_DATA = {
  generated_at: '',
  agent_status: {
    loop_running: false,
    current_phase: 0,
    active_worker: null,
  },
  goal_pipeline: { drafts: [], ondeck: [], in_progress: [], blocked: [] },
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

export async function GET() {
  try {
    if (!existsSync(DASHBOARD_DATA_PATH)) {
      return NextResponse.json(EMPTY_DATA);
    }

    const content = await readFile(DASHBOARD_DATA_PATH, 'utf-8');
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(EMPTY_DATA);
  }
}
