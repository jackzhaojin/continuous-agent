#!/bin/bash
# Run all credential tier adhoc tests
# Usage: bash tests/adhoc/2026-02-03-credential-tiers/run-all.sh

set -e
cd "$(dirname "$0")/../../.."

echo "=== Test 1: .env file parsing ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-1-env-parsing.ts
echo ""

echo "=== Test 2: Tier isolation / leak detection ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-2-tier-isolation.ts
echo ""

echo "=== Test 3: Multi-format export helpers ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-3-format-helpers.ts
echo ""

echo "=== Test 4: APP_ prefix stripping ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-4-app-prefix-stripping.ts
echo ""

echo "=== Test 5: resolveEnvFile fallback logic ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-5-resolve-env-file.ts
echo ""

echo "=== Test 6: Executive loop loading order ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-6-executive-loop-loading.ts
echo ""

echo "=== Test 7: Worker spawner env file selection ==="
npx tsx tests/adhoc/2026-02-03-credential-tiers/test-7-worker-spawner-integration.ts
echo ""

echo "========================================"
echo "ALL CREDENTIAL TIER TESTS PASSED"
echo "========================================"
