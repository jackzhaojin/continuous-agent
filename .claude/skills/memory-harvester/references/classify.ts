/**
 * Schema validator for harvester writes. Pure validation; no I/O.
 *
 * Enforces the MemoryWrite contract from
 * `ai-docs/v3/2026-05-16-v3.0/second-brain-hosting-decision.md` §Metadata Schema.
 *
 * The harvester skill (SKILL.md) decides agentically WHAT to write. This file
 * is the gate that rejects malformed payloads BEFORE they hit mem0.
 */

export type MemoryType =
  | "principle"
  | "semantic"
  | "procedural"
  | "episodic"
  | "reflective";

export type MemoryCategory = "technical" | "functional" | "project";

export type MemoryImportance = "critical" | "high" | "medium" | "low";

export interface MemoryWriteMetadata {
  type: MemoryType;
  category: MemoryCategory;
  confidence: number;
  importance: MemoryImportance;
  source: string;
  harvest_run: string;
}

export interface MemoryWrite {
  text: string;
  user_id: string;
  agent_id: "executive";
  app_id: string;
  run_id?: string;
  metadata: MemoryWriteMetadata;
  immutable: boolean;
}

export interface ValidationError {
  field: string;
  reason: string;
}

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

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

export function validateMemoryWrite(payload: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof payload !== "object" || payload === null) {
    return [{ field: "(root)", reason: "payload must be an object" }];
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.text !== "string" || p.text.trim().length === 0) {
    errors.push({ field: "text", reason: "must be a non-empty string" });
  }
  if (typeof p.user_id !== "string" || p.user_id.trim().length === 0) {
    errors.push({ field: "user_id", reason: "must be a non-empty string (from V3_MEM0_USER_ID)" });
  }
  if (p.agent_id !== "executive") {
    errors.push({ field: "agent_id", reason: "must be exactly \"executive\" in V3.0" });
  }
  if (typeof p.app_id !== "string" || p.app_id.trim().length === 0) {
    errors.push({ field: "app_id", reason: "must be a non-empty bundle slug" });
  }
  if (typeof p.immutable !== "boolean") {
    errors.push({ field: "immutable", reason: "must be a boolean" });
  }

  const m = p.metadata as Record<string, unknown> | undefined;
  if (typeof m !== "object" || m === null) {
    errors.push({ field: "metadata", reason: "must be an object" });
    return errors;
  }

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
  if (typeof m.source !== "string" || m.source.trim().length === 0) {
    errors.push({ field: "metadata.source", reason: "must be a non-empty path to source markdown" });
  }
  if (typeof m.harvest_run !== "string" || !ISO_DATE_PREFIX.test(m.harvest_run as string)) {
    errors.push({
      field: "metadata.harvest_run",
      reason: "must start with YYYY-MM-DD (e.g. 2026-05-16-credit-card-stockpile)",
    });
  }

  if (m.type === "episodic") {
    if (typeof p.run_id !== "string" || !ISO_DATE_PREFIX.test(p.run_id as string)) {
      errors.push({
        field: "run_id",
        reason: "required when metadata.type === \"episodic\"; must start with YYYY-MM-DD",
      });
    }
  }

  if (m.type === "principle" && p.immutable !== true) {
    errors.push({
      field: "immutable",
      reason: "principle memories must be immutable: true",
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
