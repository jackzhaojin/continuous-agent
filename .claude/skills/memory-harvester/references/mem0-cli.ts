/**
 * Unified `mem0` CLI — the single deterministic surface the executive agent
 * drives agentically (via Bash) for ALL second-brain access.
 *
 *   npx tsx .claude/skills/memory-harvester/references/mem0-cli.ts <cmd> [flags]
 *   # or, ergonomically:  bin/mem0 <cmd> [flags]
 *
 * Subcommands:
 *   search   --query <q> [--user-id] [--app-id] [--type] [--top-k] [--min-confidence] [--json]
 *   get      --id <memoryId> [--json]
 *   history  --id <memoryId> [--json]
 *   list-entities [--json]
 *   add      --payload '<json MemoryWrite>' | --batch '<json MemoryWrite[]>'
 *   update   --id <memoryId> [--text <t>] [--importance <i>]      (metadata merge)
 *   enumerate [--user-id] [--app-id] [--max <n>] [--json]         (paginated search, NOT getAll)
 *
 * Design contract:
 *   - The AGENT decides WHAT (which queries, what to write, how to iterate).
 *   - This CLI enforces HOW (correct filter shape, snake/camel, auth, event
 *     polling, schema validation). The agent never has to remember the gotchas.
 *
 * Gotchas baked in (so skills don't repeat them — see mem0-limitations.md):
 *   - search/enumerate wrap filters as { AND: [{ user_id }, ...] }. A bare
 *     { user_id } object or no filter can silently return { results: [] }.
 *   - getAll() is broken in v3 → enumerate uses paginated search().
 *   - event endpoint auth is `Token <key>` (not Bearer) — see event-polling.ts.
 *
 * No prompts, no intelligence here. The intelligence lives in the memory-reader
 * and memory-harvester SKILL.md files.
 */

import MemoryClient from "mem0ai";
import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

import { pollEventTerminal, type EventStatusBody } from "./event-polling.js";
import { assertValid, type MemoryWrite, type MemoryType } from "./classify.js";
import { applyDefaults, type PartialMemoryWrite } from "./defaults.js";

// ───────────────────────── env ─────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
// .claude/skills/memory-harvester/references/ → repo root is 4 levels up
const repoRoot = resolve(__dirname, "../../../..");
loadEnv({ path: join(repoRoot, ".env.executive") });

const API_KEY = process.env.V3_MEM0_API_KEY;
const ENV_USER_ID = process.env.V3_MEM0_USER_ID;
const MEMORY_ENABLED =
  (process.env.V3_MEMORY_ENABLED ?? "true").toLowerCase() !== "false";

function requireKey(): string {
  if (!API_KEY) {
    fail("Missing V3_MEM0_API_KEY in .env.executive at repo root.");
  }
  return API_KEY!;
}

function makeClient(): MemoryClient {
  return new MemoryClient({ apiKey: requireKey() });
}

// ───────────────────────── arg parsing ─────────────────────────

/** Minimal flag parser: --flag value, --bool (no value), repeats last wins. */
function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function fail(msg: string): never {
  console.error(`[mem0-cli:fatal] ${msg}`);
  process.exit(1);
}

// ───────────────────────── filter construction ─────────────────────────

/**
 * Build the mem0 v2 filter object. ALWAYS an { AND: [...] } wrapper with at
 * least user_id — this is the empirically-proven shape that returns results.
 * Bare { user_id } or auto-injection can return empty (mem0-limitations.md §5).
 */
function buildFilters(opts: {
  userId?: string;
  appId?: string;
  runId?: string;
}): Record<string, unknown> {
  const userId = opts.userId ?? ENV_USER_ID;
  if (!userId) {
    fail("No user_id: pass --user-id or set V3_MEM0_USER_ID in .env.executive.");
  }
  const clauses: Record<string, unknown>[] = [{ user_id: userId }];
  if (opts.appId) clauses.push({ app_id: opts.appId });
  if (opts.runId) clauses.push({ run_id: opts.runId });
  return { AND: clauses };
}

// ───────────────────────── output ─────────────────────────

interface SlimMemory {
  id?: string;
  memory?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  categories?: string[];
  created_at?: string;
}

function printMemories(results: SlimMemory[], asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify({ count: results.length, results }, null, 2) + "\n");
    return;
  }
  if (results.length === 0) {
    console.log("(no memories matched)");
    return;
  }
  for (const m of results) {
    const score = typeof m.score === "number" ? m.score.toFixed(3) : "  -  ";
    const type = (m.metadata?.type as string) ?? "?";
    const imp = (m.metadata?.importance as string) ?? "?";
    console.log(`[${score}] (${type}/${imp}) ${m.memory ?? ""}`);
    console.log(`         id=${m.id ?? "?"}  app=${m.metadata?.harvest_run ?? m.metadata?.source ?? "-"}`);
  }
  console.log(`\n${results.length} result(s).`);
}

