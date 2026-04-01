/**
 * Dashboard Writer - DETERMINISTIC
 *
 * Aggregates current agent state into workspace/dashboard-data.json
 * Called from the executive loop Phase 7 (state update).
 *
 * Data sources:
 * - Goal pipeline: scan workspace directories (drafts, ondeck, in-progress, completed)
 * - Active worker: passed from loop state
 * - Needs-you queue: parse workspace/needs-you.md
 * - Activity feed: last 200 entries from ledgers/work-ledger.jsonl
 * - Skill health: load skills/playbooks directories and extract track_records
 * - Stats: compute from work-ledger.jsonl (7-day window)
 *
 * Atomic write: temp file + rename to prevent partial reads.
 */

import { readFile, writeFile, readdir, rename as fsRename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logDeterministic } from '../core/logging.js';
import { parsePromptMd } from './prompt-md-parser.js';
import { readStepsJson, stepsJsonToWorkSteps } from './steps-json-handler.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');
const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');
const SKILLS_DIR = path.join(process.cwd(), 'skills');
const PLAYBOOKS_DIR = path.join(process.cwd(), 'playbooks');

const ACTIVITY_FEED_CAP = 200;

// --- Interfaces for dashboard-data.json ---

export interface DashboardActiveWorker {
  goal_slug: string;
  execution_pattern?: string;
  started_at: string;
  turn_count?: number;
  max_turns?: number;
}

export interface DashboardAgentStatus {
  loop_running: boolean;
  current_phase: number;
  active_worker: DashboardActiveWorker | null;
  last_inbox_check?: string;
  last_discord_sent?: string;
}

export interface DashboardGoalSummary {
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

export interface DashboardGoalPipeline {
  drafts: DashboardGoalSummary[];
  ondeck: DashboardGoalSummary[];
  in_progress: DashboardGoalSummary[];
  blocked: DashboardGoalSummary[];
}

export interface DashboardNeedsYouItem {
  id: string;
  priority: string;
  title: string;
  added: string;
  goal_slug?: string;
}

export interface DashboardActivityEntry {
  timestamp: string;
  event: string;
  goal?: string;
  pattern?: string;
  duration_minutes?: number;
  [key: string]: unknown;
}

export interface DashboardSkillHealth {
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
  agent_status: DashboardAgentStatus;
  goal_pipeline: DashboardGoalPipeline;
  needs_you: DashboardNeedsYouItem[];
  activity_feed: DashboardActivityEntry[];
  skill_health: DashboardSkillHealth[];
  stats: DashboardStats;
}

// --- Active worker context (set by executive loop) ---

let _activeWorker: DashboardActiveWorker | null = null;
let _currentPhase = 0;
let _loopRunning = true;

/**
 * Set the active worker context. Called from executive loop during Phase 4.
 */
export function setDashboardActiveWorker(worker: DashboardActiveWorker | null): void {
  _activeWorker = worker;
}

/**
 * Set the current loop phase. Called from executive loop at each phase transition.
 */
export function setDashboardPhase(phase: number): void {
  _currentPhase = phase;
}

/**
 * Set loop running state.
 */
export function setDashboardLoopRunning(running: boolean): void {
  _loopRunning = running;
}

// --- Scanning helpers ---

async function listSubdirs(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) return [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}

async function readGoalSummary(goalDir: string): Promise<DashboardGoalSummary | null> {
  const promptPath = path.join(goalDir, 'PROMPT.md');
  if (!existsSync(promptPath)) return null;

  try {
    const parsed = await parsePromptMd(promptPath);
    const fm = parsed.frontmatter;
    const slug = fm.slug || path.basename(goalDir);
    const summary: DashboardGoalSummary = {
      slug,
      title: fm.title || slug,
      created: fm.created as string | undefined,
      priority: fm.priority,
      status: fm.status,
    };

    // Read step progress if STEPS.json exists
    const stepsFile = await readStepsJson(goalDir);
    if (stepsFile && stepsFile.steps.length > 0) {
      const completed = stepsFile.steps.filter(s => s.status === 'complete').length;
      summary.step = `${completed} of ${stepsFile.steps.length}`;
    }

    // Execution pattern from frontmatter if present
    if (fm.execution_pattern) {
      summary.execution_pattern = fm.execution_pattern as string;
    }

    return summary;
  } catch {
    return null;
  }
}

// --- Goal pipeline scanning ---

async function scanGoalPipeline(): Promise<DashboardGoalPipeline> {
  const pipeline: DashboardGoalPipeline = {
    drafts: [],
    ondeck: [],
    in_progress: [],
    blocked: [],
  };

  // Drafts
  for (const dir of await listSubdirs(path.join(WORKSPACE_DIR, 'drafts'))) {
    const summary = await readGoalSummary(dir);
    if (summary) pipeline.drafts.push(summary);
  }

  // Ondeck
  for (const dir of await listSubdirs(path.join(WORKSPACE_DIR, 'ondeck'))) {
    const summary = await readGoalSummary(dir);
    if (summary) pipeline.ondeck.push(summary);
  }

  // In-progress (P0-P4)
  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    const priorityDir = path.join(WORKSPACE_DIR, 'in-progress', priority);
    for (const dir of await listSubdirs(priorityDir)) {
      const summary = await readGoalSummary(dir);
      if (summary) {
        summary.priority = summary.priority || priority;
        if (summary.status === 'blocked') {
          pipeline.blocked.push(summary);
        } else {
          pipeline.in_progress.push(summary);
        }
      }
    }
  }

