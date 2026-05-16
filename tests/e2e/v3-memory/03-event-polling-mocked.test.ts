/**
 * Test 03 — pollEventTerminal helper, mocked fetch (cheap, no API).
 *
 * Verifies:
 *   - PENDING → RUNNING → SUCCEEDED transitions return SUCCEEDED
 *   - RUNNING is NOT treated as terminal (the bug we hit in the POC)
 *   - FAILED and CANCELLED are terminal
 *   - TIMEOUT path returns when the maxMs budget expires
 *   - Auth header uses `Authorization: Token <key>`, NOT Bearer
 *
 * Run: npx tsx tests/e2e/v3-memory/03-event-polling-mocked.test.ts
 */

import {
  pollEventTerminal,
} from "../../../.claude/skills/memory-harvester/references/event-polling.js";

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

// ── fetch mock harness ─────────────────────────────────────────

interface MockCall {
  url: string;
  authHeader?: string;
}

function installFetchMock(
  statusSequence: string[],
  finalBody?: Record<string, unknown>,
): { calls: MockCall[]; restore: () => void } {
  const calls: MockCall[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const authHeader = init?.headers
      ? (init.headers as Record<string, string>).Authorization
      : undefined;
    calls.push({ url, authHeader });

    const status = statusSequence[Math.min(i, statusSequence.length - 1)];
    i++;
    const body = {
      id: "evt_mock",
      status,
      ...(status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED"
        ? finalBody ?? { results: [{ id: "mem_mock_id" }], latency: 4321 }
        : {}),
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function main(): Promise<void> {
  console.log("\n=== V3 Memory — pollEventTerminal Helper ===\n");

  // ── 1. PENDING → RUNNING → SUCCEEDED ──────────────────
  console.log("[1] PENDING → RUNNING → SUCCEEDED returns SUCCEEDED");
  {
    const { calls, restore } = installFetchMock(["PENDING", "RUNNING", "SUCCEEDED"]);
    try {
      const result = await pollEventTerminal("evt_test_1", "tk_mock", {
        maxMs: 5_000,
        intervalMs: 50,
      });
      assert(result.status === "SUCCEEDED", `final status SUCCEEDED (got ${result.status})`);
      assert(calls.length >= 3, `polled at least 3 times (got ${calls.length})`);
      assert(
        Boolean(result.body?.results?.[0]?.id),
        "captured memory_id from terminal body",
      );
      assert(
        result.ms > 0 && result.ms < 5_000,
        `ms within budget (got ${result.ms})`,
      );
    } finally {
      restore();
    }
  }

  // ── 2. RUNNING alone is NOT terminal ──────────────────
  console.log("\n[2] RUNNING is intermediate, not terminal");
  {
    const { restore } = installFetchMock(["RUNNING"]);
    try {
      const result = await pollEventTerminal("evt_test_2", "tk_mock", {
        maxMs: 800,
        intervalMs: 100,
      });
      assert(
        result.status === "TIMEOUT",
        `TIMEOUT when stuck on RUNNING (got ${result.status})`,
      );
    } finally {
      restore();
    }
  }

  // ── 3. FAILED is terminal ─────────────────────────────
  console.log("\n[3] FAILED is terminal");
  {
    const { restore } = installFetchMock(["PENDING", "FAILED"]);
    try {
      const result = await pollEventTerminal("evt_test_3", "tk_mock", {
        maxMs: 5_000,
        intervalMs: 50,
      });
      assert(result.status === "FAILED", `terminal FAILED (got ${result.status})`);
    } finally {
      restore();
    }
  }

  // ── 4. CANCELLED is terminal ──────────────────────────
  console.log("\n[4] CANCELLED is terminal");
  {
    const { restore } = installFetchMock(["CANCELLED"]);
    try {
      const result = await pollEventTerminal("evt_test_4", "tk_mock", {
        maxMs: 5_000,
        intervalMs: 50,
      });
      assert(result.status === "CANCELLED", `terminal CANCELLED (got ${result.status})`);
    } finally {
      restore();
    }
  }

  // ── 5. Auth header uses `Token <key>` (NOT Bearer) ────
  console.log("\n[5] Authorization header uses Token scheme (not Bearer)");
  {
    const { calls, restore } = installFetchMock(["SUCCEEDED"]);
    try {
      await pollEventTerminal("evt_test_5", "tk_specific_key", {
        maxMs: 5_000,
        intervalMs: 50,
      });
      assert(
        calls[0]?.authHeader === "Token tk_specific_key",
        "uses `Authorization: Token <key>`",
        `actual: "${calls[0]?.authHeader}"`,
      );
      assert(
        !calls[0]?.authHeader?.startsWith("Bearer"),
        "does NOT use Bearer scheme",
      );
    } finally {
      restore();
    }
  }

  // ── 6. Hits the correct URL ───────────────────────────
  console.log("\n[6] Hits /v1/event/{eventId}/ endpoint");
  {
    const { calls, restore } = installFetchMock(["SUCCEEDED"]);
    try {
      await pollEventTerminal("evt_known_id_xyz", "tk_mock", {
        maxMs: 5_000,
        intervalMs: 50,
      });
      assert(
        calls[0]?.url === "https://api.mem0.ai/v1/event/evt_known_id_xyz/",
        "correct event URL with eventId interpolated",
        `actual: ${calls[0]?.url}`,
      );
    } finally {
      restore();
    }
  }

  // ── Summary ───────────────────────────────────────────
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[test:fatal]", e);
  process.exit(1);
});
