/**
 * Skill Consultation Verifier (v2.4.1)
 *
 * Gates whether Kimi / Codex workers actually consulted the skills that
 * were declared required for their step. The prompt-builder persists the
 * required list to `ledgers/{YYYY-MM-DD}/worker-{contractId}.manifest.json`
 * and writes the worker log to `ledgers/{YYYY-MM-DD}/worker-{contractId}.log`.
 * This verifier reads both and checks the log for a vendor-appropriate
 * Read-tool call against each required SKILL.md path.
 *
 * Claude path is a no-op: the SDK lazy-loads skills via its `Skill` tool,
 * so there is no observable ReadFile to gate on.
 */

import { readFile } from 'fs/promises';
import { readContractSkillManifest, emitWorkLedgerEvent } from '../state-handler.js';
import type { VerifierResult } from './core-verifiers.js';

/**
 * Tool-name tokens to scan for per vendor. These mirror the authoritative
 * tool-name mappings in `src/agentic/intelligence/vendor-adapter.ts:12-25`.
 * A worker log line that includes one of these tokens AND the SKILL.md path
 * is evidence the worker consulted the skill.
 */
const VENDOR_READ_TOKENS: Record<string, string[]> = {
  claude: ['Read', 'Skill'],           // SDK lazy-load — verifier short-circuits before using these
  kimi: ['ReadFile', 'read_file'],     // Kimi CLI / Wire tool names
  'kimi-cli': ['ReadFile', 'read_file'],
  'kimi-wire': ['ReadFile', 'read_file'],
  codex: ['read_file', 'ReadFile'],    // Codex SDK tool name
};

export interface SkillConsultationConfig {
  contract_id: string;
}

/**
 * Verify every required skill was ReadFile'd in the worker log.
 * Returns PASS with a short explanation when:
 *   - no manifest exists (prompt-builder didn't declare any required skills)
 *   - vendor is Claude (SDK auto-discovery; no observable log event)
 *   - every required skill path appears in the log alongside a Read-tool token
 *
 * Returns FAIL with the missing-skills list otherwise. Non-blocking by
 * default — validation-handler treats advisory failures as informational.
 */
export async function verifySkillConsultation(
  config: SkillConsultationConfig,
): Promise<VerifierResult> {
  const start = Date.now();
  const { contract_id } = config;

  if (!contract_id) {
    return {
      verifier_id: 'skill_consultation',
      result: 'PASS',
      message: 'No contract_id supplied — verifier skipped',
      evidence: { skipped: true, reason: 'no_contract_id' },
      duration_ms: Date.now() - start,
    };
  }

  const manifest = await readContractSkillManifest(contract_id);
  if (!manifest) {
    return {
      verifier_id: 'skill_consultation',
      result: 'PASS',
      message: 'No skill manifest for this contract — nothing to gate on',
      evidence: { contract_id, manifest_found: false },
      duration_ms: Date.now() - start,
    };
  }

  const { required_skills, vendor, log_path } = manifest;

  if (required_skills.length === 0) {
    return {
      verifier_id: 'skill_consultation',
      result: 'PASS',
      message: 'Manifest declares no required skills',
      evidence: { contract_id, vendor, required_skills: [] },
      duration_ms: Date.now() - start,
    };
  }

  // Claude lazy-loads via SDK Skill tool — no observable ReadFile in the log.
  if (vendor === 'claude') {
    return {
      verifier_id: 'skill_consultation',
      result: 'PASS',
      message: 'Claude vendor uses SDK Skill auto-discovery — manifest gate bypassed',
      evidence: { contract_id, vendor, required_skills },
      duration_ms: Date.now() - start,
    };
  }

  if (!log_path) {
    return {
      verifier_id: 'skill_consultation',
      result: 'FAIL',
      message: `Worker log missing for contract ${contract_id} — cannot verify skill consultation`,
      evidence: { contract_id, vendor, required_skills, log_path: null },
      duration_ms: Date.now() - start,
    };
  }

  let logText: string;
  try {
    logText = await readFile(log_path, 'utf-8');
  } catch (err) {
    return {
      verifier_id: 'skill_consultation',
      result: 'FAIL',
      message: `Failed to read worker log at ${log_path}: ${err instanceof Error ? err.message : String(err)}`,
      evidence: { contract_id, vendor, log_path, error: true },
      duration_ms: Date.now() - start,
    };
  }

  const readTokens = VENDOR_READ_TOKENS[vendor] ?? VENDOR_READ_TOKENS.kimi;
  const hasReadToken = readTokens.some((tok) => logText.includes(tok));

  const missing: string[] = [];
  const consulted: string[] = [];
  for (const skillName of required_skills) {
    const skillPath = `.claude/skills/${skillName}/SKILL.md`;
    const pathAppeared = logText.includes(skillPath);
    // Evidence requires both a Read-style tool call AND a mention of the path.
    // In practice Kimi / Codex log both on the same tool_call line; a path
    // mention without any Read token means the skill was name-dropped in prose
    // (e.g. the INDEX manifest itself) but never opened.
    if (hasReadToken && pathAppeared) {
      consulted.push(skillName);
      emitWorkLedgerEvent('WORKER_SKILL_CONSULTED', {
        contract_id,
        skill_name: skillName,
        vendor,
      });
    } else {
      missing.push(skillName);
    }
  }

  if (missing.length === 0) {
    return {
      verifier_id: 'skill_consultation',
      result: 'PASS',
      message: `All ${consulted.length} required skill(s) consulted`,
      evidence: { contract_id, vendor, consulted, required_skills },
      duration_ms: Date.now() - start,
    };
  }

  return {
    verifier_id: 'skill_consultation',
    result: 'FAIL',
    message: `Required skill(s) not consulted: ${missing.join(', ')}`,
    evidence: {
      contract_id,
      vendor,
      consulted,
      missing,
      required_skills,
      log_path,
    },
    duration_ms: Date.now() - start,
  };
}