// ───────────────────────── commands: read ─────────────────────────

async function cmdSearch(argv: string[]): Promise<void> {
  const f = parseFlags(argv);
  const queryStr = str(f.query);
  if (!queryStr) fail("search requires --query <text>");

  const topK = f["top-k"] ? parseInt(str(f["top-k"])!, 10) : 10;
  const typeFilter = str(f.type) as MemoryType | undefined;
  const minConfidence = f["min-confidence"]
    ? parseFloat(str(f["min-confidence"])!)
    : undefined;
  const asJson = f.json === true;

  const filters = buildFilters({
    userId: str(f["user-id"]),
    appId: str(f["app-id"]),
    runId: str(f["run-id"]),
  });

  const client = makeClient();
  // Fetch extra headroom when we post-filter client-side (type/confidence).
  const fetchK = typeFilter || minConfidence !== undefined ? Math.max(topK * 3, 30) : topK;

  // SearchMemoryOptions is a closed interface; `version` is accepted by the
  // API but not in the typings, so widen with a loose cast.
  const searchOpts = {
    filters,
    topK: fetchK,
    version: "v2",
  } as Parameters<typeof client.search>[1] & Record<string, unknown>;

  const res = await client.search(queryStr, searchOpts);
  let results = (res?.results ?? []) as SlimMemory[];

  if (typeFilter) {
    results = results.filter((m) => (m.metadata?.type as string) === typeFilter);
  }
  if (minConfidence !== undefined) {
    results = results.filter((m) => {
      const c = m.metadata?.confidence;
      return typeof c === "number" ? c >= minConfidence : true;
    });
  }
  results = results.slice(0, topK);
  printMemories(results, asJson);
}

async function cmdGet(argv: string[]): Promise<void> {
  const f = parseFlags(argv);
  const id = str(f.id);
  if (!id) fail("get requires --id <memoryId>");
  const client = makeClient();
  try {
    const mem = await client.get(id);
    process.stdout.write(JSON.stringify(mem, null, 2) + "\n");
  } catch (e) {
    fail(`get failed: ${(e as Error).message}`);
  }
}

async function cmdHistory(argv: string[]): Promise<void> {
  const f = parseFlags(argv);
  const id = str(f.id);
  if (!id) fail("history requires --id <memoryId>");
  const client = makeClient();
  const hist = await client.history(id);
  process.stdout.write(JSON.stringify(hist, null, 2) + "\n");
}

async function cmdListEntities(argv: string[]): Promise<void> {
  const f = parseFlags(argv);
  const client = makeClient();
  const users = await client.users();
  process.stdout.write(JSON.stringify(users, null, 2) + "\n");
}

/**
 * Enumerate memories under a scope using PAGINATED SEARCH (getAll is broken in
 * v3). A broad query maximizes recall; we page until exhausted or --max hit.
 */
async function cmdEnumerate(argv: string[]): Promise<void> {
  const f = parseFlags(argv);
  const asJson = f.json === true;
  const max = f.max ? parseInt(str(f.max)!, 10) : 1000;
  const filters = buildFilters({
    userId: str(f["user-id"]),
    appId: str(f["app-id"]),
  });
  const client = makeClient();

  // Several broad queries to maximize semantic recall across the scope.
  const sweeps = ["memory", "project run outcome", "principle semantic episodic procedural reflective"];
  const seen = new Map<string, SlimMemory>();
  for (const q of sweeps) {
    const opts = { filters, topK: 100, version: "v2" } as Parameters<typeof client.search>[1] &
      Record<string, unknown>;
    const res = await client.search(q, opts);
    for (const m of (res?.results ?? []) as SlimMemory[]) {
      if (m.id && !seen.has(m.id)) seen.set(m.id, m);
      if (seen.size >= max) break;
    }
    if (seen.size >= max) break;
  }
  printMemories([...seen.values()], asJson);
}

// ───────────────────────── commands: write ─────────────────────────

