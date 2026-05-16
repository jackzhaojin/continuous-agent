/**
 * Three-layer assertions for agentic tests. See ../README.md for the design.
 *
 *   Trajectory   — expectSkillCalled / expectToolCalled / expectToolNotCalled
 *   Side effects — expectLedgerHasEntry / expectFileWritten / expectMem0MemoryExists
 *   Output       — expectOutputContains / expectOutputMatchesAll
 *
 * Helpers return void on success; on failure they print a labeled diagnostic
 * to stderr and increment a counter via the supplied assert() function. The
 * caller chooses whether to throw on failure (live tests) or just count
 * (cheap deterministic tests).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import MemoryClient from "mem0ai";
import type { AgenticTestResult, ToolCallTrace } from "./harness.js";

export type AssertFn = (
  condition: boolean,
  label: string,
  detail?: string,
) => void;

// ─────────── Trajectory ───────────

export function expectSkillCalled(
  assert: AssertFn,
  result: AgenticTestResult,
  skillName: string,
): void {
  assert(
    result.skillsInvoked.includes(skillName),
    `skill called: ${skillName}`,
    result.skillsInvoked.length
      ? `actual: ${result.skillsInvoked.join(", ")}`
      : "no skills invoked",
  );
}

export function expectToolCalled(
  assert: AssertFn,
  result: AgenticTestResult,
  toolName: string,
  inputMatcher?: RegExp,
): void {
  const matches = result.toolCalls.filter((c) => c.name === toolName);
  let ok = matches.length > 0;
  let detail = matches.length === 0 ? "never called" : undefined;

  if (ok && inputMatcher) {
    ok = matches.some((c) => inputMatcher.test(JSON.stringify(c.input)));
    if (!ok) detail = `called ${matches.length}× but no input matched ${inputMatcher}`;
  }

  assert(ok, `tool called: ${toolName}${inputMatcher ? ` matching ${inputMatcher}` : ""}`, detail);
}

export function expectToolCalledAtLeastN(
  assert: AssertFn,
  result: AgenticTestResult,
  toolName: string,
  n: number,
): void {
  const count = result.toolCalls.filter((c) => c.name === toolName).length;
  assert(
    count >= n,
    `tool called ≥${n}×: ${toolName}`,
    `actual count: ${count}`,
  );
}

export function expectToolNotCalled(
  assert: AssertFn,
  result: AgenticTestResult,
  toolName: string,
): void {
  const count = result.toolCalls.filter((c) => c.name === toolName).length;
  assert(
    count === 0,
    `tool NOT called: ${toolName}`,
    count ? `actual count: ${count}` : undefined,
  );
}

// ─────────── Side effects ───────────

export interface LedgerExpectation {
  memoryId?: string;
  eventId?: string;
  status?: string;
}

export function expectLedgerHasEntry(
  assert: AssertFn,
  ledgerPath: string,
  expected: LedgerExpectation,
): void {
  const fullPath = ledgerPath.startsWith("/")
    ? ledgerPath
    : join(process.cwd(), ledgerPath);

  if (!existsSync(fullPath)) {
    assert(false, `ledger exists: ${ledgerPath}`, "file not found");
    return;
  }

  const lines = readFileSync(fullPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  const match = lines.find((line) => {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (expected.memoryId && entry.memoryId !== expected.memoryId) return false;
      if (expected.eventId && entry.eventId !== expected.eventId) return false;
      if (expected.status && entry.status !== expected.status) return false;
      return true;
    } catch {
      return false;
    }
  });

  assert(
    Boolean(match),
    `ledger entry found: ${ledgerPath}`,
    match ? undefined : `no line matching ${JSON.stringify(expected)} in ${lines.length} entries`,
  );
}

export async function expectMem0MemoryExists(
  assert: AssertFn,
  memoryId: string | undefined,
  apiKey: string,
): Promise<void> {
  if (!memoryId) {
    assert(false, "mem0 memory exists", "no memoryId captured from agent run");
    return;
  }
  try {
    const client = new MemoryClient({ apiKey });
    const got = (await client.get(memoryId)) as { id?: string; memory?: string } | null;
    assert(
      Boolean(got && (got.id === memoryId || got.memory)),
      `mem0 memory exists: ${memoryId}`,
      got ? undefined : "client.get returned null",
    );
  } catch (e) {
    assert(false, `mem0 memory exists: ${memoryId}`, (e as Error).message);
  }
}

export function expectFileWritten(
  assert: AssertFn,
  filePath: string,
  contentMatcher?: RegExp,
): void {
  const fullPath = filePath.startsWith("/")
    ? filePath
    : join(process.cwd(), filePath);

  if (!existsSync(fullPath)) {
    assert(false, `file written: ${filePath}`, "file not found");
    return;
  }
  if (contentMatcher) {
    const content = readFileSync(fullPath, "utf-8");
    assert(
      contentMatcher.test(content),
      `file content matches ${contentMatcher}: ${filePath}`,
    );
  } else {
    assert(true, `file written: ${filePath}`);
  }
}

// ─────────── Output ───────────

export function expectOutputContains(
  assert: AssertFn,
  result: AgenticTestResult,
  matcher: string | RegExp,
): void {
  const ok = typeof matcher === "string"
    ? result.finalText.includes(matcher)
    : matcher.test(result.finalText);
  assert(
    ok,
    `final output contains ${matcher instanceof RegExp ? matcher.toString() : `"${matcher}"`}`,
    ok ? undefined : `final length: ${result.finalText.length} chars`,
  );
}

export function expectOutputMatchesAll(
  assert: AssertFn,
  result: AgenticTestResult,
  matchers: RegExp[],
): void {
  const missing = matchers.filter((m) => !m.test(result.finalText));
  assert(
    missing.length === 0,
    `final output matches all ${matchers.length} patterns`,
    missing.length ? `missing: ${missing.map((m) => m.toString()).join(", ")}` : undefined,
  );
}

/**
 * Agent reached a final `subtype:"success"` result message. Tool-call errors
 * along the way (e.g. validator-rejected payloads, retried Bash commands) do
 * NOT fail this assertion — that's normal agentic retry behavior. Use
 * `expectNoToolErrors` separately if you need strict "no failures anywhere".
 */
