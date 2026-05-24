/**
 * Types for the V3.0 agentic memory hooks. No prompts, no logic — just the
 * shapes the executive loop passes into `runMemoryHook()` and gets back.
 *
 * The intelligence lives in the `memory-hook-*` SKILL.md files; this file only
 * names the five hooks and the context/result envelopes.
 */

/** The five lifecycle hooks (A–E in the implementation plan). */
export type HookName =
  | "pre-work-selection" // A — read, executive planning
  | "pre-spawn-pack" // B — read, builds worker Memory Pack
  | "post-run-harvest" // C — write, episodic/semantic/procedural
  | "failure-diagnosis" // D — read (+ conditional write)
  | "post-retro-harvest"; // E — write, reflective/semantic

/**
 * Context handed to a hook. Serialized to JSON and substituted into the hook
 * SKILL.md's {{CONTEXT_JSON}} placeholder. Deliberately open — each hook reads
 * the subset of fields its SKILL.md documents. Keep keys snake/camel as the
 * SKILL.md describes them (see each memory-hook hook's SKILL.md "Context" section).
 */
export interface HookContext {
  /** The work item under consideration (most hooks). */
  workItem?: Record<string, unknown>;
  /** Current step, if step execution. */
  currentStep?: Record<string, unknown>;
  /** Pre-generated harvest run id `YYYY-MM-DD-{slug}-{nonce}` (write hooks). */
  harvestRun?: string;
  /** Anything else the specific hook documents. */
  [key: string]: unknown;
}

/** What a hook returns to the executive loop. */
export interface HookResult {
  /** Did the agentic turn actually run? false when gated off. */
  ran: boolean;
  /** True when skipped due to a disabled flag (not an error). */
  skipped?: boolean;
  /** Why skipped (flag name) or why errored. */
  reason?: string;
  /** Final assistant text from the turn (empty if skipped/errored). */
  finalText: string;
  /** Hook B only: the extracted `## Memory Pack` markdown block. */
  memoryPack?: string;
  /** Names of tools the turn called (for telemetry/debug). */
  toolCalls?: string[];
  /** Wall-clock duration of the turn in ms. */
  durationMs?: number;
  /** Set when the turn threw or the SDK reported an error. */
  error?: string;
}
