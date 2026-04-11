/**
 * EDS mode detector — re-exports generic's implementation.
 *
 * Both harnesses target an ai-docs/SPEC/ layout so scenario detection is
 * identical. EDS-specific detection (e.g. .hlxignore parity) lives in
 * orchestrator.ts:runEdsOrchestrator() which applies it on first run.
 */
export {
  detectHarnessMode,
  detectScenario,
  detectSpecGaps,
  hasCompleteAIDocs,
  hasSignificantCode,
  isDirEmpty,
} from '../generic/mode-detector.js';
