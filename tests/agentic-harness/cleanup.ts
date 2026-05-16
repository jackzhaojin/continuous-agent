/**
 * Cleanup helpers for live tests. Ensures every memory written under a test
 * scope is deleted at the end of a run, so test data doesn't pollute the
 * second brain.
 *
 * Idempotent — safe to call from `finally{}` even if the test errored before
 * writing anything.
 */

import MemoryClient from "mem0ai";

export interface CleanupScope {
  user_id: string;
  app_id: string;
  /** Optional run_id narrowing. */
  run_id?: string;
}

export interface CleanupResult {
  attempted: number;
  deleted: number;
  failed: number;
  failures: Array<{ memoryId: string; error: string }>;
}

/**
 * Delete every memory under the given scope. Uses paginated search (not
 * getAll, which is broken in v3 — see
 * `.claude/skills/memory-reader/references/mem0-limitations.md` §4).
 */
export async function cleanupMem0Scope(
  scope: CleanupScope,
  apiKey: string,
): Promise<CleanupResult> {
  const client = new MemoryClient({ apiKey });
  const memoryIds = await enumerateScope(client, scope);

  const result: CleanupResult = {
    attempted: memoryIds.length,
    deleted: 0,
    failed: 0,
    failures: [],
  };

  for (const memoryId of memoryIds) {
    try {
      await client.delete(memoryId);
      result.deleted++;
    } catch (e) {
      result.failed++;
      result.failures.push({ memoryId, error: (e as Error).message });
    }
  }

  return result;
}

/** Enumerate every memory_id under a scope via paginated search. */
async function enumerateScope(
  client: MemoryClient,
  scope: CleanupScope,
): Promise<string[]> {
  // Sweep with several broad queries to maximize recall against semantic ranking.
  const SWEEP = ["memory", "test", "harvest", "principle semantic episodic"];
  const TOP_K = 100;
  const seen = new Set<string>();

  for (const query of SWEEP) {
    let page = 1;
    while (page <= 10) {
      const filters: Record<string, string> = {
        user_id: scope.user_id,
        app_id: scope.app_id,
      };
      if (scope.run_id) filters.run_id = scope.run_id;

      let results: Array<{ id?: string }> = [];
      try {
        const res = (await client.search(query, {
          filters,
          topK: TOP_K,
          page,
        })) as unknown as Array<{ id?: string }> | { results?: Array<{ id?: string }> };
        results = Array.isArray(res) ? res : res?.results ?? [];
      } catch {
        break;
      }
      if (!results.length) break;
      for (const m of results) {
        if (m.id) seen.add(m.id);
      }
      if (results.length < TOP_K) break;
      page++;
    }
  }

  return [...seen];
}

/**
 * Print a cleanup summary. Use this in test scripts so the dev knows what was
 * cleaned up (and what leaked if anything failed).
 */
export function printCleanupSummary(label: string, result: CleanupResult): void {
  const status = result.failed === 0 ? "✓" : "⚠";
  console.log(
    `  ${status} cleanup [${label}]: deleted ${result.deleted}/${result.attempted}${
      result.failed ? `, failed ${result.failed}` : ""
    }`,
  );
  for (const f of result.failures) {
    console.log(`     - failed: ${f.memoryId} (${f.error})`);
  }
}
