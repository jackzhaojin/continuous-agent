/**
 * Test 01 — skill loadability (cheap, no API).
 *
 * Every V3.0 memory skill must:
 *   1. Be discoverable by loadSkillPrompt()
 *   2. Render its placeholders cleanly (no {{ left after substitution)
 *   3. Contain a Read-the-limitations-doc instruction (the operational pillar)
 *   4. Reference the right downstream skill (reader / harvester) where applicable
 *
 * Zero API cost. Pure file + render checks.
 *
 * Run: npx tsx tests/e2e/v3-memory/01-skill-loadability.test.ts
 */

import { loadSkillPrompt } from "../../../src/agentic/intelligence/skill-prompt-loader.js";
import { existsSync } from "node:fs";
import path from "node:path";

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

const AGENT_ROOT = path.resolve(import.meta.dirname, "../../..");
const SKILLS_DIR = path.join(AGENT_ROOT, ".claude", "skills");

const ALL_MEMORY_SKILLS = [
  "memory-reader",
  "memory-harvester",
  "memory-snapshot",
  "memory-hook-pre-work-selection",
  "memory-hook-pre-spawn-pack",
  "memory-hook-post-run-harvest",
  "memory-hook-failure-diagnosis",
  "memory-hook-post-retro-harvest",
];

const HOOK_SKILLS_USING_CONTEXT_JSON = [
  "memory-hook-pre-work-selection",
  "memory-hook-pre-spawn-pack",
  "memory-hook-post-run-harvest",
  "memory-hook-failure-diagnosis",
  "memory-hook-post-retro-harvest",
];

const HOOK_SKILL_DOWNSTREAM = {
  "memory-hook-pre-work-selection": "memory-reader",
  "memory-hook-pre-spawn-pack": "memory-reader",
  "memory-hook-post-run-harvest": "memory-harvester",
  "memory-hook-failure-diagnosis": "memory-reader",
  "memory-hook-post-retro-harvest": "memory-harvester",
} as const;

async function main(): Promise<void> {
  console.log("\n=== V3 Memory — Skill Loadability ===\n");

  // ── 1. All skill directories exist ──────────────────────────
  console.log("[1] All memory skill directories exist");
  for (const skill of ALL_MEMORY_SKILLS) {
    const skillPath = path.join(SKILLS_DIR, skill, "SKILL.md");
    assert(existsSync(skillPath), `${skill}/SKILL.md present`);
  }

  // ── 2. Each skill renders without {{ leftover ───────────────
  console.log("\n[2] Skills render cleanly via loadSkillPrompt");
  for (const skill of ALL_MEMORY_SKILLS) {
    const vars = HOOK_SKILLS_USING_CONTEXT_JSON.includes(skill)
      ? { CONTEXT_JSON: JSON.stringify({ test: true }) }
      : {};
    try {
      const prompt = await loadSkillPrompt(skill, vars);
      assert(
        prompt.length > 200,
        `${skill}: prompt has reasonable length`,
        `actual: ${prompt.length} chars`,
      );
      assert(
        !prompt.match(/\{\{[A-Z_][A-Z_0-9]*\}\}/),
        `${skill}: no leftover {{PLACEHOLDER}} after render`,
      );
    } catch (e) {
      assert(false, `${skill}: loaded without error`, (e as Error).message);
    }
  }

  // ── 3. Each skill includes the limitations-doc instruction ──
  console.log("\n[3] Skills reference the mem0-limitations.md doc");
  for (const skill of ALL_MEMORY_SKILLS) {
    const vars = HOOK_SKILLS_USING_CONTEXT_JSON.includes(skill)
      ? { CONTEXT_JSON: "{}" }
      : {};
    const prompt = await loadSkillPrompt(skill, vars);
    assert(
      prompt.includes("mem0-limitations.md"),
      `${skill}: references mem0-limitations.md`,
    );
  }

  // ── 4. Hook wrappers reference the right downstream skill ───
  console.log("\n[4] Hook wrappers point to the right downstream skill");
  for (const [hook, downstream] of Object.entries(HOOK_SKILL_DOWNSTREAM)) {
    const prompt = await loadSkillPrompt(hook, { CONTEXT_JSON: "{}" });
    assert(
      prompt.includes(downstream),
      `${hook} → invokes ${downstream}`,
    );
  }

  // ── 5. CONTEXT_JSON placeholder is actually substituted ─────
  console.log("\n[5] CONTEXT_JSON placeholder substitutes correctly");
  const sentinel = `__TEST_SENTINEL_${Date.now()}__`;
  for (const hook of HOOK_SKILLS_USING_CONTEXT_JSON) {
    const prompt = await loadSkillPrompt(hook, {
      CONTEXT_JSON: JSON.stringify({ marker: sentinel }),
    });
    assert(
      prompt.includes(sentinel),
      `${hook}: sentinel value reached final prompt`,
    );
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[test:fatal]", e);
  process.exit(1);
});
