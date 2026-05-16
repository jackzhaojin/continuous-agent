/**
 * Daily snapshot driver — invoked by the memory-snapshot skill via Bash, or
 * directly by a PM2 cron entry.
 *
 *   npx tsx .claude/skills/memory-snapshot/references/snapshot.ts
 *
 * Pure mechanical glue:
 *   1. Paginate client.search(...) under filters: { user_id } (getAll is broken).
 *   2. For each memory, capture client.history(memory_id).
 *   3. Write JSON to ai-docs/v3/mem0-snapshots/{YYYY-MM-DD}.json.
 *   4. Emit a summary to stdout.
 *
 * No prompts. No agentic decisions. Pure plumbing.
 */

import MemoryClient from "mem0ai";
import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

// ---------- env ----------

const __dirname = dirname(fileURLToPath(import.meta.url));
// .claude/skills/memory-snapshot/references/ → repo root is 4 levels up
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

// ---------- enumeration via paginated search ----------

// Broad sweep queries — different angles to maximize recall. Mem0 ranks by
// semantic similarity, so a single query truncated at topK might miss memories
// whose text doesn't match the query at all. We sweep with several broad
// queries and dedupe by memory_id.
const SWEEP_QUERIES = [
  "memory",
  "principle goal run outcome",
  "retro lesson decision",
  "skill capability harness",
  "vendor worker executive",
];

interface RawMemory {
  id?: string;
  memory?: string;
  user_id?: string;
  app_id?: string;
  agent_id?: string;
  run_id?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  immutable?: boolean;
  created_at?: string;
  updated_at?: string;
  score?: number;
  [k: string]: unknown;
}

async function sweep(client: MemoryClient): Promise<Map<string, RawMemory>> {
  const byId = new Map<string, RawMemory>();
  const TOP_K = 100;

  for (const query of SWEEP_QUERIES) {
    let page = 1;
    let totalReturned = 0;
    while (true) {
      const opts: Record<string, unknown> = {
        filters: { user_id: USER_ID! },
        topK: TOP_K,
        page,
      };
      let results: RawMemory[] = [];
      try {
        const res = (await client.search(query, opts)) as unknown as RawMemory[] | { results?: RawMemory[] };
        results = Array.isArray(res) ? res : res?.results ?? [];
      } catch (e) {
        console.error(`[sweep] query="${query}" page=${page} failed: ${(e as Error).message}`);
        break;
      }
      if (!results.length) break;
      for (const m of results) {
        if (m.id && !byId.has(m.id)) byId.set(m.id, m);
      }
      totalReturned += results.length;
      if (results.length < TOP_K) break;
      page += 1;
      if (page > 20) break;
    }
    console.error(`[sweep] query="${query}" → ${totalReturned} results, dedup total now ${byId.size}`);
  }

  return byId;
}

// ---------- history per memory ----------

async function captureHistory(
  client: MemoryClient,
  memoryId: string,
): Promise<{ ok: boolean; history?: unknown; error?: string }> {
  try {
    const history = await client.history(memoryId);
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- main ----------

async function main() {
  const client = new MemoryClient({ apiKey: API_KEY! });
  const date = new Date().toISOString().slice(0, 10);
  const outDir = join(repoRoot, "ai-docs", "v3", "mem0-snapshots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${date}.json`);

  console.error(`[snapshot] starting sweep for user_id=${USER_ID}`);
  const byId = await sweep(client);
  console.error(`[snapshot] sweep done: ${byId.size} unique memories`);

  const memories: Array<{ memory: RawMemory; history?: unknown; historyError?: string }> = [];
  let historyFailures = 0;
  for (const [memoryId, memory] of byId) {
    const h = await captureHistory(client, memoryId);
    if (h.ok) {
      memories.push({ memory, history: h.history });
    } else {
      memories.push({ memory, historyError: h.error });
      historyFailures += 1;
    }
  }

  const snapshot = {
    snapshotDate: date,
    snapshotAt: new Date().toISOString(),
    userId: USER_ID,
    totalMemories: memories.length,
    historyFailures,
    sweepQueries: SWEEP_QUERIES,
    memories,
  };

  writeFileSync(outFile, JSON.stringify(snapshot, null, 2));

  const summary = {
    ok: true,
    outFile,
    totalMemories: memories.length,
    historyFailures,
    bytes: JSON.stringify(snapshot).length,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((e) => {
  console.error("[snapshot.ts:fatal]", (e as Error).message);
  process.exit(1);
});
