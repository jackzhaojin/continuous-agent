/**
 * Capability Updater - Updates capability confidence from verifier results
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

interface Capability {
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

interface CapabilityFile {
  capabilities: Capability[];
}

const CAPABILITIES_DIR = path.join(process.cwd(), 'capabilities');
const LEDGER_PATH = path.join(process.cwd(), 'ledgers', 'capability-ledger.jsonl');
const EVOLUTION_LOG = path.join(process.cwd(), 'learning', 'evolution-log.jsonl');

/**
 * Load a capability file
 */
function loadCapabilityFile(filename: string): CapabilityFile | null {
  try {
    const filepath = path.join(CAPABILITIES_DIR, filename);
    const content = readFileSync(filepath, 'utf-8');
    return yaml.load(content) as CapabilityFile;
  } catch {
    return null;
  }
}

/**
 * Save a capability file
 */
function saveCapabilityFile(filename: string, data: CapabilityFile): void {
  const filepath = path.join(CAPABILITIES_DIR, filename);
  const content = yaml.dump(data, { lineWidth: -1 });
  writeFileSync(filepath, content, 'utf-8');
}

/**
 * Find which capability file contains a capability
 */
function findCapabilityFile(capabilityId: string): { filename: string; file: CapabilityFile; capability: Capability } | null {
  const files = ['technical-capabilities.yml', 'delivery-capabilities.yml', 'functional-capabilities.yml'];

  for (const filename of files) {
    const file = loadCapabilityFile(filename);
    if (file?.capabilities) {
      const capability = file.capabilities.find(c => c.id === capabilityId);
      if (capability) {
        return { filename, file, capability };
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
  capability: string;
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
    capability: change.capability,
    change: `confidence ${change.oldConfidence}→${change.newConfidence}, maturity ${change.oldMaturity}→${change.newMaturity}`,
    evidence: change.evidence,
    rationale: `Capability confidence updated from verifier results`,
  });
  appendFileSync(EVOLUTION_LOG, entry + '\n', 'utf-8');
}

/**
 * Update capability confidence based on verifier result
 */
export function updateCapabilityConfidence(
  capabilityId: string,
  result: 'PASS' | 'FAIL',
  evidencePointers: string[]
): { updated: boolean; newConfidence: number; newMaturity: string } | null {
  const found = findCapabilityFile(capabilityId);
  if (!found) {
    console.log(`Capability ${capabilityId} not found in registry`);
    return null;
  }

  const { filename, file, capability } = found;
  const oldConfidence = capability.confidence;
  const oldMaturity = capability.maturity;

  // Update confidence
  if (result === 'PASS') {
    capability.confidence = Math.min(100, capability.confidence + 10);
    capability.evidence.successes++;
  } else {
    capability.confidence = Math.max(0, capability.confidence - 15);
    capability.evidence.failures++;
  }
  capability.evidence.last_validated = new Date().toISOString().split('T')[0];

  // Update maturity
  const totalAttempts = capability.evidence.successes + capability.evidence.failures;
  const successRate = capability.evidence.successes / totalAttempts;

  if (capability.maturity === 'Declared' && capability.evidence.successes >= 1) {
    capability.maturity = 'Demonstrated';
  }
  if (capability.maturity === 'Demonstrated' && capability.evidence.successes >= 3 && successRate >= 0.8) {
    capability.maturity = 'Reliable';
  }
  if (capability.maturity === 'Reliable' && successRate < 0.7) {
    capability.maturity = 'Demonstrated';
  }

  // Save updated file
  saveCapabilityFile(filename, file);

  // Log to capability ledger
  logToLedger({
    event: 'CAPABILITY_RESULT',
    capability_id: capabilityId,
    result,
    confidence_before: oldConfidence,
    confidence_after: capability.confidence,
    maturity_before: oldMaturity,
    maturity_after: capability.maturity,
    evidence: evidencePointers,
  });

  // Log to evolution log if changed
  if (oldConfidence !== capability.confidence || oldMaturity !== capability.maturity) {
    logEvolution({
      capability: capabilityId,
      file: filename,
      oldConfidence,
      newConfidence: capability.confidence,
      oldMaturity,
      newMaturity: capability.maturity,
      trigger: 'validation_result',
      evidence: evidencePointers,
    });
  }

  return {
    updated: true,
    newConfidence: capability.confidence,
    newMaturity: capability.maturity,
  };
}

/**
 * Update multiple capabilities from verifier results
 */
export function updateCapabilitiesFromVerifierResults(
  results: VerifierResult[],
  capabilityMappings: Record<string, string[]>
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

  // Map verifiers to capabilities and update
  for (const result of results) {
    const capabilityIds = capabilityMappings[result.verifier_id] || [];
    for (const capabilityId of capabilityIds) {
      updateCapabilityConfidence(
        capabilityId,
        result.result,
        [`verifier:${result.verifier_id}`]
      );
    }
  }
}

/**
 * Default verifier to capability mappings
 */
export const DEFAULT_CAPABILITY_MAPPINGS: Record<string, string[]> = {
  git_status_clean: ['git.branch_commit'],
  commit_exists: ['git.branch_commit'],
  node_install: ['node.npm.install'],
  node_build: ['node.npm.run_script', 'nextjs.build.basic'],
  node_test: ['node.npm.run_script'],
  lint_pass: ['node.npm.run_script'],
  docs_checklist: ['comm.documentation'],
};
