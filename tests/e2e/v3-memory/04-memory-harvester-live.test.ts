/**
 * Test 04 — memory-harvester LIVE (real Agent SDK + real mem0 API + cleanup).
 *
 * Proves the production agentic-write path end-to-end:
 *   1. Invoke `memory-hook-post-run-harvest` wrapper skill via Agent SDK query()
 *   2. The hook delegates to `memory-harvester` skill (via Skill tool)
 *   3. The harvester invokes harvest.ts via Bash, which:
 *        - validates the MemoryWrite schema
 *        - calls client.add() with camelCase opts
 *        - polls pollEventTerminal(eventId) until SUCCEEDED
 *        - appends to ledgers/harvest-runs/{date}.jsonl
 *   4. Assertions on all three layers (trajectory / side effects / output)
 *   5. Cleanup: delete the memory from mem0
 *
 * Cost: ~5–10 cents in Claude API + 1 mem0 write. The mem0 write is deleted
 * in finally{} so the second brain doesn't accumulate test data.
 *
 * Run: npx tsx tests/e2e/v3-memory/04-memory-harvester-live.test.ts
 *
 * Required env (from .env.executive + .env.worker):
 *   CLAUDE_CODE_OAUTH_TOKEN  — Agent SDK auth
 *   V3_MEM0_API_KEY          — mem0 API key
 *   V3_MEM0_USER_ID          — executive agent identity slug
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

import {
  runAgenticTest,
  makeTestScope,
} from "../../agentic-harness/harness.js";
import {
  expectSkillCalled,
  expectToolCalled,
  expectSucceeded,
  expectMemoryCaptured,
  expectOutputContains,
  expectLedgerHasEntry,
  expectMem0MemoryExists,
  printTraceSummary,
} from "../../agentic-harness/assertions.js";
import {
  cleanupMem0Scope,
  printCleanupSummary,
} from "../../agentic-harness/cleanup.js";

// ── env ───────────────────────────────────────────────────────

const AGENT_ROOT = path.resolve(import.meta.dirname, "../../..");
loadEnv({ path: path.join(AGENT_ROOT, ".env.executive") });
loadEnv({ path: path.join(AGENT_ROOT, ".env.worker") });

const OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const MEM0_API_KEY = process.env.V3_MEM0_API_KEY;
const MEM0_USER_ID = process.env.V3_MEM0_USER_ID;

if (!OAUTH_TOKEN || !MEM0_API_KEY || !MEM0_USER_ID) {
  console.error(
    "[test:skipped] Missing CLAUDE_CODE_OAUTH_TOKEN, V3_MEM0_API_KEY, or V3_MEM0_USER_ID. " +
      "Set these in .env.executive + .env.worker.",
  );
  process.exit(2);
}

// ── assert harness ────────────────────────────────────────────

const PASS = "✓";
const FAIL = "✗";
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── synthetic CONTEXT for the post-run-harvest hook ───────────

const scope = makeTestScope("v3-test-04");

const TEST_DISCRIMINATOR = `TEST-04-CANARY-${scope.run_id}`;

const SYNTHETIC_CONTEXT = {
  workItem: {
    id: `test-workitem-${scope.run_id}`,
    title: "Test work item for V3 memory-harvester live test",
    bundle_slug: scope.app_id,
    app_id: scope.app_id,
    priority: "P3",
  },
  contractEvents: [
    { type: "tool_call", tool: "Bash", input: "echo test", ok: true },
    { type: "validation", verdict: "PASS" },
  ],
  validationReport: { verdict: "PASS", details: "synthetic test report" },
  outputPath: "/tmp/synthetic-output",
  vendor: "claude",
  runStartedAt: new Date().toISOString(),
  runEndedAt: new Date().toISOString(),
  // Note: harvest_run is auto-mirrored from run_id by defaults.ts — do not pass it.
  // Steer the agent toward a single episodic write so the test is deterministic.
  testInstruction: [
    "This is a test invocation. Write EXACTLY ONE episodic memory and stop.",
    `The memory text MUST include the literal discriminator "${TEST_DISCRIMINATOR}" verbatim.`,
    "Use confidence=1.0, importance=medium, category=project, trigger=post-run.",
    "Set actor=worker and worker_vendor=claude (required by validator when actor=worker).",
    "Do NOT include user_id, agent_id, schema_version, env, harvest_run, or immutable — defaults.ts stamps them.",
    "Do not write any additional memories (no semantic, no procedural).",
  ].join(" "),
};

// ── main ──────────────────────────────────────────────────────

async function main(): Promise<number> {
  console.log("\n=== V3 Memory — memory-harvester LIVE (real API + cleanup) ===\n");
  console.log(`Test scope:`);
  console.log(`  user_id:  ${MEM0_USER_ID}`);
  console.log(`  app_id:   ${scope.app_id}`);
  console.log(`  run_id:   ${scope.run_id}`);
  console.log(`  canary:   ${TEST_DISCRIMINATOR}`);

  let result: Awaited<ReturnType<typeof runAgenticTest>> | null = null;

  try {
    console.log("\n[step 1] Invoke memory-hook-post-run-harvest via Agent SDK");
    result = await runAgenticTest({
      skill: "memory-hook-post-run-harvest",
      vars: { CONTEXT_JSON: JSON.stringify(SYNTHETIC_CONTEXT) },
      scope: { app_id: scope.app_id, user_id: MEM0_USER_ID, run_id: scope.run_id },
      options: {
        model: "claude-sonnet-4-5",
        maxTurns: 20,
        allowedTools: ["Read", "Bash", "Skill"],
        settingSources: ["user", "project"],
      },
      verbose: true,
    });

    printTraceSummary(result);

    // ── Trajectory assertions ────────────────────────────
    console.log("\n[step 2] Trajectory assertions");
    expectSucceeded(assert, result);
    expectMemoryCaptured(assert, result);
    expectSkillCalled(assert, result, "memory-harvester");
    expectToolCalled(assert, result, "Bash", /harvest\.ts/);
    expectToolCalled(assert, result, "Read", /mem0-limitations\.md/);

    // ── Side-effect assertions ───────────────────────────
    console.log("\n[step 3] Side-effect assertions");
    const today = new Date().toISOString().slice(0, 10);
    const ledgerPath = `ledgers/harvest-runs/${today}.jsonl`;
    expectLedgerHasEntry(assert, ledgerPath, {
      memoryId: result.capturedMemoryId,
      status: "SUCCEEDED",
    });
    await expectMem0MemoryExists(assert, result.capturedMemoryId, MEM0_API_KEY!);

    // Verify the memory's stored content contains the discriminator (mem0 paraphrases
    // prose but preserves literal tokens — see limitations §6).
    if (result.capturedMemoryId) {
      const ledgerContent = existsSync(path.join(AGENT_ROOT, ledgerPath))
        ? readFileSync(path.join(AGENT_ROOT, ledgerPath), "utf-8")
        : "";
      assert(
        ledgerContent.includes(TEST_DISCRIMINATOR),
        "ledger preserves the literal discriminator from the test payload",
      );
    }

    // ── Output assertions ────────────────────────────────
    console.log("\n[step 4] Output assertions");
    expectOutputContains(assert, result, /[Hh]arvest/);
    expectOutputContains(assert, result, /SUCCEEDED|written|memor/i);
  } catch (e) {
    console.error("\n[test:error]", (e as Error).message);
    failed++;
  } finally {
    // ── Cleanup ──────────────────────────────────────────
    console.log("\n[step 5] Cleanup — delete every memory under test scope");
    const cleanup = await cleanupMem0Scope(
      { user_id: MEM0_USER_ID!, app_id: scope.app_id },
      MEM0_API_KEY!,
    );
    printCleanupSummary(scope.app_id, cleanup);
    if (cleanup.failed > 0) {
      console.warn(
        `  ⚠ cleanup left ${cleanup.failed} memory/memories — delete manually via mem0 dashboard if needed`,
      );
    }
  }

  // ── Summary ──────────────────────────────────────────────
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("[test:fatal]", e);
    process.exit(1);
  });
