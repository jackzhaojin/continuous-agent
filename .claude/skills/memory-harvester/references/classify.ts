/**
 * Schema validator for harvester writes. Pure validation; no I/O.
 *
 * Authoritative human-readable spec: `./taxonomy.md` (read it first).
 * Field defaults: `./defaults.ts` (applied BEFORE this validator runs).
 *
 * This file is the deterministic gate that rejects malformed payloads BEFORE
 * they hit mem0. The harvester SKILL.md decides agentically WHAT to write;
 * this file decides whether the shape is legal.
 *
 * Taxonomy version: v1.0.0 — see `taxonomy.md` §Migration Policy before bumping.
 */

// ── Enums (kept in sync with taxonomy.md §Section B) ────────────────────────

export type MemoryType =
  | "principle"
  | "semantic"
  | "procedural"
  | "episodic"
  | "reflective";

export type MemoryCategory = "technical" | "functional" | "project";

export type MemoryImportance = "critical" | "high" | "medium" | "low";

export type MemoryEnv = "test" | "dev" | "prod";

export type MemoryTrigger =
  | "post-run"
  | "post-retro"
  | "failure-diagnosis"
  | "spec-merge"
  | "manual-harvest"
  | "practice-loop";

export type MemoryActor = "executive" | "worker" | "human";

// Mirrors AgentWorkerVendor in src/core/vendor/types.ts — kept narrow here
// to avoid cross-module coupling. Update both sides if vendors change.
export type WorkerVendor = "claude" | "codex" | "kimi" | "kimi-cli" | "kimi-wire";

// ── Shape ────────────────────────────────────────────────────────────────────

export interface MemoryWriteMetadata {
  // Versioning
  schema_version: string;

  // Environment isolation
  env: MemoryEnv;
  cohort?: string;

  // Classification
  type: MemoryType;
  category: MemoryCategory;
  importance: MemoryImportance;
  confidence: number;

  // Provenance
  trigger: MemoryTrigger;
  actor: MemoryActor;
  worker_vendor?: WorkerVendor;
  source: string;
  harvest_run: string;

  // Optional retrieval aids
  outcome?: "success" | "failure" | "partial";
  tags?: string[];
  expires_at?: string;
}

export interface MemoryWrite {
  text: string;
  user_id: string;
  agent_id: "executive";
  app_id: string;
  run_id: string; // always required in v1.0.0 — see taxonomy.md §A
  metadata: MemoryWriteMetadata;
  immutable: boolean;
}

export interface ValidationError {
  field: string;
  reason: string;
}

// ── Enum sets ────────────────────────────────────────────────────────────────

const TYPES: ReadonlySet<MemoryType> = new Set([
  "principle",
  "semantic",
  "procedural",
  "episodic",
  "reflective",
]);
const CATEGORIES: ReadonlySet<MemoryCategory> = new Set([
  "technical",
  "functional",
  "project",
]);
const IMPORTANCES: ReadonlySet<MemoryImportance> = new Set([
  "critical",
  "high",
  "medium",
  "low",
]);
const ENVS: ReadonlySet<MemoryEnv> = new Set(["test", "dev", "prod"]);
const TRIGGERS: ReadonlySet<MemoryTrigger> = new Set([
  "post-run",
  "post-retro",
  "failure-diagnosis",
  "spec-merge",
  "manual-harvest",
  "practice-loop",
]);
const ACTORS: ReadonlySet<MemoryActor> = new Set(["executive", "worker", "human"]);
const WORKER_VENDORS: ReadonlySet<WorkerVendor> = new Set([
  "claude",
  "codex",
  "kimi",
  "kimi-cli",
  "kimi-wire",
]);

// ── Patterns ─────────────────────────────────────────────────────────────────

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
// Reserved app_id slugs are an explicit allow-list (taxonomy.md §A.1):
//   _global       — cross-project lessons
//   _executive    — about the executive loop itself
//   _skill-<slug> — about a specific skill's behavior
// Any other leading-underscore slug is rejected. Bundle slugs MUST NOT start with '_'.
const RESERVED_APP_ID = /^(_global|_executive|_skill-[a-z0-9][a-z0-9-]*)$/;
const BUNDLE_APP_ID = /^[a-z0-9][a-z0-9-]*$/;
// Allow kebab-case AND SCREAMING_SNAKE so error codes (EAI_AGAIN, ECONNRESET)
// can be embedded verbatim — they survive mem0 extraction unchanged.
const KEBAB_TAG = /^[a-z0-9][a-z0-9_-]*$/i;
const MAX_TAGS = 8;

