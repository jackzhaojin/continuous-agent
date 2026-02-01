/**
 * Weekly Retrospective - Analyzes recent work outcomes and updates capability confidence
 *
 * This module performs a batch analysis of work-ledger.jsonl and capability-ledger.jsonl
 * to detect patterns, update skill confidence, and generate improvement recommendations.
 *
 * Triggers:
 * - Weekly on Sundays (via self-improvement-triggers.ts)
 * - After 10+ new outcomes since last retrospective
 *
 * AGENTIC: Pattern analysis, confidence calibration, recommendation generation
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import {
  loadSelfImprovementState,
  markRetrospectiveCompleted,
} from '../../deterministic/self-improvement-state.js';

// === Types ===

interface WorkLedgerEntry {
  event: string;
  ts: string;
  task_id?: string;
  task_title?: string;
  title?: string;
  contract_id?: string;
  step_number?: number;
  step_title?: string;
  output_path?: string;
}

interface CapabilityLedgerEntry {
  ts: string;
  event: string;
  capability_id?: string;
  result?: 'PASS' | 'FAIL';
  confidence_before?: number;
  confidence_after?: number;
  maturity_before?: string;
  maturity_after?: string;
  evidence?: string[];
  verifier_id?: string;
  duration_ms?: number;
  task_id?: string;
  task_title?: string;
  contract_id?: string;
  capabilities?: string[];
}

interface CapabilityStats {
  id: string;
  passes: number;
  failures: number;
  successRate: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  currentConfidence: number;
  recommendedConfidence: number;
  recentEntries: CapabilityLedgerEntry[];
}

interface TaskOutcome {
  taskId: string;
  title: string;
  started: string;
  completed: string | null;
  success: boolean;
  stepsCompleted: number;
  stepsTotal: number;
  retryCount: number;
}

interface RetrospectiveReport {
  generated_at: string;
  period: {
    from: string;
    to: string;
  };
  summary: {
    total_tasks_started: number;
    total_tasks_completed: number;
    total_steps_started: number;
    total_steps_completed: number;
    overall_task_completion_rate: number;
    overall_step_completion_rate: number;
  };
  capability_analysis: CapabilityStats[];
  recommendations: string[];
  confidence_adjustments: Array<{
    capability_id: string;
    old_confidence: number;
    new_confidence: number;
    reason: string;
  }>;
  task_outcomes: TaskOutcome[];
}

// === Configuration ===

const LEDGERS_DIR = path.join(process.cwd(), 'ledgers');
const CAPABILITIES_DIR = path.join(process.cwd(), 'capabilities');
const RETROSPECTIVES_DIR = path.join(process.cwd(), 'learning', 'retrospectives');
const EVOLUTION_LOG = path.join(process.cwd(), 'learning', 'evolution-log.jsonl');

const CAPABILITY_FILES = [
  'technical-capabilities.yml',
  'delivery-capabilities.yml',
  'functional-capabilities.yml',
];

// === Ledger Reading ===

/**
 * Read JSONL file and parse entries, filtering by time window
 */
