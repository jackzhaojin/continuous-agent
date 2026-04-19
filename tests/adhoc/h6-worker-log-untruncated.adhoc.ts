/**
 * H6 — Worker log must not silently truncate msg.raw.
 *
 * v2.1.6 retro: `.slice(0, 500)` in worker-spawner cut YAML handoffs and
 * tool-call arguments, making post-mortem analysis impossible. v2.4 writes
 * full JSON by default; WORKER_LOG_TRUNCATE_LEN>0 restores legacy behavior.
 *
 * This test isolates the log formatting logic so we don't have to actually
 * spawn a worker. We mirror the exact code path in worker-spawner.ts's
 * streamingWork() callback.
 *
 * Run: npx tsx tests/adhoc/h6-worker-log-untruncated.adhoc.ts
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

function formatMsgLine(rawJson: string, truncateLen: number): string {
  const rawForLog = truncateLen > 0 ? rawJson.slice(0, truncateLen) : rawJson;
  return `[MSG] type=assistant ${rawForLog}`;
}

function main() {
  console.log('[H6] Worker log truncation tests\n');

  // 2KB YAML handoff inside a realistic Kimi envelope
  const longText = '```yaml\n' +
    'step: step-14\n' +
    'what_i_built: "' + 'x'.repeat(600) + '"\n' +
    'what_connects: "' + 'y'.repeat(400) + '"\n' +
    'what_i_verified: "tests pass"\n' +
    'known_gaps: "none"\n' +
    'next_step_should_know: "use id"\n' +
    'journey_blocks_added: 1\n' +
    '```';
  const rawMsg = { role: 'assistant', content: longText };
  const rawJson = JSON.stringify(rawMsg);

  console.log('[1] Default — no truncation');
  const defaultLine = formatMsgLine(rawJson, 0);
  // YAML body + envelope is >1KB — anything well above the legacy 500 cap is fine.
  assert(defaultLine.length > 1000, `default line length ${defaultLine.length} > 1000`);
  assert(defaultLine.includes('next_step_should_know'), 'full handoff preserved');
  assert(defaultLine.includes('journey_blocks_added'), 'journey_blocks_added preserved');

  console.log('\n[2] Legacy opt-in — WORKER_LOG_TRUNCATE_LEN=500');
  const truncatedLine = formatMsgLine(rawJson, 500);
  // Prefix `[MSG] type=assistant ` is 21 chars; legacy mode caps the JSON body at 500.
  const MSG_PREFIX_LEN = '[MSG] type=assistant '.length;
  assert(
    truncatedLine.length <= MSG_PREFIX_LEN + 500,
    `truncated line ${truncatedLine.length} ≤ ${MSG_PREFIX_LEN + 500}`,
  );
  assert(!truncatedLine.includes('next_step_should_know'), 'legacy mode drops handoff tail');

  console.log('\n[3] Tiny message — no truncation needed');
  const small = JSON.stringify({ role: 'assistant', content: 'ok' });
  const smallLine = formatMsgLine(small, 0);
  assert(smallLine.endsWith('"ok"}'), 'tiny payload preserved');

  console.log('');
  if (failures > 0) {
    console.error(`[H6] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[H6] all assertions passed');
  }
}

main();