  return pipeline;
}

// --- Needs-you parsing ---

async function parseNeedsYouItems(): Promise<DashboardNeedsYouItem[]> {
  const filePath = path.join(WORKSPACE_DIR, 'needs-you.md');
  if (!existsSync(filePath)) return [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const items: DashboardNeedsYouItem[] = [];
    const lines = content.split('\n');

    let inActionsTable = false;
    let headerSeen = false;
    let itemIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes('## Actions Needed')) {
        inActionsTable = true;
        headerSeen = false;
        continue;
      }

      // Stop at next section
      if (inActionsTable && trimmed.startsWith('## ') && !trimmed.includes('Actions Needed')) {
        inActionsTable = false;
        continue;
      }

      if (!inActionsTable) continue;

      // Skip table header and separator
      if (trimmed.startsWith('| Action') || trimmed.startsWith('| ---') || trimmed.startsWith('|---')) {
        headerSeen = true;
        continue;
      }

      if (!headerSeen || !trimmed.startsWith('|')) continue;

      // Parse table row: | Action | Why | Response | Blocking | Since |
      const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 4) continue;

      const action = cells[0];
      const reason = cells[1];
      const response = cells[2] || '';
      const blocking = cells[3] || '';
      const since = cells[4] || '';

      // Skip placeholder rows
      if (action === '*None*' || action === '---') continue;
      // Skip rows that already have a response
      if (response && response.startsWith('[')) continue;

      items.push({
        id: `ny-${String(itemIndex++).padStart(3, '0')}`,
        priority: blocking.toLowerCase().includes('blocking') ? 'high' : 'normal',
        title: action,
        added: since || new Date().toISOString(),
        goal_slug: undefined,
      });
    }

    return items;
  } catch {
    return [];
  }
}

// --- Activity feed from work-ledger.jsonl ---

async function readActivityFeed(): Promise<DashboardActivityEntry[]> {
  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');
  if (!existsSync(ledgerPath)) return [];

  try {
    const content = await readFile(ledgerPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Take last ACTIVITY_FEED_CAP entries
    const recentLines = lines.slice(-ACTIVITY_FEED_CAP);

    const entries: DashboardActivityEntry[] = [];
    for (const line of recentLines) {
      try {
        const parsed = JSON.parse(line);
        entries.push({
          timestamp: parsed.ts || parsed.timestamp || '',
          event: (parsed.event || '').toLowerCase().replace(/_/g, '_'),
          goal: parsed.goal_slug || parsed.goal_title || parsed.goal || '',
          pattern: parsed.execution_pattern || parsed.pattern,
          duration_minutes: parsed.duration_minutes,
        });
      } catch {
        // Skip malformed lines
      }
    }

    // Reverse so newest first
    entries.reverse();
    return entries;
  } catch {
    return [];
  }
}

// --- Skill health from skills/ and playbooks/ directories ---

interface SkillYamlTrackRecord {
  confidence?: number;
  maturity?: string;
  executions?: number;
}

async function loadSkillHealthFromDir(
  dirPath: string,
  category: 'skill' | 'playbook'
): Promise<DashboardSkillHealth[]> {
  if (!existsSync(dirPath)) return [];

  const items: DashboardSkillHealth[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const skillDir = path.join(dirPath, entry.name);
      // Look for SKILL.md or PLAYBOOK.md
      const mdName = category === 'skill' ? 'SKILL.md' : 'PLAYBOOK.md';
      const mdPath = path.join(skillDir, mdName);

      let confidence = 50;
      let maturity = 'Declared';
      let executions = 0;

      if (existsSync(mdPath)) {
        try {
          const content = await readFile(mdPath, 'utf-8');
          // Extract track_record from YAML frontmatter if present
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const fmContent = fmMatch[1];
            // Simple extraction of track_record fields
            const confMatch = fmContent.match(/confidence:\s*(\d+)/);
            if (confMatch) confidence = parseInt(confMatch[1], 10);

            const matMatch = fmContent.match(/maturity:\s*(\w+)/);
            if (matMatch) maturity = matMatch[1];

            const execMatch = fmContent.match(/executions:\s*(\d+)/);
            if (execMatch) executions = parseInt(execMatch[1], 10);
          }
        } catch {
          // Use defaults
        }
      }

      items.push({
        name: entry.name,
        category,
        confidence,
        maturity,
        executions,
      });
    }
  } catch {
    // Directory read failed
  }

  return items;
}