function readJsonlEntries<T>(filePath: string, since?: string): T[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const entries: T[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as T & { ts?: string };
      if (since && entry.ts && entry.ts < since) {
        continue;
      }
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Determine the time window for analysis.
 * Uses last retrospective timestamp, or falls back to 7 days ago.
 */
async function getAnalysisWindow(): Promise<{ from: string; to: string }> {
  const state = await loadSelfImprovementState();
  const now = new Date();
  const to = now.toISOString();

  let from: string;
  if (state.last_retrospective_at) {
    from = state.last_retrospective_at;
  } else {
    // Default to 7 days ago
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    from = sevenDaysAgo.toISOString();
  }

  return { from, to };
}

// === Analysis Functions ===

/**
 * Analyze work ledger entries to extract task outcomes
 */
function analyzeTaskOutcomes(entries: WorkLedgerEntry[]): TaskOutcome[] {
  const tasks = new Map<string, TaskOutcome>();

  for (const entry of entries) {
    const taskId = entry.task_id || '';
    const title = entry.task_title || entry.title || '';

    if (!taskId) continue;

    if (!tasks.has(taskId)) {
      tasks.set(taskId, {
        taskId,
        title,
        started: entry.ts,
        completed: null,
        success: false,
        stepsCompleted: 0,
        stepsTotal: 0,
        retryCount: 0,
      });
    }

    const task = tasks.get(taskId)!;

    switch (entry.event) {
      case 'TASK_STARTED':
        task.retryCount++;
        if (!task.title && title) {
          task.title = title;
        }
        break;
      case 'TASK_COMPLETED':
        task.completed = entry.ts;
        task.success = true;
        break;
      case 'STEP_STARTED':
        // Count unique step numbers to track total steps
        task.stepsTotal = Math.max(task.stepsTotal, (entry.step_number || 0) + 1);
        break;
      case 'STEP_COMPLETED':
        task.stepsCompleted++;
        break;
      case 'TASK_BLOCKED':
        task.success = false;
        break;
    }
  }

  return Array.from(tasks.values());
}

/**
 * Analyze capability ledger entries to compute per-capability statistics
 */
function analyzeCapabilities(entries: CapabilityLedgerEntry[]): CapabilityStats[] {
  const capMap = new Map<string, {
    passes: number;
    failures: number;
    entries: CapabilityLedgerEntry[];
    latestConfidence: number;
  }>();

  for (const entry of entries) {
    if (entry.event !== 'CAPABILITY_RESULT' || !entry.capability_id) {
      continue;
    }

    const id = entry.capability_id;
    if (!capMap.has(id)) {
      capMap.set(id, { passes: 0, failures: 0, entries: [], latestConfidence: 0 });
    }

    const stat = capMap.get(id)!;
    stat.entries.push(entry);

    if (entry.result === 'PASS') {
      stat.passes++;
    } else if (entry.result === 'FAIL') {
      stat.failures++;
    }

    if (entry.confidence_after !== undefined) {
      stat.latestConfidence = entry.confidence_after;
    }
  }

  const results: CapabilityStats[] = [];

  for (const [id, stat] of capMap) {
    const total = stat.passes + stat.failures;
    const successRate = total > 0 ? stat.passes / total : 0;

    // Determine trend by looking at the last 5 entries
    const trend = computeTrend(stat.entries);

    // Compute recommended confidence based on actual success rate
    const recommendedConfidence = computeRecommendedConfidence(successRate, total);

    results.push({
      id,
      passes: stat.passes,
      failures: stat.failures,
      successRate: Math.round(successRate * 100) / 100,
      trend,
      currentConfidence: stat.latestConfidence,
      recommendedConfidence,
      recentEntries: stat.entries.slice(-5),
    });
  }

  // Sort by number of observations (most active first)
  results.sort((a, b) => (b.passes + b.failures) - (a.passes + a.failures));

  return results;
}

/**
 * Compute trend direction from recent capability results
 */
function computeTrend(entries: CapabilityLedgerEntry[]): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  const resultEntries = entries.filter(e => e.event === 'CAPABILITY_RESULT' && e.result);

  if (resultEntries.length < 3) {
    return 'insufficient_data';
  }

  // Split into halves and compare success rates
  const midpoint = Math.floor(resultEntries.length / 2);
  const firstHalf = resultEntries.slice(0, midpoint);
  const secondHalf = resultEntries.slice(midpoint);

  const firstRate = firstHalf.filter(e => e.result === 'PASS').length / firstHalf.length;
  const secondRate = secondHalf.filter(e => e.result === 'PASS').length / secondHalf.length;

  const diff = secondRate - firstRate;

  if (diff > 0.15) return 'improving';
  if (diff < -0.15) return 'declining';
  return 'stable';
}

/**
 * Compute a recommended confidence value based on observed success rate
 * Uses a conservative formula that weights the number of observations
 */
function computeRecommendedConfidence(successRate: number, totalObservations: number): number {
  // With few observations, pull toward 50 (uncertain)
  // With many observations, trust the success rate more
  const observationWeight = Math.min(totalObservations / 20, 1); // Saturates at 20 observations
  const baseConfidence = successRate * 100;
  const priorConfidence = 50; // Neutral prior

  const recommended = Math.round(
    observationWeight * baseConfidence + (1 - observationWeight) * priorConfidence
  );

  return Math.max(0, Math.min(100, recommended));
}

// === Confidence Adjustment ===

interface CapabilityEntry {
  id: string;
  confidence: number;
  maturity: string;
  evidence: {
    successes: number;
    failures: number;
    last_validated: string | null;
  };
  [key: string]: unknown;
}

interface CapabilityFile {
  capabilities: CapabilityEntry[];
  [key: string]: unknown;
}

/**
 * Apply batch confidence adjustments based on retrospective analysis.
 *
 * Unlike the per-verifier updates in capability-updater.ts (+10/-15),
 * this performs a holistic adjustment considering the full observation window.
 * It nudges confidence toward the recommended value rather than replacing it.
 */
function applyConfidenceAdjustments(
  capabilityStats: CapabilityStats[]
): Array<{ capability_id: string; old_confidence: number; new_confidence: number; reason: string }> {
  const adjustments: Array<{
    capability_id: string;
    old_confidence: number;
    new_confidence: number;
    reason: string;
  }> = [];

  for (const stat of capabilityStats) {
    const total = stat.passes + stat.failures;
    if (total < 3) {
      // Not enough data to make a meaningful adjustment
      continue;
    }

    // Find the capability in YAML files
    for (const filename of CAPABILITY_FILES) {
      const filepath = path.join(CAPABILITIES_DIR, filename);
      if (!existsSync(filepath)) continue;

      try {
        const content = readFileSync(filepath, 'utf-8');
        const file = yaml.load(content) as CapabilityFile;
        if (!file?.capabilities) continue;

        const cap = file.capabilities.find(c => c.id === stat.id);
        if (!cap) continue;

        const oldConfidence = cap.confidence;

        // Nudge confidence toward recommended value by 25% of the gap
        // This provides a gradual correction without wild swings
        const gap = stat.recommendedConfidence - oldConfidence;

        // Only adjust if the gap is significant (>10 points)
        if (Math.abs(gap) <= 10) continue;

        const nudge = Math.round(gap * 0.25);
        const newConfidence = Math.max(0, Math.min(100, oldConfidence + nudge));

        if (newConfidence === oldConfidence) continue;

        // Apply the adjustment
        cap.confidence = newConfidence;
        cap.evidence.last_validated = new Date().toISOString().split('T')[0];

        // Update maturity based on new evidence
        const totalEvidence = cap.evidence.successes + cap.evidence.failures;
        const evidenceSuccessRate = totalEvidence > 0 ? cap.evidence.successes / totalEvidence : 0;

        if (cap.maturity === 'Declared' && cap.evidence.successes >= 1) {
          cap.maturity = 'Demonstrated';
        }
        if (cap.maturity === 'Demonstrated' && cap.evidence.successes >= 3 && evidenceSuccessRate >= 0.8) {
          cap.maturity = 'Reliable';
        }
        if (cap.maturity === 'Reliable' && evidenceSuccessRate < 0.7) {
          cap.maturity = 'Demonstrated';
        }

        // Write the updated file
        const updatedContent = yaml.dump(file, { lineWidth: -1 });
        writeFileSync(filepath, updatedContent, 'utf-8');

        const reason = `Retrospective batch adjustment: ${stat.successRate * 100}% success rate over ${total} observations (trend: ${stat.trend})`;

        adjustments.push({
          capability_id: stat.id,
          old_confidence: oldConfidence,
          new_confidence: newConfidence,
          reason,
        });

        // Log to evolution log
        const evolutionEntry = JSON.stringify({
          id: `evo-retro-${Date.now()}-${stat.id}`,
          ts: new Date().toISOString(),
          trigger: 'weekly_retrospective',
          file: filename,
          capability: stat.id,
          change: `confidence ${oldConfidence}->${newConfidence}`,
          evidence: [`retrospective: ${stat.passes}P/${stat.failures}F, rate=${stat.successRate}`],
          rationale: reason,
        });
        appendFileSync(EVOLUTION_LOG, evolutionEntry + '\n', 'utf-8');

        break; // Found the capability, no need to check other files
      } catch {
        // Skip files that fail to parse
      }
    }
  }

  return adjustments;
}

// === Recommendation Generation ===

/**
 * Generate actionable recommendations based on the analysis
 */
function generateRecommendations(
  capStats: CapabilityStats[],
  taskOutcomes: TaskOutcome[],
): string[] {
  const recommendations: string[] = [];

  // 1. Identify declining capabilities
  const declining = capStats.filter(c => c.trend === 'declining');
  for (const cap of declining) {
    recommendations.push(
      `DECLINING: ${cap.id} is trending downward (${cap.passes}P/${cap.failures}F, ${Math.round(cap.successRate * 100)}% success). Consider adding practice tasks or investigating root causes.`
    );
  }

  // 2. Identify capabilities with very low success rates but many attempts
  const struggling = capStats.filter(c => {
    const total = c.passes + c.failures;
    return total >= 5 && c.successRate < 0.4;
  });
  for (const cap of struggling) {
    recommendations.push(
      `LOW SUCCESS: ${cap.id} has only ${Math.round(cap.successRate * 100)}% success rate over ${cap.passes + cap.failures} attempts. This may need a fundamentally different approach or should be deprioritized.`
    );
  }

  // 3. Identify capabilities that are improving
  const improving = capStats.filter(c => c.trend === 'improving');
  for (const cap of improving) {
    recommendations.push(
      `IMPROVING: ${cap.id} is trending upward (${Math.round(cap.successRate * 100)}% success). Continue current approach.`
    );
  }

  // 4. Check for tasks with high retry counts
  const highRetry = taskOutcomes.filter(t => t.retryCount > 3);
  for (const task of highRetry) {
    recommendations.push(
      `HIGH RETRY: "${task.title}" required ${task.retryCount} attempts. Consider task decomposition or prerequisite verification.`
    );
  }

  // 5. Overall completion rate check
  const completedTasks = taskOutcomes.filter(t => t.success);
  const totalTasks = taskOutcomes.length;
  if (totalTasks > 0) {
    const rate = completedTasks.length / totalTasks;
    if (rate < 0.5) {
      recommendations.push(
        `LOW COMPLETION: Only ${Math.round(rate * 100)}% of tasks completed successfully. Consider simplifying task scope or improving prerequisite checks.`
      );
    } else if (rate > 0.8) {
      recommendations.push(
        `STRONG COMPLETION: ${Math.round(rate * 100)}% task completion rate. Agent is performing well.`
      );
    }
  }

  // 6. Check for capabilities with no recent activity
  if (capStats.length === 0) {
    recommendations.push(
      'NO DATA: No capability results found in the analysis window. The agent may not be running verifiers or the analysis window may be too narrow.'
    );
  }

  return recommendations;
}

// === Report Generation ===

/**
 * Generate and write the retrospective report
 */
async function writeRetrospectiveReport(report: RetrospectiveReport): Promise<string> {
  if (!existsSync(RETROSPECTIVES_DIR)) {
    mkdirSync(RETROSPECTIVES_DIR, { recursive: true });
  }

  const dateSlug = new Date().toISOString().split('T')[0];
  const filename = `retrospective-${dateSlug}.md`;
  const filepath = path.join(RETROSPECTIVES_DIR, filename);

  const lines: string[] = [
    `# Weekly Retrospective - ${dateSlug}`,
    '',
    `**Generated:** ${report.generated_at}`,
    `**Analysis Period:** ${report.period.from.split('T')[0]} to ${report.period.to.split('T')[0]}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Tasks Started | ${report.summary.total_tasks_started} |`,
    `| Tasks Completed | ${report.summary.total_tasks_completed} |`,
    `| Task Completion Rate | ${Math.round(report.summary.overall_task_completion_rate * 100)}% |`,
    `| Steps Started | ${report.summary.total_steps_started} |`,
    `| Steps Completed | ${report.summary.total_steps_completed} |`,
    `| Step Completion Rate | ${Math.round(report.summary.overall_step_completion_rate * 100)}% |`,
    '',
  ];

  // Capability Analysis section
  if (report.capability_analysis.length > 0) {
    lines.push('## Capability Analysis');
    lines.push('');
    lines.push('| Capability | Pass | Fail | Success Rate | Trend | Confidence |');
    lines.push('|-----------|------|------|-------------|-------|------------|');

    for (const cap of report.capability_analysis) {
      lines.push(
        `| ${cap.id} | ${cap.passes} | ${cap.failures} | ${Math.round(cap.successRate * 100)}% | ${cap.trend} | ${cap.currentConfidence} |`
      );
    }
    lines.push('');
  }

  // Confidence Adjustments section
  if (report.confidence_adjustments.length > 0) {
    lines.push('## Confidence Adjustments');
    lines.push('');
    lines.push('| Capability | Old | New | Reason |');
    lines.push('|-----------|-----|-----|--------|');

    for (const adj of report.confidence_adjustments) {
      lines.push(`| ${adj.capability_id} | ${adj.old_confidence} | ${adj.new_confidence} | ${adj.reason} |`);
    }
    lines.push('');
  }

  // Recommendations section
  if (report.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  // Task Outcomes section
  if (report.task_outcomes.length > 0) {
    lines.push('## Task Outcomes');
    lines.push('');
    lines.push('| Task | Status | Steps | Retries |');
    lines.push('|------|--------|-------|---------|');

    for (const task of report.task_outcomes) {
      const status = task.success ? 'Completed' : (task.completed ? 'Failed' : 'In Progress');
      const steps = task.stepsTotal > 0 ? `${task.stepsCompleted}/${task.stepsTotal}` : 'N/A';
      lines.push(`| ${task.title} | ${status} | ${steps} | ${task.retryCount} |`);
    }
    lines.push('');
  }

  const reportContent = lines.join('\n');
  await writeFile(filepath, reportContent, 'utf-8');

  return filepath;
}

/**
 * Also write a JSONL entry to the retrospective ledger for machine consumption
 */
function writeRetrospectiveLedgerEntry(report: RetrospectiveReport): void {
  const ledgerPath = path.join(LEDGERS_DIR, 'retrospective-ledger.jsonl');

  const entry = JSON.stringify({
    ts: report.generated_at,
    event: 'RETROSPECTIVE_COMPLETED',
    period_from: report.period.from,
    period_to: report.period.to,
    tasks_started: report.summary.total_tasks_started,
    tasks_completed: report.summary.total_tasks_completed,
    task_completion_rate: report.summary.overall_task_completion_rate,
    steps_started: report.summary.total_steps_started,
    steps_completed: report.summary.total_steps_completed,
    step_completion_rate: report.summary.overall_step_completion_rate,
    capabilities_analyzed: report.capability_analysis.length,
    adjustments_made: report.confidence_adjustments.length,
    recommendations_count: report.recommendations.length,
  });

  appendFileSync(ledgerPath, entry + '\n', 'utf-8');
}

// === Main Entry Point ===

/**
 * Run the weekly retrospective.
 *
 * This is the main entry point called by the executive loop when a
 * retrospective is triggered. It:
 * 1. Reads ledger data for the analysis window
 * 2. Analyzes task outcomes and capability performance
 * 3. Applies batch confidence adjustments
 * 4. Generates recommendations
 * 5. Writes a human-readable report and machine-readable ledger entry
 * 6. Updates self-improvement state
 *
 * Returns the file path of the generated report, or null on error.
 */
export async function runWeeklyRetrospective(): Promise<string | null> {
  try {
    console.log(`[${new Date().toISOString()}] Starting weekly retrospective...`);

    // 1. Determine analysis window
    const window = await getAnalysisWindow();
    console.log(`[${new Date().toISOString()}] Analysis window: ${window.from} to ${window.to}`);

    // 2. Read ledger entries
    const workEntries = readJsonlEntries<WorkLedgerEntry>(
      path.join(LEDGERS_DIR, 'work-ledger.jsonl'),
      window.from
    );
    const capEntries = readJsonlEntries<CapabilityLedgerEntry>(
      path.join(LEDGERS_DIR, 'capability-ledger.jsonl'),
      window.from
    );

    console.log(`[${new Date().toISOString()}] Found ${workEntries.length} work entries, ${capEntries.length} capability entries`);

    // 3. Analyze task outcomes
    const taskOutcomes = analyzeTaskOutcomes(workEntries);

    // 4. Analyze capability performance
    const capStats = analyzeCapabilities(capEntries);

    // 5. Apply batch confidence adjustments
    const adjustments = applyConfidenceAdjustments(capStats);
    console.log(`[${new Date().toISOString()}] Applied ${adjustments.length} confidence adjustments`);

    // 6. Generate recommendations
    const recommendations = generateRecommendations(capStats, taskOutcomes);

    // 7. Compute summary statistics
    const tasksStarted = taskOutcomes.length;
    const tasksCompleted = taskOutcomes.filter(t => t.success).length;
    const stepsStarted = workEntries.filter(e => e.event === 'STEP_STARTED').length;
    const stepsCompleted = workEntries.filter(e => e.event === 'STEP_COMPLETED').length;

    // 8. Build the report
    const report: RetrospectiveReport = {
      generated_at: new Date().toISOString(),
      period: window,
      summary: {
        total_tasks_started: tasksStarted,
        total_tasks_completed: tasksCompleted,
        total_steps_started: stepsStarted,
        total_steps_completed: stepsCompleted,
        overall_task_completion_rate: tasksStarted > 0 ? tasksCompleted / tasksStarted : 0,
        overall_step_completion_rate: stepsStarted > 0 ? stepsCompleted / stepsStarted : 0,
      },
      capability_analysis: capStats,
      recommendations,
      confidence_adjustments: adjustments,
      task_outcomes: taskOutcomes,
    };

    // 9. Write reports
    const reportPath = await writeRetrospectiveReport(report);
    writeRetrospectiveLedgerEntry(report);

    console.log(`[${new Date().toISOString()}] Retrospective report written to ${reportPath}`);

    // 10. Update self-improvement state
    await markRetrospectiveCompleted();
    console.log(`[${new Date().toISOString()}] Weekly retrospective complete`);

    return reportPath;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error running weekly retrospective:`, error);
    return null;
  }
}
