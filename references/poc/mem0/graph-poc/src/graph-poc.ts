/**
 * Mem0 SDK + Entity-Aware Retrieval POC
 *
 * Verifies that:
 *   1) The current TS SDK (v3, camelCase) accepts our V3.0 metadata schema
 *   2) Entity-aware retrieval works (v3 hosted: entity linking is built into the
 *      memory algorithm — there is no longer a separate graph store or toggle;
 *      the `relations` field on search responses may be empty by design)
 *   3) Scoped filters (userId / appId / runId) narrow results as expected
 *   4) getAll + history work for the daily snapshot use case
 *
 * Reads V3_MEM0_API_KEY and V3_MEM0_USER_ID from <repo-root>/.env.executive.
 *
 * Run:    npm run poc
 * Clean:  npm run cleanup    (deletes everything written by this POC)
 */

import { MemoryClient } from "mem0ai";
import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

// ---------- env ----------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../..");
const envPath = join(repoRoot, ".env.executive");
loadEnv({ path: envPath });

const API_KEY = process.env.V3_MEM0_API_KEY;
const USER_ID = process.env.V3_MEM0_USER_ID;

if (!API_KEY || !USER_ID) {
  console.error(
    `[fatal] Missing V3_MEM0_API_KEY or V3_MEM0_USER_ID in ${envPath}`,
  );
  process.exit(1);
}

const APP_ID = "v3-mem0-graph-poc";
const RUN_ID = "2026-05-16-graph-poc";
const AGENT_ID = "executive";

const cleanupOnly = process.argv.includes("--cleanup");

// ---------- shape: V3.0 metadata schema (mirror of decision doc) ----------

type MemoryType =
  | "principle"
  | "semantic"
  | "procedural"
  | "episodic"
  | "reflective";

interface MemoryMeta {
  type: MemoryType;
  category: "technical" | "functional" | "project";
  confidence: number;
  importance: "critical" | "high" | "medium" | "low";
  source: string;
  harvest_run: string;
}

interface Seed {
  label: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  metadata: MemoryMeta;
  immutable?: boolean;
}

// Four seed memories that share entities ("second brain", "graph mode", "harvester")
// so the graph layer has something to link.
const seeds: Seed[] = [
  {
    label: "principle / constitution",
    messages: [
      {
        role: "user",
        content:
          "Constitution rule: the second brain is canonical in markdown; mem0 is a derived projection. If they disagree, the repo wins.",
      },
    ],
    metadata: {
      type: "principle",
      category: "project",
      confidence: 1.0,
      importance: "critical",
      source: "workspace/constitution.md",
      harvest_run: RUN_ID,
    },
    immutable: true,
  },
  {
    label: "semantic / rejected alternative",
    messages: [
      {
        role: "user",
        content:
          "Plain Postgres + pgvector was rejected for the second brain because it reimplements extraction, consolidation, and conflict resolution — exactly mem0's differentiator.",
      },
    ],
    metadata: {
      type: "semantic",
      category: "technical",
      confidence: 0.95,
      importance: "high",
      source: "ai-docs/v3/xxxx-xx-xx-v3.0/second-brain-hosting-decision.md",
      harvest_run: RUN_ID,
    },
  },
  {
    label: "episodic / run outcome",
    messages: [
      {
        role: "user",
        content:
          "On 2026-05-15 the V3.0 hosting decision was finalized: mem0 cloud with graph mode, harvester is the only writer, workers receive memory packs in their prompt.",
      },
    ],
    metadata: {
      type: "episodic",
      category: "project",
      confidence: 1.0,
      importance: "high",
      source: "ai-docs/v3/xxxx-xx-xx-v3.0/second-brain-hosting-decision.md",
      harvest_run: RUN_ID,
    },
  },
  {
    label: "procedural / how to harvest",
    messages: [
      {
        role: "user",
        content:
          "When the harvester skill runs, it reads new markdown, classifies into principle/semantic/procedural/episodic/reflective, validates the metadata, then calls client.add(). It is the only writer to mem0.",
      },
    ],
    metadata: {
      type: "procedural",
      category: "technical",
      confidence: 0.9,
      importance: "high",
      source: "claude-files/skills/memory-harvester/SKILL.md",
      harvest_run: RUN_ID,
    },
  },
];