async function loadSkillHealth(): Promise<DashboardSkillHealth[]> {
  const skills = await loadSkillHealthFromDir(SKILLS_DIR, 'skill');
  const playbooks = await loadSkillHealthFromDir(PLAYBOOKS_DIR, 'playbook');
  return [...skills, ...playbooks];
}

// --- Stats from work-ledger.jsonl (7-day window) ---

async function computeStats(activityFeed: DashboardActivityEntry[]): Promise<DashboardStats> {
  const stats: DashboardStats = {
    goals_completed_7d: 0,
    goals_blocked: 0,
    avg_completion_minutes: 0,
    retry_rate: 0,
    total_worker_turns_7d: 0,
  };

  // Read full ledger for 7-day stats
  const ledgerPath = path.join(LEDGERS_DIR, 'work-ledger.jsonl');
  if (!existsSync(ledgerPath)) return stats;

  try {
    const content = await readFile(ledgerPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString();

    let completedCount = 0;
    let totalCompletionMinutes = 0;
    let totalAttempts = 0;
    let failedAttempts = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = entry.ts || entry.timestamp || '';

        if (ts < cutoff) continue;

        const event = (entry.event || '').toUpperCase();

        if (event === 'GOAL_COMPLETED') {
          completedCount++;
          if (entry.duration_minutes) {
            totalCompletionMinutes += entry.duration_minutes;
          }
        }
        if (event === 'GOAL_BLOCKED') {
          stats.goals_blocked++;
        }
        if (event === 'GOAL_STARTED' || event === 'STEP_STARTED') {
          totalAttempts++;
        }
        if (event === 'GOAL_FAILED' || event === 'STEP_FAILED') {
          failedAttempts++;
        }
        if (entry.turn_count) {
          stats.total_worker_turns_7d += entry.turn_count;
        }
      } catch {
        // Skip malformed lines
      }
    }

    stats.goals_completed_7d = completedCount;
    stats.avg_completion_minutes = completedCount > 0
      ? Math.round(totalCompletionMinutes / completedCount)
      : 0;
    stats.retry_rate = totalAttempts > 0
      ? Math.round((failedAttempts / totalAttempts) * 100) / 100
      : 0;
  } catch {
    // Ledger read failed
  }

  return stats;
}

// --- Main writer function ---

/**
 * Aggregate agent state and write workspace/dashboard-data.json.
 * Uses atomic write (temp file + rename) to prevent partial reads.
 */
export async function writeDashboardData(): Promise<void> {
  try {
    const [goalPipeline, needsYou, activityFeed, skillHealth] = await Promise.all([
      scanGoalPipeline(),
      parseNeedsYouItems(),
      readActivityFeed(),
      loadSkillHealth(),
    ]);

    const stats = await computeStats(activityFeed);

    const data: DashboardData = {
      generated_at: new Date().toISOString(),
      agent_status: {
        loop_running: _loopRunning,
        current_phase: _currentPhase,
        active_worker: _activeWorker,
      },
      goal_pipeline: goalPipeline,
      needs_you: needsYou,
      activity_feed: activityFeed,
      skill_health: skillHealth,
      stats,
    };

    const outputPath = path.join(WORKSPACE_DIR, 'dashboard-data.json');
    const tempPath = outputPath + '.tmp';

    // Ensure workspace dir exists
    if (!existsSync(WORKSPACE_DIR)) {
      await mkdir(WORKSPACE_DIR, { recursive: true });
    }

    // Atomic write: write to temp, then rename
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fsRename(tempPath, outputPath);

    logDeterministic('Dashboard data written to workspace/dashboard-data.json');
  } catch (error) {
    logDeterministic(`Dashboard data write failed (non-blocking): ${error}`);
  }
}
