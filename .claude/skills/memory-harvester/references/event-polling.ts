/**
 * pollEventTerminal — wait for a mem0 async write to reach a terminal state.
 *
 * Empirically: PENDING → RUNNING → SUCCEEDED in ~3–5s server-side. RUNNING is
 * intermediate, not terminal. Hits the raw v1 endpoint, which uses
 * `Authorization: Token <key>` (NOT Bearer). See
 * `.claude/skills/memory-reader/references/mem0-limitations.md` §1.
 *
 * Bundled with the harvester skill so the polling guarantee travels with the
 * caller. Invoked from harvest.ts via Bash, never from agent code directly.
 */

export interface EventStatusBody {
  id: string;
  event_type?: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | string;
  payload?: unknown;
  results?: Array<{
    id?: string;
    data?: { memory?: string };
    linked_memory_ids?: string[];
    [k: string]: unknown;
  }>;
  started_at?: string;
  completed_at?: string;
  latency?: number;
  graph_status?: string | null;
  [k: string]: unknown;
}

export interface PollResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMEOUT";
  ms: number;
  body?: EventStatusBody;
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const DEFAULT_MAX_MS = 60_000;
const DEFAULT_INTERVAL_MS = 1_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollEventTerminal(
  eventId: string,
  apiKey: string,
  opts: { maxMs?: number; intervalMs?: number } = {},
): Promise<PollResult> {
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    const res = await fetch(`https://api.mem0.ai/v1/event/${eventId}/`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (res.ok) {
      const body = (await res.json()) as EventStatusBody;
      if (TERMINAL.has(body.status)) {
        return {
          status: body.status as PollResult["status"],
          ms: Date.now() - start,
          body,
        };
      }
    }
    await sleep(intervalMs);
  }

  return { status: "TIMEOUT", ms: Date.now() - start };
}
