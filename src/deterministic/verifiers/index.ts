/**
 * Verifiers Module
 *
 * The proof engine for capability validation.
 * No verifier = not proven. Self-report does not count.
 */

export {
  verifyGitStatusClean,
  verifyCommitExists,
  verifyFilesExist,
  verifyNodeInstall,
  verifyNodeBuild,
  verifyNodeTest,
  verifyLintPass,
  verifyDocsChecklist,
  runAllVerifiers,
  summarizeResults,
  type VerifierResult,
  type VerifierConfig,
} from './core-verifiers.js';

export {
  runIntegrityVerifier,
  checkNoOrphanSources,
  checkNoOrphanPatches,
  checkNoOrphanForks,
  checkNoMissingFolders,
  type IntegrityCheckResult,
  type IntegrityReport,
} from './reference-integrity.js';
