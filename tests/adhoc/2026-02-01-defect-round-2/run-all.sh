#!/bin/bash
# Run all terminology cleanup adhoc tests (round 2)
# Usage: bash tests/adhoc/2026-02-01-defect-round-2/run-all.sh

set -e
cd "$(dirname "$0")/../../.."

echo "=== Test 1: Type renames ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-1-type-renames.ts
echo ""

echo "=== Test 2: File renames ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-2-file-renames.ts
echo ""

echo "=== Test 3: Function renames ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-3-function-renames.ts
echo ""

echo "=== Test 4: Contract ID prefix ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-4-contract-id-prefix.ts
echo ""

echo "=== Test 5: Ledger normalization ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-5-ledger-normalization.ts
echo ""

echo "=== Test 6: CONTRACTS.jsonl writer ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-6-contracts-log-writer.ts
echo ""

echo "=== Test 7: STEPS.json backward compat ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-7-steps-json-backward-compat.ts
echo ""

echo "=== Test 8: Dual-write integration ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-8-dual-write-integration.ts
echo ""

echo "=== Test 9: Ledger field names ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-9-ledger-field-names.ts
echo ""

echo "=== Test 10: Log messages ==="
npx tsx tests/adhoc/2026-02-01-defect-round-2/test-10-log-messages.ts
echo ""

echo "=================================="
echo "ALL TERMINOLOGY CLEANUP TESTS DONE"
echo "=================================="
