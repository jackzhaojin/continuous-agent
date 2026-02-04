/**
 * Ad-hoc test: Credential Tiers — .env file parsing
 *
 * Validates that parseEnvContent correctly handles:
 * - Standard KEY=VALUE pairs
 * - Comments and blank lines
 * - Quoted values
 * - Inline comments
 * - Empty values (should be excluded)
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-1-env-parsing.ts
 */

import { parseEnvContent } from '../../../src/deterministic/credential-tiers.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

console.log('=== Test 1: .env file parsing ===\n');

// --- Test 1a: Standard KEY=VALUE ---
console.log('[1a] Standard KEY=VALUE pairs');
const basic = parseEnvContent(`
ANTHROPIC_API_KEY=sk-ant-123
MODEL=claude-sonnet-4-5
`);
assert(basic.length === 2, `Expected 2 entries, got ${basic.length}`);
assert(basic[0].key === 'ANTHROPIC_API_KEY', `Key should be ANTHROPIC_API_KEY, got ${basic[0].key}`);
assert(basic[0].value === 'sk-ant-123', `Value should be sk-ant-123, got ${basic[0].value}`);
assert(basic[1].key === 'MODEL', `Key should be MODEL, got ${basic[1].key}`);

// --- Test 1b: Comments and blank lines ---
console.log('\n[1b] Comments and blank lines');
const withComments = parseEnvContent(`
# This is a comment
NOTION_API_KEY=secret_abc

# Another comment

NOTION_DATABASE_ID=db_xyz
`);
assert(withComments.length === 2, `Expected 2 entries (comments skipped), got ${withComments.length}`);
assert(withComments[0].key === 'NOTION_API_KEY', `First key should be NOTION_API_KEY`);
assert(withComments[1].key === 'NOTION_DATABASE_ID', `Second key should be NOTION_DATABASE_ID`);

// --- Test 1c: Quoted values ---
console.log('\n[1c] Quoted values');
const quoted = parseEnvContent(`
DB_URL="postgres://user:pass@host/db"
SECRET='my-secret-value'
`);
assert(quoted.length === 2, `Expected 2 entries, got ${quoted.length}`);
assert(quoted[0].value === 'postgres://user:pass@host/db', `Double-quoted value should be unquoted`);
assert(quoted[1].value === 'my-secret-value', `Single-quoted value should be unquoted`);

// --- Test 1d: Inline comments ---
console.log('\n[1d] Inline comments');
const inlineComments = parseEnvContent(`
IDLE_SLEEP_SECONDS=30 # Sleep when queue is empty
MODEL=claude-sonnet-4-5
`);
assert(inlineComments.length === 2, `Expected 2 entries, got ${inlineComments.length}`);
assert(inlineComments[0].value === '30', `Value should be 30 (inline comment stripped), got "${inlineComments[0].value}"`);

// --- Test 1e: Empty values excluded ---
console.log('\n[1e] Empty values excluded');
const withEmpty = parseEnvContent(`
ANTHROPIC_API_KEY=
MODEL=claude-sonnet-4-5
NOTION_API_KEY=
ELEVENLABS_API_KEY=abc123
`);
assert(withEmpty.length === 2, `Expected 2 entries (empty values excluded), got ${withEmpty.length}`);
assert(withEmpty[0].key === 'MODEL', `First should be MODEL (non-empty), got ${withEmpty[0].key}`);
assert(withEmpty[1].key === 'ELEVENLABS_API_KEY', `Second should be ELEVENLABS_API_KEY, got ${withEmpty[1].key}`);

// --- Test 1f: Values with equals signs ---
console.log('\n[1f] Values with equals signs');
const equalsInValue = parseEnvContent(`
DB_URL=postgres://user:pass@host/db?ssl=true&timeout=30
`);
assert(equalsInValue.length === 1, `Expected 1 entry, got ${equalsInValue.length}`);
assert(equalsInValue[0].value.includes('ssl=true'), `Value should preserve equals signs`);

// --- Summary ---
console.log(`\n--- Test 1 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
