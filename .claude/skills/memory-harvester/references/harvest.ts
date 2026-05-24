/**
 * Harvester driver — invoked by the memory-harvester skill via Bash.
 *
 * NOTE (V3.0 unification): the canonical write surface is now the unified CLI
 *   `mem0-cli.ts add --payload …` (same behavior, one entrypoint for read+write).
 * This file remains as a still-working alias so existing references keep passing;
 * prefer `mem0-cli.ts add` in new SKILL.md instructions.
 *
 *   npx tsx .claude/skills/memory-harvester/references/harvest.ts \
 *     --payload '<json MemoryWrite>'
 *
 *   npx tsx .claude/skills/memory-harvester/references/harvest.ts \
 *     --batch '<json MemoryWrite[]>'
 *
 * Pure mechanical glue:
 *   1. Parse + validate against the schema (classify.ts).
 *   2. Call mem0 client.add() with the camelCase top-level shape.
 *   3. Block on pollEventTerminal(eventId) until SUCCEEDED.
 *   4. Append a JSONL record to ledgers/harvest-runs/{date}.jsonl for traceability.
 *   5. Emit a JSON summary to stdout the SKILL can read.
 *
 * No prompts here. No intelligence here. The harvester SKILL.md is where the
 * agentic decisions live.
 */

import MemoryClient from "mem0ai";
import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

import { pollEventTerminal, type EventStatusBody } from "./event-polling.js";
import { assertValid, type MemoryWrite } from "./classify.js";
import { applyDefaults, type PartialMemoryWrite } from "./defaults.js";

// ---------- env ----------

const __dirname = dirname(fileURLToPath(import.meta.url));
// .claude/skills/memory-harvester/references/ → repo root is 4 levels up
const repoRoot = resolve(__dirname, "../../../..");

loadEnv({ path: join(repoRoot, ".env.executive") });

const API_KEY = process.env.V3_MEM0_API_KEY;
const USER_ID = process.env.V3_MEM0_USER_ID;
const MEMORY_ENABLED = (process.env.V3_MEMORY_ENABLED ?? "true").toLowerCase() !== "false";

if (!MEMORY_ENABLED) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: "V3_MEMORY_ENABLED=false" }));
  process.exit(0);
}

if (!API_KEY || !USER_ID) {
  console.error(
    "[fatal] Missing V3_MEM0_API_KEY or V3_MEM0_USER_ID in .env.executive at repo root.",
  );
  process.exit(1);
}

// ---------- arg parsing ----------

interface ParsedArgs {
  mode: "single" | "batch";
  payload: MemoryWrite | MemoryWrite[];
}

// Applies defaults then validates. Callers (the agentic harvester skill) hand
// us partial payloads — defaults.ts stamps env/schema_version/actor/harvest_run
// from env vars + sensible defaults, then classify.ts asserts the full shape.
function stampAndValidate(parsed: unknown, label: string): MemoryWrite {
  let stamped: unknown;
  try {
    stamped = applyDefaults(parsed as PartialMemoryWrite);
  } catch (e) {
    console.error(`[fatal] ${label} defaults stamping failed: ${(e as Error).message}`);
    process.exit(1);
  }
  try {
    assertValid(stamped);
  } catch (e) {
    console.error(`[fatal] ${label} failed validation:\n${(e as Error).message}`);
    process.exit(1);
  }
  return stamped as MemoryWrite;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const idx = args.findIndex((a) => a === "--payload" || a === "--batch");
  if (idx === -1 || !args[idx + 1]) {
    console.error("[fatal] Usage: harvest.ts --payload <json> | --batch <json>");
    process.exit(1);
  }
  const flag = args[idx];
  const raw = args[idx + 1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`[fatal] Could not parse JSON payload: ${(e as Error).message}`);
    process.exit(1);
  }

  if (flag === "--batch") {
    if (!Array.isArray(parsed)) {
      console.error("[fatal] --batch expects a JSON array of MemoryWrite objects");
      process.exit(1);
    }
    const stamped = parsed.map((p, i) => stampAndValidate(p, `Item ${i}`));
    return { mode: "batch", payload: stamped };
  }

  const stamped = stampAndValidate(parsed, "Payload");
  return { mode: "single", payload: stamped };
}

// ---------- ledger ----------

function appendLedger(record: Record<string, unknown>) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(repoRoot, "ledgers", "harvest-runs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${date}.jsonl`);
  appendFileSync(file, JSON.stringify(record) + "\n");
}

// ---------- write one memory ----------

interface WriteResult {
  ok: boolean;
  payload: MemoryWrite;
  eventId?: string;
  status: string;
  ms: number;
  memoryId?: string;
  body?: EventStatusBody;
  error?: string;
}

async function writeOne(client: MemoryClient, p: MemoryWrite): Promise<WriteResult> {
  const t0 = Date.now();
  try {
    const messages = [{ role: "user" as const, content: p.text }];

    // camelCase top-level options (mem0 SDK v3 — see mem0-limitations.md §5)
    const opts: Record<string, unknown> = {
      userId: p.user_id,
      agentId: p.agent_id,
      appId: p.app_id,
      metadata: {
        ...p.metadata,
        immutable: p.immutable,
      },
    };
    if (p.run_id) opts.runId = p.run_id;

    const addResponse = (await client.add(messages, opts)) as unknown as
      | { eventId?: string; event_id?: string; status?: string }
      | Array<{ eventId?: string; event_id?: string; status?: string }>;

    const first = Array.isArray(addResponse) ? addResponse[0] : addResponse;
    const eventId = first?.eventId ?? first?.event_id;

    if (!eventId) {
      throw new Error(
        `mem0 add() returned no eventId. Raw: ${JSON.stringify(addResponse).slice(0, 200)}`,
      );
    }

    const poll = await pollEventTerminal(eventId, API_KEY!);
    const memoryId = poll.body?.results?.[0]?.id;

    const result: WriteResult = {
      ok: poll.status === "SUCCEEDED",
      payload: p,
      eventId,
      status: poll.status,
      ms: Date.now() - t0,
      memoryId,
      body: poll.body,
    };

    appendLedger({
      ts: new Date().toISOString(),
      ...result,
    });

    return result;
  } catch (e) {
    const err = e as Error;
    const result: WriteResult = {
      ok: false,
      payload: p,
      status: "ERROR",
      ms: Date.now() - t0,
      error: err.message,
    };
    appendLedger({ ts: new Date().toISOString(), ...result });
    return result;
  }
}

// ---------- main ----------

async function main() {
  const { mode, payload } = parseArgs();
  const items = mode === "batch" ? (payload as MemoryWrite[]) : [payload as MemoryWrite];
  const client = new MemoryClient({ apiKey: API_KEY! });

  const results: WriteResult[] = [];
  for (const item of items) {
    results.push(await writeOne(client, item));
  }

  const summary = {
    ok: results.every((r) => r.ok),
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results: results.map((r) => ({
      ok: r.ok,
      memoryId: r.memoryId,
      eventId: r.eventId,
      status: r.status,
      ms: r.ms,
      error: r.error,
      type: r.payload.metadata.type,
      app_id: r.payload.app_id,
      source: r.payload.metadata.source,
      harvest_run: r.payload.metadata.harvest_run,
    })),
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((e) => {
  console.error("[harvest.ts:fatal]", (e as Error).message);
  process.exit(1);
});