// ---------- helpers ----------

const client = new MemoryClient({ apiKey: API_KEY });

const scope = { userId: USER_ID!, agentId: AGENT_ID, appId: APP_ID, runId: RUN_ID };

function header(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cleanup() {
  header("CLEANUP: deleteAll for this POC's scope");
  await client.deleteAll({ userId: USER_ID!, appId: APP_ID });
  console.log(`Deleted all memories under userId=${USER_ID} appId=${APP_ID}`);
}

// ---------- main ----------

async function main() {
  if (cleanupOnly) {
    await cleanup();
    return;
  }

  const outDir = join(__dirname, "..", ".poc-output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const transcript: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    scope,
    sdk: "mem0ai (camelCase v3)",
    notes: "Graph mode is project-level (toggle in dashboard) — no enable_graph flag on calls.",
  };

  // ---- 1. add ----
  header("STEP 1 — add four seed memories with the V3.0 metadata schema");
  const addResults: unknown[] = [];
  for (const seed of seeds) {
    console.log(`+ ${seed.label}`);
    const result = await client.add(seed.messages, {
      ...scope,
      metadata: seed.metadata,
      immutable: seed.immutable ?? false,
    } as never);
    addResults.push({ label: seed.label, result });
  }
  transcript.addResults = addResults;

  // Async extraction grace period (per decision doc §5)
  console.log("\nWaiting 8s for async extraction…");
  await sleep(8000);

  // ---- 2. text search ----
  header("STEP 2 — text search: 'How is the second brain hosted?'");
  const textSearch = await client.search("How is the second brain hosted?", {
    filters: { AND: [{ user_id: USER_ID! }, { app_id: APP_ID }] },
    topK: 10,
  } as never);
  console.log(JSON.stringify(textSearch, null, 2));
  transcript.textSearch = textSearch;

  // ---- 3. entity-aware retrieval ----
  header("STEP 3 — entity-aware retrieval: search for 'harvester'");
  console.log("v3 hosted mem0 has built-in entity linking — no graph toggle to flip.");
  console.log("This test verifies that searching for an entity surfaces relevant");
  console.log("memories, including ones that share linked concepts.\n");
  const graphSearch = await client.search("harvester", {
    filters: { AND: [{ user_id: USER_ID! }, { app_id: APP_ID }] },
    topK: 10,
  } as never);
  console.log(JSON.stringify(graphSearch, null, 2));
  transcript.graphSearch = graphSearch;

  const relations = (graphSearch as { relations?: unknown[] }).relations;
  if (!relations || relations.length === 0) {
    console.log(
      "\n[info] response.relations is empty. In v3 hosted, the separate graph store " +
        "was removed and entity linking is baked into retrieval ranking, so an empty " +
        "relations array is expected. Inspect results above to verify entity-aware " +
        "retrieval worked: do memories referencing 'harvester' (via the procedural " +
        "and episodic seeds) appear with reasonable scores?",
    );
  } else {
    console.log(`\n[ok] Got ${relations.length} relation(s) on the response.`);
  }

  // ---- 4. getAll (snapshot use case) ----
  header("STEP 4 — getAll under scope (for snapshot job)");
  const all = await client.getAll({ userId: USER_ID!, appId: APP_ID } as never);
  console.log(`Returned ${(all as unknown[]).length ?? "?"} memories.`);
  transcript.getAll = all;

  // ---- 5. history (version trail) ----
  header("STEP 5 — history on the first stored memory");
  const firstId = (all as Array<{ id?: string }>)[0]?.id;
  if (firstId) {
    const hist = await client.history(firstId);
    console.log(JSON.stringify(hist, null, 2));
    transcript.firstHistory = hist;
  } else {
    console.log("[skip] No memory id returned from getAll.");
  }

  // ---- write transcript ----
  writeFileSync(outFile, JSON.stringify(transcript, null, 2));
  header("DONE");
  console.log(`Wrote transcript to ${outFile}`);
  console.log(`\nTo delete this POC's memories from mem0:  npm run cleanup`);
}

main().catch((err) => {
  console.error("[poc-error]", err);
  process.exit(1);
});
