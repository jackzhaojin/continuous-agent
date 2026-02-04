/**
 * Ad-hoc test: Credential Tiers — Multi-format export helpers
 *
 * Validates that formatAppEnv() correctly generates:
 * - dotenv format (KEY=VALUE)
 * - JSON format ({"KEY": "VALUE"})
 * - shell format (export KEY="VALUE" with escaping)
 * - docker-compose format (indented YAML list)
 * - yaml format (KEY: "VALUE" with escaping)
 *
 * Run: npx tsx tests/adhoc/2026-02-03-credential-tiers/test-3-format-helpers.ts
 */

import { formatAppEnv, type EnvEntry, type AppEnvFormat } from '../../../src/deterministic/credential-tiers.js';

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

console.log('=== Test 3: Multi-format export helpers ===\n');

const testPairs: EnvEntry[] = [
  { key: 'DATABASE_URL', value: 'postgres://user:pass@host:5432/db' },
  { key: 'REDIS_URL', value: 'redis://localhost:6379' },
  { key: 'STRIPE_SECRET', value: 'sk_test_abc123' },
];

// --- Test 3a: dotenv format ---
console.log('[3a] dotenv format');
const dotenv = formatAppEnv(testPairs, 'dotenv');
assert(dotenv.includes('DATABASE_URL=postgres://user:pass@host:5432/db'), 'Should contain DB URL line');
assert(dotenv.includes('REDIS_URL=redis://localhost:6379'), 'Should contain Redis URL line');
assert(dotenv.includes('STRIPE_SECRET=sk_test_abc123'), 'Should contain Stripe key line');
assert(dotenv.endsWith('\n'), 'Should end with newline');
assert(dotenv.split('\n').filter(l => l.length > 0).length === 3, 'Should have 3 non-empty lines');

// --- Test 3b: JSON format ---
console.log('\n[3b] JSON format');
const json = formatAppEnv(testPairs, 'json');
const parsed = JSON.parse(json);
assert(parsed.DATABASE_URL === 'postgres://user:pass@host:5432/db', 'JSON should have correct DB URL');
assert(parsed.REDIS_URL === 'redis://localhost:6379', 'JSON should have correct Redis URL');
assert(parsed.STRIPE_SECRET === 'sk_test_abc123', 'JSON should have correct Stripe key');
assert(Object.keys(parsed).length === 3, 'JSON should have exactly 3 keys');

// --- Test 3c: shell format ---
console.log('\n[3c] shell format');
const shell = formatAppEnv(testPairs, 'shell');
assert(shell.includes('export DATABASE_URL="postgres://user:pass@host:5432/db"'), 'Shell should have export + quoted DB URL');
assert(shell.includes('export REDIS_URL="redis://localhost:6379"'), 'Shell should have export + quoted Redis URL');
assert(shell.includes('export STRIPE_SECRET="sk_test_abc123"'), 'Shell should have export + quoted Stripe key');

// --- Test 3d: docker-compose format ---
console.log('\n[3d] docker-compose format');
const docker = formatAppEnv(testPairs, 'docker-compose');
assert(docker.includes('      - DATABASE_URL=postgres://'), 'Docker format should be indented with dash');
assert(docker.includes('      - REDIS_URL=redis://'), 'Docker format should have Redis entry');
assert(docker.includes('      - STRIPE_SECRET=sk_test_'), 'Docker format should have Stripe entry');

// --- Test 3e: YAML format ---
console.log('\n[3e] YAML format');
const yaml = formatAppEnv(testPairs, 'yaml');
assert(yaml.includes('DATABASE_URL: "postgres://user:pass@host:5432/db"'), 'YAML should have quoted DB URL');
assert(yaml.includes('REDIS_URL: "redis://localhost:6379"'), 'YAML should have quoted Redis URL');

// --- Test 3f: Empty pairs ---
console.log('\n[3f] Empty pairs returns empty string');
const formats: AppEnvFormat[] = ['dotenv', 'json', 'shell', 'docker-compose', 'yaml'];
for (const fmt of formats) {
  const result = formatAppEnv([], fmt);
  assert(result === '', `Empty pairs should return empty string for ${fmt}, got "${result}"`);
}

// --- Test 3g: Shell escaping special characters ---
console.log('\n[3g] Shell escaping special characters');
const dangerousPairs: EnvEntry[] = [
  { key: 'PASSWORD', value: 'p@ss"w0rd$`echo hi`' },
];
const escapedShell = formatAppEnv(dangerousPairs, 'shell');
// After escaping, backticks become \`, dollar becomes \$, quotes become \"
// Check that the dangerous raw patterns are escaped
assert(escapedShell.includes('\\$'), 'Dollar signs should be escaped in shell format');
assert(escapedShell.includes('\\"'), 'Double quotes should be escaped in shell format');
assert(escapedShell.includes('\\`'), 'Backticks should be escaped in shell format');
// Verify the overall structure is correct
assert(escapedShell.startsWith('export PASSWORD="'), 'Should start with export PASSWORD="');

// --- Test 3h: YAML escaping ---
console.log('\n[3h] YAML escaping special characters');
const yamlEscaped = formatAppEnv(dangerousPairs, 'yaml');
assert(yamlEscaped.includes('\\"'), 'Double quotes should be escaped in YAML format');

// --- Summary ---
console.log(`\n--- Test 3 Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
