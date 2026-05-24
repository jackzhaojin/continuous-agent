/**
 * Test 06 — unified mem0 CLI LIVE (real mem0 API + cleanup).
 *
 * Proves the deterministic CLI the executive drives agentically:
 *   1. `mem0 add`  — validate → client.add() → poll SUCCEEDED → ledger → memoryId
 *   2. `mem0 get`  — fetch that memory by id (deterministic, immediate)
 *   3. `mem0 search` — returns the seeded memory under its scope, proving the
 *      baked-in filter shape actually matches (the empty-results trap, §4b).
 *   4. cleanup — delete the test scope.
 *
 * Isolated via V3_MEM0_ENV=test + a unique lowercase app_id. Cost: 1 mem0 write,
 * deleted in finally{}.
 *
 * Run: npx tsx tests/e2e/v3-memory/06-mem0-cli-live.test.ts
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { cleanupMem0Scope, printCleanupSummary } from "../../agentic-harness/cleanup.js";

const AGENT_ROOT = path.resolve(import.meta.dirname, "../../..");
loadEnv({ path: path.join(AGENT_ROOT, ".env.executive") });

const MEM0_API_KEY = process.env.V3_MEM0_API_KEY;
const MEM0_USER_ID = process.env.V3_MEM0_USER_ID;
if (!MEM0_API_KEY || !MEM0_USER_ID) {
  console.error("[test:skipped] Missing V3_MEM0_API_KEY or V3_MEM0_USER_ID in .env.executive.");
  process.exit(2);
}

const CLI = path.join(AGENT_ROOT, ".claude/skills/memory-harvester/references/mem0-cli.ts");

const PASS = "✓", FAIL = "✗";
let passed = 0, failed = 0;
function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) { console.log(`  ${PASS} ${label}`); passed++; }
  else { console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`); failed++; }
}

/** Run the CLI as a subprocess. V3_MEM0_ENV=test isolates writes. */
function cli(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", CLI, ...args], {
      encoding: "utf-8",
      env: { ...process.env, V3_MEM0_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<number> {
  const nonce = Math.random().toString(36).slice(2, 8);
  const today = new Date().toISOString().slice(0, 10);
  const appId = `v3-cli-test-${nonce}`;
  const runId = `${today}-cli-test-${nonce}`;
  const discriminator = `CLI-TEST-CANARY-${nonce}`;

  console.log("\n=== V3 Memory — unified mem0 CLI LIVE ===\n");
  console.log(`  app_id: ${appId}  run_id: ${runId}  canary: ${discriminator}`);

  let memoryId: string | undefined;

  try {
    // ── 1. add ────────────────────────────────────────────────
    console.log("\n[1] mem0 add (validate → add → poll → ledger)");
    const payload = JSON.stringify({
      text: `mem0 CLI live test memory ${discriminator} — verifies the agentic CLI write path`,
      app_id: appId,
      run_id: runId,
      metadata: {
        type: "episodic",
        category: "project",
        importance: "low",
        confidence: 1,
        trigger: "manual-harvest",
        source: "tests/e2e/v3-memory/06-mem0-cli-live.test.ts",
      },
    });
    const add = cli(["add", "--payload", payload]);
    assert(add.code === 0, "add exits 0", add.out.slice(0, 300));
    let addSummary: { ok?: boolean; results?: Array<{ memoryId?: string; status?: string }> } = {};
    try { addSummary = JSON.parse(add.out); } catch { /* leave empty */ }
    memoryId = addSummary.results?.[0]?.memoryId;
    assert(addSummary.ok === true && !!memoryId,
      "add reports ok + a memoryId", JSON.stringify(addSummary).slice(0, 200));

    // ── 2. get ────────────────────────────────────────────────
    console.log("\n[2] mem0 get --id (deterministic read-back)");
    if (memoryId) {
      const got = cli(["get", "--id", memoryId]);
      assert(got.code === 0 && got.out.includes(discriminator),
        "get returns the memory with its literal discriminator");
    } else {
      assert(false, "get skipped — no memoryId from add");
    }

    // ── 3. search (filter-wrap proof; retry for indexing lag) ──
    console.log("\n[3] mem0 search — proves filter-wrapping returns the seeded memory");
    let found = false;
    let lastOut = "";
    for (let attempt = 1; attempt <= 12 && !found; attempt++) {
      const s = cli(["search", "--query", discriminator, "--app-id", appId, "--top-k", "10", "--json"]);
      lastOut = s.out;
      try {
        const parsed = JSON.parse(s.out) as { results?: Array<{ memory?: string; id?: string }> };
        found = (parsed.results ?? []).some(
          (m) => (m.memory ?? "").includes(discriminator) || m.id === memoryId,
        );
      } catch { /* not yet */ }
      if (!found) { process.stdout.write(`    …indexing (attempt ${attempt}/12)\n`); await sleep(5000); }
    }
    assert(found, "search surfaces the seeded memory under its scope (filter-wrap works)",
      lastOut.slice(0, 200));
  } catch (e) {
    console.error("\n[test:error]", (e as Error).message);
    failed++;
  } finally {
    // ── 4. cleanup ────────────────────────────────────────────
    console.log("\n[4] Cleanup");
    const cleanup = await cleanupMem0Scope({ user_id: MEM0_USER_ID!, app_id: appId }, MEM0_API_KEY!);
    printCleanupSummary(appId, cleanup);
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  return failed === 0 ? 0 : 1;
}

main().then(c => process.exit(c)).catch(e => { console.error("[test:fatal]", e); process.exit(1); });