export function expectSucceeded(assert: AssertFn, result: AgenticTestResult): void {
  assert(
    result.succeeded,
    `run reached subtype:"success"`,
    result.succeeded ? undefined : `succeeded=${result.succeeded}, errors=${result.errors.length}`,
  );
}

/** Strict variant: no tool_result errors observed during the run. */
export function expectNoToolErrors(assert: AssertFn, result: AgenticTestResult): void {
  assert(
    result.errors.length === 0,
    `no tool errors during run`,
    result.errors.length ? `errors: ${result.errors.slice(0, 3).join("; ")}` : undefined,
  );
}

/** At least one memory_id was captured from harvest.ts tool_result output. */
export function expectMemoryCaptured(assert: AssertFn, result: AgenticTestResult): void {
  assert(
    Boolean(result.capturedMemoryId),
    `at least one memory_id captured`,
    result.capturedMemoryId ? undefined : "no memory_id in any tool_result",
  );
}

// ─────────── Debug helpers ───────────

/** Print a compact summary of the run. Use in test scripts to print result diagnostics. */
export function printTraceSummary(result: AgenticTestResult): void {
  console.log();
  console.log(`  → skill: ${result.skill}`);
  console.log(`  → duration: ${result.durationMs}ms`);
  console.log(`  → tool calls: ${result.toolCalls.length}`);
  for (const t of result.toolCalls) summarizeToolCall(t);
  console.log(`  → skills invoked: ${result.skillsInvoked.join(", ") || "(none)"}`);
  console.log(`  → memory_id captured: ${result.capturedMemoryId ?? "(none)"}`);
  console.log(`  → event_ids: ${result.capturedEventIds.join(", ") || "(none)"}`);
  if (result.errors.length) {
    console.log(`  → errors: ${result.errors.join("; ")}`);
  }
}

function summarizeToolCall(t: ToolCallTrace): void {
  const preview = JSON.stringify(t.input).slice(0, 100);
  console.log(`    [${t.index}] ${t.name}  ${preview}${preview.length === 100 ? "…" : ""}`);
}
