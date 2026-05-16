/**
 * Test 02 — classify.ts schema validator (cheap, no API).
 *
 * Verifies the harvester's pre-write gate rejects malformed payloads and
 * accepts well-formed ones. This is the contract that protects mem0 from
 * bad writes — bugs here = silent data quality issues forever.
 *
 * Fixtures match taxonomy v1.0.0 (see `.claude/skills/memory-harvester/references/taxonomy.md`).
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

// ── fixtures (taxonomy v1.0.0) ──────────────────────────────────

const VALID_EPISODIC: MemoryWrite = {
  text: "Run 2026-05-16-test-bundle (source: workspace/test-bundle/STEPS.json) — step 2 succeeded with vendor=claude, harness=plan-then-execute.",
  user_id: "test-agent-slug",
  agent_id: "executive",
  app_id: "test-bundle",
  run_id: "2026-05-16-test-bundle",
  metadata: {
    schema_version: "1.0.0",
    env: "prod",
    type: "episodic",
    category: "project",
    confidence: 1.0,
    importance: "medium",
    trigger: "post-run",
    actor: "worker",
    worker_vendor: "claude",
    source: "workspace/test-bundle/STEPS.json",
    harvest_run: "2026-05-16-test-bundle",
    outcome: "success",
    tags: ["clean-run", "no-retries"],
  },
  immutable: false,
};

const VALID_PRINCIPLE: MemoryWrite = {
  text: "Constitution Article III: verifiers must check result.output_path, NOT process.cwd(). Source: workspace/constitution.md.",
  user_id: "test-agent-slug",
  agent_id: "executive",
  app_id: "_global",
  run_id: "2026-05-16-spec-constitution",
  metadata: {
    schema_version: "1.0.0",
    env: "prod",
    type: "principle",
    category: "technical",
    confidence: 1.0,
    importance: "critical",
    trigger: "spec-merge",
    actor: "human",
    source: "workspace/constitution.md",
    harvest_run: "2026-05-16-spec-constitution",
  },
  immutable: true,
};

const VALID_REFLECTIVE: MemoryWrite = {
  text: "Pattern across postal-checkout + pageforge runs (retro: ai-docs/v2/2026-04-15-v2.1.7/retro-postal-checkout.md): verifiers ignoring output_path mark UI-broken builds as PASS.",
  user_id: "test-agent-slug",
  agent_id: "executive",
  app_id: "_global",
  run_id: "2026-05-16-retro-postal-checkout",
  metadata: {
    schema_version: "1.0.0",
    env: "prod",
    type: "reflective",
    category: "technical",
    confidence: 0.9,
    importance: "high",
    trigger: "post-retro",
    actor: "human",
    source: "ai-docs/v2/2026-04-15-v2.1.7/retro-postal-checkout.md",
    harvest_run: "2026-05-16-retro-postal-checkout",
    tags: ["EAI_AGAIN", "retry-strategy", "kimi-cli"],
  },
  immutable: false,
};

// ── tests ────────────────────────────────────────────────────────

function main(): void {
  console.log("\n=== V3 Memory — classify.ts Schema Validator (taxonomy v1.0.0) ===\n");

  // ── happy paths ──
  console.log("[1] Valid payloads accepted");
  expectNoErrors("episodic post-run (actor=worker + worker_vendor)", VALID_EPISODIC);
  expectNoErrors("principle spec-merge (immutable=true)", VALID_PRINCIPLE);
  expectNoErrors("reflective post-retro (no worker_vendor)", VALID_REFLECTIVE);

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
    "bundle app_id with leading underscore",
    { ...VALID_EPISODIC, app_id: "_my-bundle" },
    "app_id",
  );
  expectErrorOn(
    "reserved app_id malformed",
    { ...VALID_EPISODIC, app_id: "_" },
    "app_id",
  );
  expectErrorOn(
    "immutable not boolean",
    { ...VALID_EPISODIC, immutable: "true" as never },
    "immutable",
  );

  // ── metadata enum & range errors ──
  console.log("\n[3] Metadata enum / range rejections");
  expectErrorOn(
    "missing schema_version",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, schema_version: "" } },
    "metadata.schema_version",
  );
  expectErrorOn(
    "bogus env",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, env: "staging" as never } },
    "metadata.env",
  );
  expectErrorOn(
    "empty cohort",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, cohort: "  " } },
    "metadata.cohort",
  );
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
    "bogus trigger",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, trigger: "deploy" as never } },
    "metadata.trigger",
  );
  expectErrorOn(
    "bogus actor",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, actor: "robot" as never } },
    "metadata.actor",
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
  console.log("\n[4] Cross-field conditional rules");
  expectErrorOn(
    "run_id missing entirely",
    { ...VALID_EPISODIC, run_id: undefined },
    "run_id",
  );
  expectErrorOn(
    "run_id with non-ISO prefix",
    { ...VALID_EPISODIC, run_id: "some-string" },
    "run_id",
  );
  expectErrorOn(
    "principle with immutable=false",
    { ...VALID_PRINCIPLE, immutable: false },
    "immutable",
  );
  expectErrorOn(
    "actor=worker without worker_vendor",
    {
      ...VALID_EPISODIC,
      metadata: { ...VALID_EPISODIC.metadata, worker_vendor: undefined },
    },
    "metadata.worker_vendor",
  );
  expectErrorOn(
    "worker_vendor set with actor=executive (contradiction)",
    {
      ...VALID_REFLECTIVE,
      metadata: { ...VALID_REFLECTIVE.metadata, actor: "executive", worker_vendor: "claude" },
    },
    "metadata.worker_vendor",
  );
  expectErrorOn(
    "harvest_run mismatch with run_id",
    {
      ...VALID_EPISODIC,
      metadata: { ...VALID_EPISODIC.metadata, harvest_run: "2026-05-16-different-slug" },
    },
    "metadata.harvest_run",
  );
  expectErrorOn(
    "bogus worker_vendor",
    {
      ...VALID_EPISODIC,
      metadata: { ...VALID_EPISODIC.metadata, worker_vendor: "openai" as never },
    },
    "metadata.worker_vendor",
  );

  // ── optional fields validated when set ──
  console.log("\n[5] Optional retrieval aids");
  expectErrorOn(
    "bogus outcome",
    { ...VALID_EPISODIC, metadata: { ...VALID_EPISODIC.metadata, outcome: "kind-of" as never } },
    "metadata.outcome",
  );
  expectErrorOn(
    "tags > 8",
    {
      ...VALID_EPISODIC,
      metadata: {
        ...VALID_EPISODIC.metadata,
        tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      },
    },
    "metadata.tags",
  );
  expectErrorOn(
    "tag with space",
    {
      ...VALID_EPISODIC,
      metadata: { ...VALID_EPISODIC.metadata, tags: ["has space"] },
    },
    "metadata.tags[0]",
  );
  expectNoErrors("tag with underscore (SCREAMING_SNAKE allowed)", {
    ...VALID_EPISODIC,
    metadata: { ...VALID_EPISODIC.metadata, tags: ["EAI_AGAIN", "kimi-cli"] },
  });
  expectErrorOn(
    "expires_at malformed",
    {
      ...VALID_EPISODIC,
      metadata: { ...VALID_EPISODIC.metadata, expires_at: "tomorrow" },
    },
    "metadata.expires_at",
  );
  expectNoErrors("expires_at well-formed ISO", {
    ...VALID_EPISODIC,
    metadata: { ...VALID_EPISODIC.metadata, expires_at: "2026-12-31T23:59:59Z" },
  });

  // ── assertValid throws ──
  console.log("\n[6] assertValid throws on bad payload");
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
