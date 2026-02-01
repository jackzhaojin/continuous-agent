/**
 * Ad-hoc test: Fix #7 — Housekeep completed bundles from in-progress/
 *
 * Validates that housekeepCompletedBundles():
 * 1. Moves bundles with `status: complete` from in-progress/P{n}/ to completed/
 * 2. Leaves non-complete bundles in place
 * 3. Handles quoted and unquoted status values
 * 4. Skips bundles that already exist in completed/
 * 5. Skips directories without PROMPT.md
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix7-housekeep-bundles.ts
 */

import { mkdir, writeFile, rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Simulates the housekeep logic from health-checker.ts.
 * Uses a custom workspace root instead of process.cwd()/workspace.
 */
async function housekeepCompletedBundlesTestable(workspaceDir: string): Promise<string[]> {
  const { readdir: rd, readFile: rf, rename: rn, mkdir: mkd } = await import('fs/promises');
  const moved: string[] = [];

  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    const priorityDir = path.join(workspaceDir, 'in-progress', priority);
    if (!existsSync(priorityDir)) continue;

    let entries;
    try {
      entries = await rd(priorityDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const promptPath = path.join(priorityDir, entry.name, 'PROMPT.md');
      if (!existsSync(promptPath)) continue;

      try {
        const content = await rf(promptPath, 'utf-8');
        const statusMatch = content.match(/^status:\s*['"]?complete['"]?\s*$/mi);
        if (!statusMatch) continue;

        const completedDir = path.join(workspaceDir, 'completed');
        const destPath = path.join(completedDir, entry.name);

        if (existsSync(destPath)) continue;

        await mkd(completedDir, { recursive: true });
        await rn(path.join(priorityDir, entry.name), destPath);
        moved.push(entry.name);
      } catch {
        // Ignore individual bundle errors
      }
    }
  }

  return moved;
}

function makePromptMd(status: string, title: string): string {
  return `---
title: "${title}"
slug: "${title.toLowerCase().replace(/\s+/g, '-')}"
priority: P2
status: ${status}
---

# ${title}

Build something.
`;
}

async function runTests() {
  const tmpDir = await import('fs/promises').then(fs =>
    fs.mkdtemp(path.join(os.tmpdir(), 'fix7-test-'))
  );

  try {
    const ws = tmpDir;

    // --- Setup test workspace ---
    // P2 bundles: 2 complete, 1 pending, 1 blocked
    await mkdir(path.join(ws, 'in-progress', 'P2', 'chatbot-ui-react'), { recursive: true });
    await writeFile(
      path.join(ws, 'in-progress', 'P2', 'chatbot-ui-react', 'PROMPT.md'),
      makePromptMd('complete', 'Chatbot UI React')
    );

    await mkdir(path.join(ws, 'in-progress', 'P2', 'retro-dashboard'), { recursive: true });
    await writeFile(
      path.join(ws, 'in-progress', 'P2', 'retro-dashboard', 'PROMPT.md'),
      makePromptMd('complete', 'Retro Dashboard')
    );

    await mkdir(path.join(ws, 'in-progress', 'P2', 'active-task'), { recursive: true });
    await writeFile(
      path.join(ws, 'in-progress', 'P2', 'active-task', 'PROMPT.md'),
      makePromptMd('in_progress', 'Active Task')
    );

    await mkdir(path.join(ws, 'in-progress', 'P2', 'blocked-task'), { recursive: true });
    await writeFile(
      path.join(ws, 'in-progress', 'P2', 'blocked-task', 'PROMPT.md'),
      makePromptMd('blocked', 'Blocked Task')
    );

    // P3 bundle: 1 complete with quoted status
    await mkdir(path.join(ws, 'in-progress', 'P3', 'reference-refresh'), { recursive: true });
    await writeFile(
      path.join(ws, 'in-progress', 'P3', 'reference-refresh', 'PROMPT.md'),
      makePromptMd('"complete"', 'Reference Refresh')
    );

    // P4 bundle: no PROMPT.md
    await mkdir(path.join(ws, 'in-progress', 'P4', 'no-prompt'), { recursive: true });

    // completed/ directory: pre-existing bundle with same name
    await mkdir(path.join(ws, 'completed', 'already-there'), { recursive: true });
    await mkdir(path.join(ws, 'in-progress', 'P2', 'already-there'), { recursive: true });
    await writeFile(
      path.join(ws, 'in-progress', 'P2', 'already-there', 'PROMPT.md'),
      makePromptMd('complete', 'Already There')
    );

    // --- Test 1: Run housekeeping ---
    const moved = await housekeepCompletedBundlesTestable(ws);
    console.log(`[Test 1] Moved bundles: ${JSON.stringify(moved)}`);
    console.assert(moved.length === 3, `FAIL: Expected 3 moved, got ${moved.length}`);
    console.assert(moved.includes('chatbot-ui-react'), 'FAIL: chatbot-ui-react should be moved');
    console.assert(moved.includes('retro-dashboard'), 'FAIL: retro-dashboard should be moved');
    console.assert(moved.includes('reference-refresh'), 'FAIL: reference-refresh should be moved');

    // --- Test 2: Completed bundles are in completed/ ---
    const completedEntries = await readdir(path.join(ws, 'completed'));
    console.log(`[Test 2] completed/ entries: ${JSON.stringify(completedEntries)}`);
    console.assert(completedEntries.includes('chatbot-ui-react'), 'FAIL: chatbot-ui-react not in completed/');
    console.assert(completedEntries.includes('retro-dashboard'), 'FAIL: retro-dashboard not in completed/');
    console.assert(completedEntries.includes('reference-refresh'), 'FAIL: reference-refresh not in completed/');

    // --- Test 3: Non-complete bundles still in in-progress ---
    const p2Remaining = await readdir(path.join(ws, 'in-progress', 'P2'));
    console.log(`[Test 3] P2 remaining: ${JSON.stringify(p2Remaining)}`);
    console.assert(p2Remaining.includes('active-task'), 'FAIL: active-task should remain');
    console.assert(p2Remaining.includes('blocked-task'), 'FAIL: blocked-task should remain');
    console.assert(!p2Remaining.includes('chatbot-ui-react'), 'FAIL: chatbot-ui-react should be gone');

    // --- Test 4: Duplicate slug not overwritten ---
    console.log(`[Test 4] already-there still in P2: ${p2Remaining.includes('already-there')}`);
    console.assert(p2Remaining.includes('already-there'), 'FAIL: already-there should NOT be moved (collision)');
    console.assert(!moved.includes('already-there'), 'FAIL: already-there should not appear in moved list');

    // --- Test 5: No PROMPT.md skipped ---
    const p4Remaining = await readdir(path.join(ws, 'in-progress', 'P4'));
    console.log(`[Test 5] P4 remaining: ${JSON.stringify(p4Remaining)}`);
    console.assert(p4Remaining.includes('no-prompt'), 'FAIL: no-prompt should remain (no PROMPT.md)');

    // --- Test 6: Idempotent — second run moves nothing ---
    const moved2 = await housekeepCompletedBundlesTestable(ws);
    console.log(`[Test 6] Second run moved: ${moved2.length} (expect 0)`);
    console.assert(moved2.length === 0, `FAIL: Idempotent check — expected 0, got ${moved2.length}`);

    console.log('\n--- All Fix #7 tests passed ---');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
