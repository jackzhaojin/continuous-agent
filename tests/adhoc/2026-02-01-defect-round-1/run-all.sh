#!/bin/bash
# Run all defect round 1 adhoc tests
# Usage: bash tests/adhoc/2026-02-01-defect-round-1/run-all.sh

set -e
cd "$(dirname "$0")/../../.."

echo "=== Fix #1: needs-you.md regex ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix1-needs-you-regex.ts
echo ""

echo "=== Fix #2: Step dependencies ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix2-step-dependencies.ts
echo ""

echo "=== Fix #3: Step failure Notion reporting ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix3-step-failure-notion.ts
echo ""

echo "=== Fix #4: Retry persistence ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix4-retry-persistence.ts
echo ""

echo "=== Fix #5: Verifier path logging ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix5-verifier-logging.ts
echo ""

echo "=== Fix #6: Feature extraction quality ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix6-feature-extraction.ts
echo ""

echo "=== Fix #7: Housekeep bundles ==="
npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix7-housekeep-bundles.ts
echo ""

echo "=============================="
echo "ALL DEFECT ROUND 1 TESTS DONE"
echo "=============================="