function appendLedger(record: Record<string, unknown>): void {
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(repoRoot, "ledgers", "harvest-runs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${date}.jsonl`), JSON.stringify(record) + "\n");
}

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

function stampAndValidate(parsed: unknown, label: string): MemoryWrite {
  let stamped: unknown;
  try {
    stamped = applyDefaults(parsed as PartialMemoryWrite);
  } catch (e) {
    fail(`${label} defaults stamping failed: ${(e as Error).message}`);
  }
  try {
    assertValid(stamped);
  } catch (e) {
    fail(`${label} failed validation:\n${(e as Error).message}`);
  }
  return stamped as MemoryWrite;
}

async function writeOne(client: MemoryClient, p: MemoryWrite): Promise<WriteResult> {
  const t0 = Date.now();
  try {
    const messages = [{ role: "user" as const, content: p.text }];
    const opts: Record<string, unknown> = {
      userId: p.user_id,
      agentId: p.agent_id,
      appId: p.app_id,
      metadata: { ...p.metadata, immutable: p.immutable },
    };
    if (p.run_id) opts.runId = p.run_id;

    const addResponse = (await client.add(messages, opts)) as unknown as
      | { eventId?: string; event_id?: string }
      | Array<{ eventId?: string; event_id?: string }>;
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
    appendLedger({ ts: new Date().toISOString(), ...result });
    return result;
  } catch (e) {
    const result: WriteResult = {
      ok: false,
      payload: p,
      status: "ERROR",
      ms: Date.now() - t0,
      error: (e as Error).message,
    };
    appendLedger({ ts: new Date().toISOString(), ...result });
    return result;
  }
}

async function cmdAdd(argv: string[]): Promise<void> {
  if (!MEMORY_ENABLED) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "V3_MEMORY_ENABLED=false" }));
    return;
  }
  if (!ENV_USER_ID) fail("Missing V3_MEM0_USER_ID in .env.executive.");

  const f = parseFlags(argv);
  const rawSingle = str(f.payload);
  const rawBatch = str(f.batch);
  if (!rawSingle && !rawBatch) fail("add requires --payload <json> or --batch <json[]>");

  let items: MemoryWrite[];
  try {
    if (rawBatch) {
      const arr = JSON.parse(rawBatch);
      if (!Array.isArray(arr)) fail("--batch expects a JSON array");
      items = arr.map((p, i) => stampAndValidate(p, `Item ${i}`));
    } else {
      items = [stampAndValidate(JSON.parse(rawSingle!), "Payload")];
    }
  } catch (e) {
    fail(`Could not parse JSON payload: ${(e as Error).message}`);
  }

  const client = makeClient();
  const results: WriteResult[] = [];
  for (const item of items!) results.push(await writeOne(client, item));

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
  if (!summary.ok) process.exit(1);
}

/**
 * Update an existing memory's text and/or metadata (e.g. bump importance).
 * The mem0 SDK update() supports metadata merge — the MCP did not expose it.
 */
async function cmdUpdate(argv: string[]): Promise<void> {
  const f = parseFlags(argv);
  const id = str(f.id);
  if (!id) fail("update requires --id <memoryId>");
  const text = str(f.text);
  const importance = str(f.importance);
  if (text === undefined && importance === undefined) {
    fail("update requires at least --text or --importance");
  }

  const client = makeClient();
  // Merge onto existing metadata so we don't clobber other fields.
  const existing = await client.get(id);
  const mergedMeta = {
    ...((existing as { metadata?: Record<string, unknown> }).metadata ?? {}),
    ...(importance !== undefined ? { importance } : {}),
  };
  const body: { text?: string; metadata?: Record<string, unknown> } = {
    metadata: mergedMeta,
  };
  if (text !== undefined) body.text = text;
  else body.text = (existing as { memory?: string }).memory ?? "";

  const res = await client.update(id, body as Parameters<typeof client.update>[1]);
  process.stdout.write(JSON.stringify({ ok: true, id, updated: res }, null, 2) + "\n");
}

// ───────────────────────── dispatch ─────────────────────────

const USAGE = `mem0 <command> [flags]

read:
  search   --query <q> [--user-id] [--app-id] [--type] [--top-k] [--min-confidence] [--json]
  get      --id <memoryId> [--json]
  history  --id <memoryId>
  list-entities
  enumerate [--user-id] [--app-id] [--max <n>] [--json]

write (executive harvester only):
  add      --payload '<json>' | --batch '<json[]>'
  update   --id <memoryId> [--text <t>] [--importance <critical|high|medium|low>]
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "search": return cmdSearch(rest);
    case "get": return cmdGet(rest);
    case "history": return cmdHistory(rest);
    case "list-entities": return cmdListEntities(rest);
    case "enumerate": return cmdEnumerate(rest);
    case "add": return cmdAdd(rest);
    case "update": return cmdUpdate(rest);
    case "help": case "--help": case undefined:
      process.stdout.write(USAGE);
      return;
    default:
      fail(`Unknown command "${cmd}".\n\n${USAGE}`);
  }
}

main().catch((e) => {
  console.error("[mem0-cli:fatal]", (e as Error).message);
  process.exit(1);
});
