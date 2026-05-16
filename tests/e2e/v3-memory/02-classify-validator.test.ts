/**
 * Test 02 — classify.ts schema validator (cheap, no API).
 *
 * Verifies the harvester's pre-write gate rejects malformed payloads and
 * accepts well-formed ones. This is the contract that protects mem0 from
 * bad writes — bugs here = silent data quality issues forever.
 *
 * Run: npx tsx tests/e2e/v3-memory/02-classify-validator.test.ts
 */

import {
  validateMemoryWrite,
  assertValid,
  type MemoryWrite,
} from "../../../.claude/skills/memory-harvester/references/classify.js";

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

function expectNoErrors(label: string, payload: unknown): void {
  const errs = validateMemoryWrite(payload);
  assert(
    errs.length === 0,
    label,
    errs.length ? errs.map((e) => `${e.field}: ${e.reason}`).join("; ") : undefined,
  );
}

function expectErrorOn(label: string, payload: unknown, field: string): void {
  const errs = validateMemoryWrite(payload);
  const hit = errs.find((e) => e.field === field);
  assert(
    Boolean(hit),
    label,
    hit ? undefined : `expected error on '${field}', got: ${JSON.stringify(errs)}`,
  );
}

// ── fixtures ─────────────────────────────────────────────────────

const VALID_EPISODIC: MemoryWrite = {
  text: "Run 2026-05-16-test-bundle (source: workspace/test-bundle/STEPS.json) — step 2 succeeded with vendor=claude, harness=plan-then-execute.",
  user_id: "test-agent-slug",
  agent_id: "executive",
  app_id: "test-bundle",
  run_id: "2026-05-16-test-bundle",
  metadata: {
    type: "episodic",
    category: "project",
    confidence: 1.0,
    importance: "medium",
    source: "workspace/test-bundle/STEPS.json",
    harvest_run: "2026-05-16-test-bundle-001",
  },
  immutable: false,
};

const VALID_PRINCIPLE: MemoryWrite = {
  text: "Constitution Article III: verifiers must check result.output_path, NOT process.cwd(). Source: workspace/constitution.md.",
  user_id: "test-agent-slug",
  agent_id: "executive",
  app_id: "_global",
  metadata: {
    type: "principle",
    category: "technical",
    confidence: 1.0,
    importance: "critical",
    source: "workspace/constitution.md",
    harvest_run: "2026-05-16-constitution-001",
  },
  immutable: true,
};

const VALID_REFLECTIVE: MemoryWrite = {
  text: "Pattern across postal-checkout + pageforge runs (retro: ai-docs/v2/2026-04-15-v2.1.7/retro-postal-checkout.md): verifiers ignoring output_path mark UI-broken builds as PASS.",
  user_id: "test-agent-slug",
  agent_id: "executive",
  app_id: "_global",
  metadata: {
    type: "reflective",
    category: "technical",
    confidence: 0.9,
    importance: "high",
    source: "ai-docs/v2/2026-04-15-v2.1.7/retro-postal-checkout.md",
    harvest_run: "2026-05-16-retro-001",
  },
  immutable: false,
};

// ── tests ────────────────────────────────────────────────────────

function main(): void {
  console.log("\n=== V3 Memory — classify.ts Schema Validator ===\n");

  // ── happy paths ──
  console.log("[1] Valid payloads accepted");
  expectNoErrors("episodic with run_id", VALID_EPISODIC);
  expectNoErrors("principle with immutable=true", VALID_PRINCIPLE);
  expectNoErrors("reflective without run_id", VALID_REFLECTIVE);

  // ── top-level field errors ──
  console.log("\n[2] Top-level field rejections");
  expectErrorOn("missing text", { ...VALID_EPISODIC, text: undefined }, "text");
  expectErrorOn("empty text", { ...VALID_EPISODIC, text: "  " }, "text");
  expectErrorOn("missing user_id", { ...VALID_EPISODIC, user_id: "" }, "user_id");
  expectErrorOn(
    "wrong agent_id (must be 'executive')",
    { ...VALID_EPISODIC, agent_id: "worker" as never },
    "agent_id",
  );
  expectErrorOn("missing app_id", { ...VALID_EPISODIC, app_id: "" }, "app_id");
  expectErrorOn(
    "immutable not boolean",
    { ...VALID_EPISODIC, immutable: "true" as never },
    "immutable",
  );

  // ── metadata errors ──
  console.log("\n[3] Metadata field rejections");
  expectErrorOn(
    "bogus type",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, type: "nonsense" as never } },
    "metadata.type",
  );
  expectErrorOn(
    "bogus category",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, category: "frontend" as never } },
    "metadata.category",
  );
  expectErrorOn(
    "bogus importance",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, importance: "blocking" as never } },
    "metadata.importance",
  );
  expectErrorOn(
    "confidence > 1",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, confidence: 1.5 } },
    "metadata.confidence",
  );
  expectErrorOn(
    "confidence < 0",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, confidence: -0.1 } },
    "metadata.confidence",
  );
  expectErrorOn(
    "missing source",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, source: "" } },
    "metadata.source",
  );
  expectErrorOn(
    "harvest_run not YYYY-MM-DD prefixed",
    {
      ...VALID_EPISODIC,
      metadata: { ...VALID_EPISODIC.metadata, harvest_run: "run-123" },
    },
    "metadata.harvest_run",
  );

  // ── conditional rules ──
  console.log("\n[4] Conditional rules");
  expectErrorOn(
    "episodic without run_id",
    { ...VALID_EPISODIC, run_id: undefined },
    "run_id",
  );
  expectErrorOn(
    "episodic with non-date run_id",
    { ...VALID_EPISODIC, run_id: "some-string" },
    "run_id",
  );
  expectErrorOn(
    "principle with immutable=false",
    { ...VALID_PRINCIPLE, immutable: false },
    "immutable",
  );

  // ── assertValid throws ──
  console.log("\n[5] assertValid throws on bad payload");
  let threw = false;
  try {
    assertValid({ text: "x" });
  } catch (e) {
    threw = (e as Error).message.includes("schema validation failed");
  }
  assert(threw, "assertValid throws labeled error on malformed input");

  // ── assertValid passes valid payload ──
  let didNotThrow = false;
  try {
    assertValid(VALID_EPISODIC);
    didNotThrow = true;
  } catch {
    didNotThrow = false;
  }
  assert(didNotThrow, "assertValid does NOT throw on valid input");

  // ── Summary ──
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