// ── Validator ────────────────────────────────────────────────────────────────

export function validateMemoryWrite(payload: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof payload !== "object" || payload === null) {
    return [{ field: "(root)", reason: "payload must be an object" }];
  }
  const p = payload as Record<string, unknown>;

  // ─── Top-level scope IDs (all four required — taxonomy.md §A) ─────────────
  if (typeof p.text !== "string" || p.text.trim().length === 0) {
    errors.push({ field: "text", reason: "must be a non-empty string" });
  }
  if (typeof p.user_id !== "string" || p.user_id.trim().length === 0) {
    errors.push({
      field: "user_id",
      reason: "must be a non-empty string (from V3_MEM0_USER_ID)",
    });
  }
  if (p.agent_id !== "executive") {
    errors.push({ field: "agent_id", reason: 'must be exactly "executive" in V3.0' });
  }
  if (typeof p.app_id !== "string" || p.app_id.trim().length === 0) {
    errors.push({ field: "app_id", reason: "must be a non-empty slug" });
  } else {
    const appId = p.app_id as string;
    const isReserved = appId.startsWith("_");
    if (isReserved && !RESERVED_APP_ID.test(appId)) {
      errors.push({
        field: "app_id",
        reason: 'reserved app_id must be one of "_global", "_executive", or "_skill-<slug>"',
      });
    }
    if (!isReserved && !BUNDLE_APP_ID.test(appId)) {
      errors.push({
        field: "app_id",
        reason: 'bundle slugs must match /^[a-z0-9][a-z0-9-]*$/ (kebab-case, no leading underscore)',
      });
    }
  }
  if (typeof p.run_id !== "string" || !ISO_DATE_PREFIX.test(p.run_id as string)) {
    errors.push({
      field: "run_id",
      reason: "required; must start with YYYY-MM-DD (see taxonomy.md §A.2 for per-trigger format)",
    });
  }
  if (typeof p.immutable !== "boolean") {
    errors.push({ field: "immutable", reason: "must be a boolean" });
  }

  // ─── Metadata ────────────────────────────────────────────────────────────
  const m = p.metadata as Record<string, unknown> | undefined;
  if (typeof m !== "object" || m === null) {
    errors.push({ field: "metadata", reason: "must be an object" });
    return errors;
  }

  // Versioning
  if (typeof m.schema_version !== "string" || m.schema_version.trim().length === 0) {
    errors.push({
      field: "metadata.schema_version",
      reason: 'must be a non-empty semver string (stamped by defaults.ts; current "1.0.0")',
    });
  }

  // Environment
  if (!ENVS.has(m.env as MemoryEnv)) {
    errors.push({
      field: "metadata.env",
      reason: `must be one of ${[...ENVS].join(", ")}`,
    });
  }
  if (m.cohort !== undefined) {
    if (typeof m.cohort !== "string" || m.cohort.trim().length === 0) {
      errors.push({
        field: "metadata.cohort",
        reason: "when set, must be a non-empty string",
      });
    }
  }

  // Classification
  if (!TYPES.has(m.type as MemoryType)) {
    errors.push({
      field: "metadata.type",
      reason: `must be one of ${[...TYPES].join(", ")}`,
    });
  }
  if (!CATEGORIES.has(m.category as MemoryCategory)) {
    errors.push({
      field: "metadata.category",
      reason: `must be one of ${[...CATEGORIES].join(", ")}`,
    });
  }
  if (!IMPORTANCES.has(m.importance as MemoryImportance)) {
    errors.push({
      field: "metadata.importance",
      reason: `must be one of ${[...IMPORTANCES].join(", ")}`,
    });
  }
  if (typeof m.confidence !== "number" || m.confidence < 0 || m.confidence > 1) {
    errors.push({
      field: "metadata.confidence",
      reason: "must be a number in [0.0, 1.0]",
    });
  }

  // Provenance
  if (!TRIGGERS.has(m.trigger as MemoryTrigger)) {
    errors.push({
      field: "metadata.trigger",
      reason: `must be one of ${[...TRIGGERS].join(", ")}`,
    });
  }
  if (!ACTORS.has(m.actor as MemoryActor)) {
    errors.push({
      field: "metadata.actor",
      reason: `must be one of ${[...ACTORS].join(", ")}`,
    });
  }
  if (m.worker_vendor !== undefined) {
    if (!WORKER_VENDORS.has(m.worker_vendor as WorkerVendor)) {
      errors.push({
        field: "metadata.worker_vendor",
        reason: `must be one of ${[...WORKER_VENDORS].join(", ")}`,
      });
    }
    if (m.actor !== "worker") {
      errors.push({
        field: "metadata.worker_vendor",
        reason: 'only allowed when actor === "worker"',
      });
    }
  } else if (m.actor === "worker") {
    errors.push({
      field: "metadata.worker_vendor",
      reason: 'required when actor === "worker"',
    });
  }
  if (typeof m.source !== "string" || m.source.trim().length === 0) {
    errors.push({
      field: "metadata.source",
      reason: "must be a non-empty path to source markdown",
    });
  }
  if (typeof m.harvest_run !== "string" || !ISO_DATE_PREFIX.test(m.harvest_run as string)) {
    errors.push({
      field: "metadata.harvest_run",
      reason: "must start with YYYY-MM-DD (mirrors run_id)",
    });
  }

  // Optional retrieval aids
  if (m.outcome !== undefined) {
    if (!["success", "failure", "partial"].includes(m.outcome as string)) {
      errors.push({
        field: "metadata.outcome",
        reason: 'when set, must be one of "success", "failure", "partial"',
      });
    }
  }
  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags)) {
      errors.push({ field: "metadata.tags", reason: "when set, must be an array" });
    } else {
      const tags = m.tags as unknown[];
      if (tags.length > MAX_TAGS) {
        errors.push({
          field: "metadata.tags",
          reason: `at most ${MAX_TAGS} tags allowed`,
        });
      }
      tags.forEach((t, i) => {
        if (typeof t !== "string" || !KEBAB_TAG.test(t)) {
          errors.push({
            field: `metadata.tags[${i}]`,
            reason: "each tag must be a kebab-case or SCREAMING_SNAKE token (alphanumeric + _ - allowed)",
          });
        }
      });
    }
  }
  if (m.expires_at !== undefined) {
    if (typeof m.expires_at !== "string" || !ISO_DATETIME.test(m.expires_at as string)) {
      errors.push({
        field: "metadata.expires_at",
        reason: "when set, must be an ISO 8601 datetime string",
      });
    }
  }

  // ─── Cross-field constraints ─────────────────────────────────────────────
  if (m.type === "principle" && p.immutable !== true) {
    errors.push({
      field: "immutable",
      reason: 'principle memories must be immutable: true',
    });
  }
  if (m.type === "episodic" && typeof p.run_id === "string" && !ISO_DATE_PREFIX.test(p.run_id as string)) {
    errors.push({
      field: "run_id",
      reason: 'episodic memories require run_id starting with YYYY-MM-DD',
    });
  }
  // harvest_run should mirror run_id in v1.0.0 (two fields, one truth)
  if (typeof m.harvest_run === "string" && typeof p.run_id === "string" && m.harvest_run !== p.run_id) {
    errors.push({
      field: "metadata.harvest_run",
      reason: 'must equal run_id (mirror field — defaults.ts sets this automatically)',
    });
  }

  return errors;
}

export function assertValid(payload: unknown): asserts payload is MemoryWrite {
  const errs = validateMemoryWrite(payload);
  if (errs.length > 0) {
    const summary = errs.map((e) => `  - ${e.field}: ${e.reason}`).join("\n");
    throw new Error(`MemoryWrite schema validation failed:\n${summary}`);
  }
}
