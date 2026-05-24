/**
 * Test 05 — run-hook gating + worker memory-pack injection (CHEAP, no API).
 *
 * The single most important safety property of the staged rollout: with the
 * flags OFF (the shipped default), every memory hook MUST no-op without making
 * any API call. Plus the worker-side invariants: the CLAUDE.md template carries
 * the Memory Pack placeholder, and mem0 credentials are tier-1 (never reach a
 * worker env).
 *
 * No Claude or mem0 calls — runMemoryHook short-circuits before query() when a
 * flag is off. Safe to run in CI without keys.
 *
 * Run: npx tsx tests/e2e/v3-memory/05-run-hook-gating-and-injection.test.ts
 */

import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { runMemoryHook } from "../../../src/agentic/memory/run-hook.js";
import type { HookName } from "../../../src/agentic/memory/types.js";
import { checkWorkerEnvForLeaks } from "../../../src/deterministic/credential-tiers.js";

const AGENT_ROOT = path.resolve(import.meta.dirname, "../../..");

const PASS = "✓";
const FAIL = "✗";
let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) { console.log(`  ${PASS} ${label}`); passed++; }
  else { console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`); failed++; }
}

const ALL_HOOKS: HookName[] = [
  "pre-work-selection",
  "pre-spawn-pack",
  "post-run-harvest",
  "failure-diagnosis",
  "post-retro-harvest",
];

const HOOK_FLAGS = [
  "V3_MEM_HOOK_PRE_WORK",
  "V3_MEM_HOOK_PRE_SPAWN",
  "V3_MEM_HOOK_POST_RUN",
  "V3_MEM_HOOK_FAIL_DIAG",
  "V3_MEM_HOOK_POST_RETRO",
];

function clearMemoryEnv(): void {
  delete process.env.V3_MEMORY_ENABLED;
  for (const f of HOOK_FLAGS) delete process.env[f];
}

async function main(): Promise<number> {
  console.log("\n=== V3 Memory — run-hook gating + injection (cheap) ===\n");

  // ── 1. Master OFF → every hook no-ops ────────────────────────
  console.log("[1] Master switch OFF → all hooks no-op (no API call)");
  clearMemoryEnv();
  for (const h of ALL_HOOKS) {
    const r = await runMemoryHook(h, { note: "should not run" });
    assert(r.ran === false && r.skipped === true, `${h} no-ops when V3_MEMORY_ENABLED unset`,
      JSON.stringify(r));
  }

  // ── 2. Master ON but per-hook flags OFF → still no-op ─────────
  console.log("\n[2] Master ON, per-hook flags OFF → still no-op");
  clearMemoryEnv();
  process.env.V3_MEMORY_ENABLED = "true";
  for (const h of ALL_HOOKS) {
    const r = await runMemoryHook(h, { note: "should not run" });
    assert(r.ran === false && r.skipped === true,
      `${h} no-ops when its flag is off (master on)`, JSON.stringify(r));
  }
  clearMemoryEnv();

  // ── 3. CLAUDE.md template carries the Memory Pack placeholder ─
  console.log("\n[3] Worker CLAUDE.md template has the Memory Pack placeholder");
  const tmplPath = path.join(AGENT_ROOT, "claude-files-to-output/templates/ai-sandbox-claude-md.md");
  const tmpl = existsSync(tmplPath) ? readFileSync(tmplPath, "utf-8") : "";
  assert(tmpl.includes("{{MEMORY_PACK_SECTION}}"),
    "template contains {{MEMORY_PACK_SECTION}}");

  // ── 4. mem0 creds are tier-1 → caught if they ever leak to worker env ─
  console.log("\n[4] mem0 credentials are tier-1 (never reach workers)");
  const tmp = mkdtempSync(path.join(tmpdir(), "v3mem-leak-"));
  const fakeWorkerEnv = path.join(tmp, ".env");
  writeFileSync(fakeWorkerEnv,
    "CLAUDE_CODE_OAUTH_TOKEN=sk-test\nV3_MEM0_API_KEY=m0-should-not-be-here\nV3_MEM0_USER_ID=irin.julg\n");
  const leak = checkWorkerEnvForLeaks(fakeWorkerEnv);
  assert(!leak.clean, "leak guard flags a worker env containing V3_MEM0_* keys");
  assert(leak.leaks.some(l => l.key === "V3_MEM0_API_KEY"),
    "V3_MEM0_API_KEY specifically flagged as executive-tier");

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  return failed === 0 ? 0 : 1;
}

main().then(c => process.exit(c)).catch(e => { console.error("[test:fatal]", e); process.exit(1); });
