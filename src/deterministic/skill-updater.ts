/**
 * Skill Updater — V2.0 Track Record + Capability Surface
 *
 * Updates track_record frontmatter in SKILL.md files for both skills and playbooks.
 * Replaces the per-file YAML capability system with inline track records.
 *
 * Confidence: +10 on PASS (cap 100), -15 on FAIL (floor 0)
 * Maturity: Declared -> Demonstrated (>=1 PASS) -> Reliable (>=3 PASS, <20% failure rate)
 * Review flag: review_needed set after 3+ consecutive failures
 */

import { writeFile, rename, mkdir } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logDeterministic } from '../core/logging.js';
import {
  findSkillMarkdownFiles,
  parseSkillMarkdown,
} from './library-frontmatter-parser.js';
import { loadSkillLibrary } from './skill-loader.js';
import { loadPlaybookLibrary } from './playbook-loader.js';
import type { TrackRecord } from './library-loader-types.js';

// ── Track Record Update ────────────────────────────────────────────────

export interface TrackRecordUpdate {
  filePath: string;
  before: TrackRecord;
  after: TrackRecord;
  reviewNeeded: boolean;
}

/**
 * Compute the updated maturity level based on execution counts and failure rate.
 */
function computeMaturity(successes: number, total: number): string {
  const failureRate = total > 0 ? (total - successes) / total : 0;

  // Reliable requires >=3 successes AND <20% failure rate
  if (successes >= 3 && failureRate < 0.2) {
    return 'Reliable';
  }

  // Demonstrated requires >=1 success
  if (successes >= 1) {
    return 'Demonstrated';
  }

  return 'Declared';
}

/**
 * Read a SKILL.md file, update its track_record frontmatter, and write back atomically.
 * Preserves the body content unchanged.
 *
 * Consecutive failures are tracked via a `_consecutive_failures` field in frontmatter
 * so the counter persists across process restarts.
 */
export async function updateTrackRecord(filePath: string, passed: boolean): Promise<TrackRecordUpdate> {
  const doc = await parseSkillMarkdown(filePath);
  const fm = doc.frontmatter;

  const existing = normalizeTrackRecord(fm.track_record);
  const before: TrackRecord = { ...existing };

  // Read consecutive failures from persisted field
  const prevConsecutiveFailures = typeof fm._consecutive_failures === 'number' ? fm._consecutive_failures : 0;
  const consecutiveFailures = passed ? 0 : prevConsecutiveFailures + 1;

  // Update counters
  existing.total_executions += 1;
  if (passed) {
    existing.successes += 1;
  } else {
    existing.failures += 1;
  }
  existing.last_executed = new Date().toISOString();

  // Update confidence: +10 PASS (cap 100), -15 FAIL (floor 0)
  if (passed) {
    existing.confidence = Math.min(100, existing.confidence + 10);
  } else {
    existing.confidence = Math.max(0, existing.confidence - 15);
  }

  // Update maturity
  existing.maturity = computeMaturity(existing.successes, existing.total_executions);

  // Determine review_needed: 3+ consecutive failures
  const reviewNeeded = consecutiveFailures >= 3;

  // Write updated fields into frontmatter
  fm.track_record = {
    total_executions: existing.total_executions,
    successes: existing.successes,
    failures: existing.failures,
    last_executed: existing.last_executed,
    confidence: existing.confidence,
    maturity: existing.maturity,
  };
  fm._consecutive_failures = consecutiveFailures;

  if (reviewNeeded) {
    fm.review_needed = true;
  } else if ('review_needed' in fm) {
    delete fm.review_needed;
  }

  // Write back atomically
  await writeSkillMarkdownAtomic(filePath, fm, doc.body);

  logDeterministic(
    `[skill-updater] Updated track record for ${filePath}: ` +
    `confidence ${before.confidence}->${existing.confidence}, ` +
    `maturity ${before.maturity}->${existing.maturity}` +
    (reviewNeeded ? ' [REVIEW NEEDED]' : '')
  );

  return { filePath, before, after: existing, reviewNeeded };
}

// ── Normalize Helper ───────────────────────────────────────────────────

function normalizeTrackRecord(value: unknown): TrackRecord {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    total_executions: Number(record.total_executions ?? 0),
    successes: Number(record.successes ?? 0),
    failures: Number(record.failures ?? 0),
    last_executed: typeof record.last_executed === 'string' ? record.last_executed : null,
    confidence: Number(record.confidence ?? 0),
    maturity: typeof record.maturity === 'string' ? record.maturity : 'Declared',
  };
}

// ── Atomic Write ───────────────────────────────────────────────────────

