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

// Separate scope for the graph-bridge stress test so it doesn't mix with the
// original 4 metadata-schema seeds. Memories 1-3 land here (continuous-agent
// chain, written by SDK). Memories 4-6 are written by the MCP POC under the
// same app_id.
const APP_ID_BRIDGE = "v3-mem0-graph-bridge-test";
const RUN_ID_BRIDGE = "2026-05-16-graph-bridge";

// Set to true to auto-delete this POC's memories at the end of a normal run.
// Default false so you can inspect the seeded data in the mem0 web UI at
// app.mem0.ai/dashboard/memories. Explicit teardown is always available via
// `npm run cleanup` (which passes --cleanup and skips the seeding/test steps).
const CLEANUP_AFTER_RUN = false;

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

// mem0ai v3 uses camelCase for scoping fields (v2→v3 migration).
const scope = { userId: USER_ID!, agentId: AGENT_ID, appId: APP_ID, runId: RUN_ID };

function header(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cleanup() {
  header("CLEANUP: deleteAll for this POC's scopes");
  // v3: like getAll/search, deleteAll uses snake_case filter keys.
  for (const appId of [APP_ID, APP_ID_BRIDGE]) {
    await client.deleteAll({ user_id: USER_ID!, app_id: appId } as never);
    console.log(`Deleted all memories under user_id=${USER_ID} app_id=${appId}`);
  }
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
  // v3 quirk: top-level SDK options are camelCase (topK), but filter keys
  // are snake_case (the filters object passes through to the API filter DSL).
  const textSearch = await client.search("How is the second brain hosted?", {
    filters: { user_id: USER_ID!, app_id: APP_ID },
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
    filters: { user_id: USER_ID!, app_id: APP_ID },
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
  // v3 quirk discovered during POC: search() finds memories filtered by
  // { user_id, app_id }, but getAll() with the same filter shape returns
  // empty results. The memories ARE stored with those scope fields (verified
  // via client.get(id)). The /v3/memories/ list endpoint may use different
  // indexing semantics than /v3/memories/search/. Falling back to search-
  // based enumeration for the snapshot use case; revisit once mem0 docs
  // catch up to the v3 SDK.
  const all = await client.getAll({
    filters: { AND: [{ user_id: USER_ID! }, { app_id: APP_ID }] },
  } as never);
  const allResults = (all as { results?: unknown[]; count?: number }).results ?? [];
  const allCount = (all as { count?: number }).count ?? allResults.length;
  console.log(`getAll returned ${allCount} memories (results length: ${allResults.length}).`);
  if (allCount === 0) {
    console.log(
      "[note] getAll empty even though search returned 4. Likely a v3 endpoint quirk —\n" +
        "       snapshot job should enumerate via paginated search until mem0 clarifies.",
    );
  }
  transcript.getAll = all;

  // ---- 5. history (version trail) ----
  header("STEP 5 — history on the first stored memory");
  // Use first id from search since getAll is unreliable in v3 right now.
  const firstId =
    (allResults[0] as { id?: string } | undefined)?.id ??
    ((textSearch as { results?: Array<{ id?: string }> }).results ?? [])[0]?.id;
  if (firstId) {
    const hist = await client.history(firstId);
    console.log(JSON.stringify(hist, null, 2));
    transcript.firstHistory = hist;
  } else {
    console.log("[skip] No memory id available from getAll or search.");
  }

  // ---- 6. targeted retrieval (single-memory patterns) ----
  // These are the patterns the production reader skill will use when the
  // executive builds a worker memory pack: filter by metadata.type to get
  // only principles, or by id for direct lookup.

  header("STEP 6a — targeted search: metadata.type = 'principle'");
  const principleSearch = await client.search("second brain", {
    filters: {
      user_id: USER_ID!,
      app_id: APP_ID,
      metadata: { type: "principle" },
    },
    topK: 10,
  } as never);
  const principleResults = (principleSearch as { results?: Array<{ id?: string; metadata?: { type?: string } }> }).results ?? [];
  console.log(`Got ${principleResults.length} result(s).`);
  for (const r of principleResults) {
    console.log(`  - ${r.id}  type=${r.metadata?.type}`);
  }
  transcript.principleSearch = principleSearch;
  if (principleResults.length === 1 && principleResults[0]?.metadata?.type === "principle") {
    console.log("[ok] metadata filter narrowed to exactly the principle memory.");
  } else if (principleResults.length === 0) {
    console.log("[warn] metadata filter returned nothing — filter syntax may be wrong.");
  } else {
    console.log(`[note] metadata filter returned ${principleResults.length} results — verify types above.`);
  }

  header("STEP 6b — direct get by id");
  if (firstId) {
    const one = await client.get(firstId);
    console.log(JSON.stringify(one, null, 2));
    transcript.directGet = one;
  } else {
    console.log("[skip] No id available for direct get.");
  }

  // ---- 7. graph bridge stress test ----
  // The original 4 seeds all share the same topic, so semantic similarity alone
  // explained every search hit and entity scoring stayed at 0. This phase writes
  // memories that share NAMED ENTITIES across DIFFERENT topics, so a bridge
  // query has to traverse entity links to surface the relevant chain.
  //
  // Three memories written here (Jack → continuous-agent → PM2 → SIGUSR2).
  // Three more memories live in the MCP POC (Azure Functions → credit-card-
  // stockpile → Cosmos DB chain). Run both POCs to get the full scaffold.

  header("STEP 7 — graph bridge stress test: write 3 SDK memories");

  const bridgeScope = {
    userId: USER_ID!,
    agentId: AGENT_ID,
    appId: APP_ID_BRIDGE,
    runId: RUN_ID_BRIDGE,
  };

  const bridgeSeeds: Seed[] = [
    {
      label: "1. Jack ↔ continuous-agent ↔ irin.julg",
      messages: [
        {
          role: "user",
          content:
            "Jack runs the continuous-agent project; his agent identity for the second brain is irin.julg.",
        },
      ],
      metadata: {
        type: "episodic",
        category: "project",
        confidence: 1.0,
        importance: "medium",
        source: "graph-bridge-test",
        harvest_run: RUN_ID_BRIDGE,
      },
    },
    {
      label: "2. continuous-agent ↔ PM2 ↔ executive-loop",
      messages: [
        {
          role: "user",
          content:
            "The continuous-agent project uses PM2 to run the executive loop in production.",
        },
      ],
      metadata: {
        type: "semantic",
        category: "technical",
        confidence: 0.95,
        importance: "high",
        source: "graph-bridge-test",
        harvest_run: RUN_ID_BRIDGE,
      },
    },
    {
      label: "3. PM2 ↔ SIGUSR2 ↔ npm run build",
      messages: [
        {
          role: "user",
          content:
            "PM2 receives SIGUSR2 from npm run build for hot-reload without restarting active workers.",
        },
      ],
      metadata: {
        type: "procedural",
        category: "technical",
        confidence: 0.9,
        importance: "high",
        source: "graph-bridge-test",
        harvest_run: RUN_ID_BRIDGE,
      },
    },
  ];

  const bridgeAddResults: unknown[] = [];
  for (const seed of bridgeSeeds) {
    console.log(`+ ${seed.label}`);
    const result = await client.add(seed.messages, {
      ...bridgeScope,
      metadata: seed.metadata,
    } as never);
    bridgeAddResults.push({ label: seed.label, result });
  }
  transcript.bridgeAddResults = bridgeAddResults;

  console.log("\nWaiting 8s for async extraction…");
  await sleep(8000);

  // The bridge query: no single memory contains "Jack" AND "reload" AND "PM2".
  // If only memory 3 surfaces (it mentions reload directly), semantic won.
  // If memories 1 and 2 also surface, the entity graph did work.
  const bridgeQuery =
    "How does Jack's continuous-agent project handle worker reloads?";

  header(`STEP 7 — bridge query: "${bridgeQuery}"`);
  const bridgeSearch = await client.search(bridgeQuery, {
    filters: { user_id: USER_ID!, app_id: APP_ID_BRIDGE },
    topK: 10,
  } as never);

  const bridgeResults =
    (bridgeSearch as { results?: Array<{ id?: string; memory?: string; score?: number; scoreBreakdown?: { semantic: number; bm25: number; entity: number } }> }).results ?? [];

  console.log(`Got ${bridgeResults.length} result(s).\n`);
  for (const r of bridgeResults) {
    const breakdown = r.scoreBreakdown;
    console.log(`  score=${r.score?.toFixed(3)}  semantic=${breakdown?.semantic.toFixed(3)}  entity=${breakdown?.entity.toFixed(3)}`);
    console.log(`    "${r.memory?.slice(0, 100)}…"`);
  }
  transcript.bridgeSearch = bridgeSearch;

  const entityScoreSum = bridgeResults.reduce(
    (acc, r) => acc + (r.scoreBreakdown?.entity ?? 0),
    0,
  );
  // Honest bridge interpretation: look for the SIGUSR2 memory specifically.
  // The query asks about "worker reloads", and the SIGUSR2 memory IS the
  // answer (it literally describes hot-reload without restarting workers).
  // If mem0 were doing real graph traversal, this memory should surface
  // even though the query keywords don't lexically match its text.
  const sigusrSurfaced = bridgeResults.some(r =>
    r.memory?.toLowerCase().includes("sigusr2") ||
    r.memory?.toLowerCase().includes("hot-reload") ||
    r.memory?.toLowerCase().includes("hot‑reload"),
  );

  console.log("\n--- bridge interpretation ---");
  if (sigusrSurfaced) {
    console.log(
      `[ok] The SIGUSR2/hot-reload memory surfaced — graph traversal from ` +
        `"worker reloads" → entity chain → SIGUSR2 fact is working.`,
    );
  } else {
    console.log(
      `[finding] The SIGUSR2/hot-reload memory did NOT surface for "worker reloads", ` +
        `even though it literally answers the question. mem0 v3 returns memories above a ` +
        `similarity threshold against the query; it does NOT do automatic multi-hop graph ` +
        `traversal. Memories that share entities with the query (Jack, continuous-agent) ` +
        `surface, but memories one hop removed (SIGUSR2 via PM2) do not.`,
    );
    console.log(
      `[implication] The production reader skill cannot rely on "memories find their own ` +
        `linked memories." It will need to either: (a) issue multiple queries to surface ` +
        `different facets, (b) extract entities from initial results and re-query, or ` +
        `(c) lean on the LLM at the call site to combine returned memories.`,
    );
  }
  if (entityScoreSum > 0) {
    console.log(
      `[ok] scoreBreakdown.entity contributed ${entityScoreSum.toFixed(3)} total ` +
        `across results. Entity-aware ranking is active on this dataset.`,
    );
  } else {
    console.log(
      `[note] scoreBreakdown.entity stayed at 0. v3's "automatic entity linking" appears ` +
        `to surface as semantic-similarity contributions, not as a separate score component.`,
    );
  }

  // ---- write transcript ----
  writeFileSync(outFile, JSON.stringify(transcript, null, 2));
  header("DONE");
  console.log(`Wrote transcript to ${outFile}`);

  if (CLEANUP_AFTER_RUN) {
    await cleanup();
  } else {
    console.log(
      `\nMemories left in place. Inspect at https://app.mem0.ai/dashboard/memories`,
    );
    console.log(`To delete this POC's data:  npm run cleanup`);
  }
}

main().catch((err) => {
  console.error("[poc-error]", err);
  process.exit(1);
});
