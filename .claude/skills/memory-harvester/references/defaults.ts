/**
 * Defaults stamper for harvester writes.
 *
 * Fills the boring/env-derived fields on a MemoryWrite so the agentic harvester
 * skill only has to think about the meaningful fields (text, type, trigger,
 * actor, source, run_id).
 *
 * Pure: no I/O, no mem0 calls. Reads env vars (already loaded by harvest.ts via
 * dotenv) and applies sensible defaults. The validator (classify.ts) runs AFTER
 * this — defaults only fill what was unset; explicit values pass through.
 *
 * Schema spec: see `taxonomy.md` (this file's neighbor). When taxonomy bumps,
 * bump SCHEMA_VERSION below and append an entry to `taxonomy-changelog.md`.
 */

import type { MemoryWrite, MemoryActor, MemoryTrigger } from "./classify.js";

/**
 * Current taxonomy version. Bumped on every schema change.
 *   - patch (1.0.x): tightened validation on existing field
 *   - minor (1.x.0): new optional field or new enum value
 *   - major (x.0.0): breaking — field rename or required-field add
 *
 * Old records keep their old stamp; readers can filter on this when needed.
 */
export const SCHEMA_VERSION = "1.0.0";

/**
 * Default env when V3_MEM0_ENV is unset. "prod" is the safe default —
 * reader scope filters default to env: "prod", so a missing env var
 * means "writes are real."
 */
const DEFAULT_ENV: "test" | "dev" | "prod" = "prod";

/**
 * Trigger → actor inference. The actor records *who produced the fact*,
 * not who wrote the memory (the writer is always agent_id: "executive").
 *
 * The mapping captures the typical authorship by trigger:
 *   - post-run / failure-diagnosis → the worker did the thing
 *   - post-retro / spec-merge / manual-harvest → a human authored the source
 *   - practice-loop → the executive's own self-improvement turn
 *
 * The skill can still override explicitly. The validator catches the
 * dangerous misconfig (actor=worker without worker_vendor).
 */
const DEFAULT_ACTOR_BY_TRIGGER: Record<MemoryTrigger, MemoryActor> = {
  "post-run": "worker",
  "failure-diagnosis": "worker",
  "post-retro": "human",
  "spec-merge": "human",
  "manual-harvest": "human",
  "practice-loop": "executive",
};

/**
 * Partial form of a MemoryWrite that the agentic skill can hand to defaults.
 * Mirrors MemoryWrite but every metadata field is optional — defaults fills
 * the gaps, then classify.ts validates the final shape.
 */
export interface PartialMemoryWrite {
  text: string;
  user_id?: string;
  agent_id?: "executive";
  app_id: string;
  run_id: string;
  immutable?: boolean;
  metadata: {
    // required, no default — caller must supply
    type: MemoryWrite["metadata"]["type"];
    category: MemoryWrite["metadata"]["category"];
    importance: MemoryWrite["metadata"]["importance"];
    confidence: number;
    trigger: MemoryWrite["metadata"]["trigger"];
    source: string;

    // optional — defaults fill if absent
    schema_version?: string;
    env?: "test" | "dev" | "prod";
    cohort?: string;
    actor?: "executive" | "worker" | "human";
    worker_vendor?: MemoryWrite["metadata"]["worker_vendor"];
    harvest_run?: string;
    outcome?: "success" | "failure" | "partial";
    tags?: string[];
    expires_at?: string;
  };
}

/**
 * Apply defaults to a partial payload, producing a fully-formed MemoryWrite
 * candidate. The result still needs to pass classify.ts validation — defaults
 * fills env-derived fields, but the caller still owns the semantic fields.
 */
export function applyDefaults(partial: PartialMemoryWrite): MemoryWrite {
  const userIdFromEnv = process.env.V3_MEM0_USER_ID;
  const envFromEnv = process.env.V3_MEM0_ENV as "test" | "dev" | "prod" | undefined;
  const cohortFromEnv = process.env.V3_MEM0_COHORT;

  const user_id = partial.user_id ?? userIdFromEnv ?? "";
  const agent_id = partial.agent_id ?? "executive";
  const immutable = partial.immutable ?? partial.metadata.trigger === "spec-merge";
  // ↑ spec-merge defaults to immutable=true; everything else mutable. Caller
  //   can still override explicitly. Principles must be immutable (validator
  //   re-checks this constraint).

  const m = partial.metadata;
  const schema_version = m.schema_version ?? SCHEMA_VERSION;
  const env = m.env ?? envFromEnv ?? DEFAULT_ENV;
  const cohort = m.cohort ?? cohortFromEnv ?? undefined;
  const actor = m.actor ?? DEFAULT_ACTOR_BY_TRIGGER[m.trigger] ?? "executive";
  const harvest_run = m.harvest_run ?? partial.run_id;

  const metadata: MemoryWrite["metadata"] = {
    schema_version,
    env,
    type: m.type,
    category: m.category,
    importance: m.importance,
    confidence: m.confidence,
    trigger: m.trigger,
    actor,
    source: m.source,
    harvest_run,
  };

  if (cohort !== undefined) metadata.cohort = cohort;
  if (m.worker_vendor !== undefined) metadata.worker_vendor = m.worker_vendor;
  if (m.outcome !== undefined) metadata.outcome = m.outcome;
  if (m.tags !== undefined) metadata.tags = m.tags;
  if (m.expires_at !== undefined) metadata.expires_at = m.expires_at;

  return {
    text: partial.text,
    user_id,
    agent_id,
    app_id: partial.app_id,
    run_id: partial.run_id,
    metadata,
    immutable,
  };
}
