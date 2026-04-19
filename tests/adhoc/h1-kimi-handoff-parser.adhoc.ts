/**
 * H1 — Kimi handoff parser must decode [MSG] envelopes before scanning for YAML fences.
 *
 * v2.1.6 run produced "_Worker did not produce structured handoff_" for every
 * Kimi-CLI step even when workers emitted valid YAML, because the parser only
 * scanned raw log text and worker-spawner writes all vendor messages as
 * JSON.stringify'd `[MSG]` envelopes — so fences arrived with literal `\n`
 * escapes. This test covers: Claude-style raw fences, Kimi-style JSON envelopes
 * with string content, Claude/Codex-style JSON envelopes with content-block
 * arrays, and empty input.
 *
 * Run: npx tsx tests/adhoc/h1-kimi-handoff-parser.adhoc.ts
 */

import { parseStructuredHandoffFromLog } from '../../src/deterministic/state-handler.js';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

function main() {
  console.log('[H1] Kimi handoff parser tests\n');

  // ── Case 1: Claude SDK raw-fence log (backward compat) ──────────────────
  console.log('[1] Claude SDK raw YAML fence in log text');
  const claudeLog = `
=== WORKER START ===
[TURN 1] Assistant response
Here is the structured handoff:

\`\`\`yaml
step: step-3
what_i_built: "Supabase schema + API route for quote creation"
what_connects: "GET /api/quote reads from quotes table"
what_i_verified: "curl localhost:3000/api/quote returns 200"
known_gaps: "Pricing table not yet seeded"
next_step_should_know: "Use quote.id for downstream bookings"
journey_blocks_added: 2
\`\`\`

Done.
=== WORKER END ===
`;
  const fromClaude = parseStructuredHandoffFromLog(claudeLog);
  assert(fromClaude !== null, 'parses Claude raw-fence log');
  assert(fromClaude?.step_id === 'step-3', `step_id=step-3 (got ${fromClaude?.step_id})`);
  assert(
    fromClaude?.what_i_built === 'Supabase schema + API route for quote creation',
    'what_i_built extracted',
  );
  assert(fromClaude?.journey_blocks_added === 2, 'journey_blocks_added=2');

  // ── Case 2: Kimi-CLI [MSG] envelope with string content ─────────────────
  console.log('\n[2] Kimi-CLI envelope with content: string');
  const kimiRawMessage = {
    role: 'assistant',
    content:
      'Here is the handoff:\n\n```yaml\nstep: step-7\nwhat_i_built: "Added PO number field to checkout form"\nwhat_connects: "Form submits to POST /api/shipments"\nwhat_i_verified: "Playwright journey passes"\nknown_gaps: "Auto-focus not handled"\nnext_step_should_know: "shipment.id is returned"\njourney_blocks_added: 1\n```',
  };
  const kimiLog = `[MSG] type=assistant ${JSON.stringify(kimiRawMessage)}\n[MSG] type=result ${JSON.stringify({ exitCode: 0 })}`;
  const fromKimi = parseStructuredHandoffFromLog(kimiLog);
  assert(fromKimi !== null, 'parses Kimi envelope with string content');
  assert(fromKimi?.step_id === 'step-7', `step_id=step-7 (got ${fromKimi?.step_id})`);
  assert(
    fromKimi?.what_i_built === 'Added PO number field to checkout form',
    'what_i_built extracted from Kimi envelope',
  );
  assert(fromKimi?.journey_blocks_added === 1, 'journey_blocks_added=1');

  // ── Case 3: Claude-SDK-style content block array ────────────────────────
  console.log('\n[3] Envelope with content: [{type:"text", text:"..."}]');
  const blockRawMessage = {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Doing some work first.' },
      {
        type: 'text',
        text:
          '```yaml\nstep: step-12\nwhat_i_built: "Product grid with 12 items"\nwhat_connects: "Reads /api/products"\nwhat_i_verified: "Tests pass"\nknown_gaps: "No pagination"\nnext_step_should_know: "items[].id is slug"\njourney_blocks_added: 3\n```',
      },
    ],
  };
  const blockLog = `[MSG] type=assistant ${JSON.stringify(blockRawMessage)}`;
  const fromBlocks = parseStructuredHandoffFromLog(blockLog);
  assert(fromBlocks !== null, 'parses content-block-array envelope');
  assert(fromBlocks?.step_id === 'step-12', `step_id=step-12 (got ${fromBlocks?.step_id})`);
  assert(fromBlocks?.journey_blocks_added === 3, 'journey_blocks_added=3');

  // ── Case 4: Last handoff wins when multiple envelopes ───────────────────
  console.log('\n[4] Multiple envelopes — most recent wins');
  const firstMsg = {
    role: 'assistant',
    content:
      '```yaml\nstep: step-1\nwhat_i_built: "first"\nwhat_connects: "a"\nwhat_i_verified: "ok"\nknown_gaps: ""\nnext_step_should_know: ""\n```',
  };
  const secondMsg = {
    role: 'assistant',
    content:
      '```yaml\nstep: step-2\nwhat_i_built: "second"\nwhat_connects: "b"\nwhat_i_verified: "ok2"\nknown_gaps: ""\nnext_step_should_know: ""\n```',
  };
  const multiLog = [
    `[MSG] type=assistant ${JSON.stringify(firstMsg)}`,
    `[MSG] type=assistant ${JSON.stringify(secondMsg)}`,
  ].join('\n');
  const latest = parseStructuredHandoffFromLog(multiLog);
  assert(latest?.step_id === 'step-2', `latest handoff wins (got step_id=${latest?.step_id})`);
  assert(latest?.what_i_built === 'second', `latest what_i_built=second`);

  // ── Case 5: Skeleton / placeholder handoff rejected ─────────────────────
  console.log('\n[5] Placeholder handoff is rejected');
  const skeletonMsg = {
    role: 'assistant',
    content:
      '```yaml\nstep: <the step id assigned to you>\nwhat_i_built: "<ONE concrete sentence about what YOU produced>"\nwhat_connects: "<Where does YOUR code read state FROM>"\nwhat_i_verified: "<The actual commands YOU ran this step>"\nknown_gaps: "<What you knowingly did NOT do>"\nnext_step_should_know: "<non-obvious facts the next worker needs>"\n```',
  };
  const skeletonLog = `[MSG] type=assistant ${JSON.stringify(skeletonMsg)}`;
  const skeleton = parseStructuredHandoffFromLog(skeletonLog);
  assert(skeleton === null, 'skeleton placeholder rejected');

  // ── Case 6: Empty / no handoff ──────────────────────────────────────────
  console.log('\n[6] Empty input and no-handoff logs');
  assert(parseStructuredHandoffFromLog('') === null, 'empty string returns null');
  assert(parseStructuredHandoffFromLog('no handoff here at all') === null, 'no-handoff text returns null');
  const noMsgFence = `[MSG] type=tool_result ${JSON.stringify({ role: 'tool', content: 'irrelevant' })}`;
  assert(parseStructuredHandoffFromLog(noMsgFence) === null, 'tool_result without YAML returns null');

  // ── Case 7: Malformed JSON envelope falls through, not throw ────────────
  console.log('\n[7] Malformed JSON envelope falls through gracefully');
  const malformed = `[MSG] type=assistant {not valid json`;
  // Should not throw — and should return null.
  const mal = parseStructuredHandoffFromLog(malformed);
  assert(mal === null, 'malformed envelope returns null without throwing');

  console.log('');
  if (failures > 0) {
    console.error(`\n[H1] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[H1] all assertions passed');
  }
}

main();