async function writeSkillMarkdownAtomic(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): Promise<void> {
  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true });
  const content = `---\n${yamlStr}---\n${body}`;

  // Write to temp file in same directory, then rename (atomic on same filesystem)
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.SKILL.md.tmp.${process.pid}.${Date.now()}`);

  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
}

// ── Dual Library Update ────────────────────────────────────────────────

/**
 * After each execution, update both the skill(s) used AND the playbook used.
 * Finds SKILL.md files by name in the skills/ and playbooks/ directories.
 */
export async function updateSkillAndPlaybookRecords(
  skillNames: string[],
  playbookName: string | null,
  passed: boolean,
  options?: { skillsDir?: string; playbooksDir?: string }
): Promise<TrackRecordUpdate[]> {
  const skillsDir = options?.skillsDir ?? path.join(process.cwd(), 'skills');
  const playbooksDir = options?.playbooksDir ?? path.join(process.cwd(), 'playbooks');
  const updates: TrackRecordUpdate[] = [];

  // Build name -> filePath maps for skills and playbooks
  const skillFileMap = await buildNameToFileMap(skillsDir);
  const playbookFileMap = await buildNameToFileMap(playbooksDir);

  // Update skills
  for (const name of skillNames) {
    const filePath = skillFileMap.get(name);
    if (filePath) {
      try {
        const update = await updateTrackRecord(filePath, passed);
        updates.push(update);
      } catch (error) {
        logDeterministic(`[skill-updater] Failed to update skill "${name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logDeterministic(`[skill-updater] Skill "${name}" not found in ${skillsDir}`);
    }
  }

  // Update playbook
  if (playbookName) {
    const filePath = playbookFileMap.get(playbookName);
    if (filePath) {
      try {
        const update = await updateTrackRecord(filePath, passed);
        updates.push(update);
      } catch (error) {
        logDeterministic(`[skill-updater] Failed to update playbook "${playbookName}": ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logDeterministic(`[skill-updater] Playbook "${playbookName}" not found in ${playbooksDir}`);
    }
  }

  return updates;
}

/**
 * Build a map of name -> filePath by scanning SKILL.md files and reading the name field.
 */
async function buildNameToFileMap(rootDir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  let files: string[];
  try {
    files = await findSkillMarkdownFiles(rootDir);
  } catch {
    return map;
  }

  for (const filePath of files) {
    try {
      const doc = await parseSkillMarkdown(filePath);
      const name = doc.frontmatter.name;
      if (typeof name === 'string' && name) {
        map.set(name, filePath);
      }
    } catch {
      // Skip unparseable files
    }
  }

  return map;
}

// ── Flattened Summary Generator ────────────────────────────────────────

export interface CapabilitySummaryEntry {
  name: string;
  type: 'skill' | 'playbook';
  category: string;
  confidence: number;
  maturity: string;
  total_executions: number;
  last_executed: string | null;
}

/**
 * Scan both skills/ and playbooks/ directories, generate a flat capabilities/summary.yml.
 */
export async function generateCapabilitySummary(
  options?: { skillsDir?: string; playbooksDir?: string; outputPath?: string }
): Promise<CapabilitySummaryEntry[]> {
  const skillsDir = options?.skillsDir ?? path.join(process.cwd(), 'skills');
  const playbooksDir = options?.playbooksDir ?? path.join(process.cwd(), 'playbooks');
  const outputPath = options?.outputPath ?? path.join(process.cwd(), 'capabilities', 'summary.yml');

  const entries: CapabilitySummaryEntry[] = [];

  // Load skills
  try {
    const skillResult = await loadSkillLibrary(skillsDir);
    for (const skill of skillResult.skills) {
      entries.push({
        name: skill.name,
        type: 'skill',
        category: skill.category,
        confidence: skill.track_record.confidence,
        maturity: skill.track_record.maturity,
        total_executions: skill.track_record.total_executions,
        last_executed: skill.track_record.last_executed,
      });
    }
  } catch (error) {
    logDeterministic(`[skill-updater] Failed to load skills for summary: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Load playbooks
  try {
    const playbookResult = await loadPlaybookLibrary(playbooksDir);
    for (const playbook of playbookResult.playbooks) {
      entries.push({
        name: playbook.name,
        type: 'playbook',
        category: playbook.category,
        confidence: playbook.track_record.confidence,
        maturity: playbook.track_record.maturity,
        total_executions: playbook.track_record.total_executions,
        last_executed: playbook.track_record.last_executed,
      });
    }
  } catch (error) {
    logDeterministic(`[skill-updater] Failed to load playbooks for summary: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Write summary atomically
  const dir = path.dirname(outputPath);
  await mkdir(dir, { recursive: true });

  const summaryContent = yaml.dump({ capabilities: entries }, { lineWidth: -1, noRefs: true });
  const tmpPath = outputPath + `.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmpPath, summaryContent, 'utf-8');
  await rename(tmpPath, outputPath);

  logDeterministic(`[skill-updater] Generated capability summary with ${entries.length} entries at ${outputPath}`);

  return entries;
}
