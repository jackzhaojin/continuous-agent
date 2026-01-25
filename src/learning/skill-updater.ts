/**
 * Skill Updater - Updates skill confidence from verifier results
 *
 * Per PRD Unified Addendum Part 4.4:
 * - On PASS: confidence += 10 (capped at scope ceiling)
 * - On FAIL: confidence -= 15
 * - Track maturity: Declared → Demonstrated → Reliable
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { VerifierResult } from '../verifiers/core-verifiers.js';

interface Skill {
  id: string;
  confidence: number;
  maturity: 'Declared' | 'Demonstrated' | 'Reliable';
  evidence: {
    successes: number;
    failures: number;
    last_validated: string | null;
  };
  verifiers?: string[];
}

interface SkillFile {
  skills: Skill[];
}

const SKILLS_DIR = path.join(process.cwd(), 'skills');
const LEDGER_PATH = path.join(process.cwd(), 'ledgers', 'capability-ledger.jsonl');
const EVOLUTION_LOG = path.join(process.cwd(), 'learning', 'evolution-log.jsonl');

/**
 * Load a skill file
 */
function loadSkillFile(filename: string): SkillFile | null {
  try {
    const filepath = path.join(SKILLS_DIR, filename);
    const content = readFileSync(filepath, 'utf-8');
    return yaml.load(content) as SkillFile;
  } catch {
    return null;
  }
}

/**
 * Save a skill file
 */
function saveSkillFile(filename: string, data: SkillFile): void {
  const filepath = path.join(SKILLS_DIR, filename);
  const content = yaml.dump(data, { lineWidth: -1 });
  writeFileSync(filepath, content, 'utf-8');
}

/**
 * Find which skill file contains a skill
 */
function findSkillFile(skillId: string): { filename: string; file: SkillFile; skill: Skill } | null {
  const files = ['technical-skills.yml', 'delivery-skills.yml', 'functional-skills.yml'];

  for (const filename of files) {
    const file = loadSkillFile(filename);
    if (file?.skills) {
      const skill = file.skills.find(s => s.id === skillId);
      if (skill) {
        return { filename, file, skill };
      }
    }
  }

  return null;
}

/**
 * Log to capability ledger
 */
function logToLedger(event: Record<string, unknown>): void {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
  });
  appendFileSync(LEDGER_PATH, entry + '\n', 'utf-8');
}

/**
 * Log to evolution log
 */
function logEvolution(change: {
  skill: string;
  file: string;
  oldConfidence: number;
  newConfidence: number;
  oldMaturity: string;
  newMaturity: string;
  trigger: string;
  evidence: string[];
}): void {
  const entry = JSON.stringify({
    id: `evo-${Date.now()}`,
    ts: new Date().toISOString(),
    trigger: change.trigger,
    file: change.file,
    skill: change.skill,
    change: `confidence ${change.oldConfidence}→${change.newConfidence}, maturity ${change.oldMaturity}→${change.newMaturity}`,
    evidence: change.evidence,
    rationale: `Skill confidence updated from verifier results`,
  });
  appendFileSync(EVOLUTION_LOG, entry + '\n', 'utf-8');
}

/**
 * Update skill confidence based on verifier result
 */
export function updateSkillConfidence(
  skillId: string,
  result: 'PASS' | 'FAIL',
  evidencePointers: string[]
): { updated: boolean; newConfidence: number; newMaturity: string } | null {
  const found = findSkillFile(skillId);
  if (!found) {
    console.log(`Skill ${skillId} not found in registry`);
    return null;
  }

  const { filename, file, skill } = found;
  const oldConfidence = skill.confidence;
  const oldMaturity = skill.maturity;

  // Update confidence
  if (result === 'PASS') {
    skill.confidence = Math.min(100, skill.confidence + 10);
    skill.evidence.successes++;
  } else {
    skill.confidence = Math.max(0, skill.confidence - 15);
    skill.evidence.failures++;
  }
  skill.evidence.last_validated = new Date().toISOString().split('T')[0];

  // Update maturity
  const totalAttempts = skill.evidence.successes + skill.evidence.failures;
  const successRate = skill.evidence.successes / totalAttempts;

  if (skill.maturity === 'Declared' && skill.evidence.successes >= 1) {
    skill.maturity = 'Demonstrated';
  }
  if (skill.maturity === 'Demonstrated' && skill.evidence.successes >= 3 && successRate >= 0.8) {
    skill.maturity = 'Reliable';
  }
  if (skill.maturity === 'Reliable' && successRate < 0.7) {
    skill.maturity = 'Demonstrated';
  }

  // Save updated file
  saveSkillFile(filename, file);

  // Log to capability ledger
  logToLedger({
    event: 'SKILL_RESULT',
    skill_id: skillId,
    result,
    confidence_before: oldConfidence,
    confidence_after: skill.confidence,
    maturity_before: oldMaturity,
    maturity_after: skill.maturity,
    evidence: evidencePointers,
  });

  // Log to evolution log if changed
  if (oldConfidence !== skill.confidence || oldMaturity !== skill.maturity) {
    logEvolution({
      skill: skillId,
      file: filename,
      oldConfidence,
      newConfidence: skill.confidence,
      oldMaturity,
      newMaturity: skill.maturity,
      trigger: 'validation_result',
      evidence: evidencePointers,
    });
  }

  return {
    updated: true,
    newConfidence: skill.confidence,
    newMaturity: skill.maturity,
  };
}

/**
 * Update multiple skills from verifier results
 */
export function updateSkillsFromVerifierResults(
  results: VerifierResult[],
  skillMappings: Record<string, string[]>
): void {
  // Log verifier runs
  for (const result of results) {
    logToLedger({
      event: 'VERIFIER_RUN',
      verifier_id: result.verifier_id,
      result: result.result,
      duration_ms: result.duration_ms,
      evidence: result.evidence,
    });
  }

  // Map verifiers to skills and update
  for (const result of results) {
    const skillIds = skillMappings[result.verifier_id] || [];
    for (const skillId of skillIds) {
      updateSkillConfidence(
        skillId,
        result.result,
        [`verifier:${result.verifier_id}`]
      );
    }
  }
}

/**
 * Default verifier to skill mappings
 */
export const DEFAULT_SKILL_MAPPINGS: Record<string, string[]> = {
  git_status_clean: ['git.branch_commit'],
  commit_exists: ['git.branch_commit'],
  node_install: ['node.npm.install'],
  node_build: ['node.npm.run_script', 'nextjs.build.basic'],
  node_test: ['node.npm.run_script'],
  lint_pass: ['node.npm.run_script'],
  docs_checklist: ['comm.documentation'],
};
