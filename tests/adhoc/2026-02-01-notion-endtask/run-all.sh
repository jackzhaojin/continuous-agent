#!/bin/bash
# Run all notion-endtask adhoc tests
# Usage: bash tests/adhoc/2026-02-01-notion-endtask/run-all.sh
#
# Prerequisites:
#   - .env has NOTION_API_KEY and NOTION_DATABASE_ID
#   - Duration property exists in Notion DB (run setup-duration-raw.ts if needed)
#   - npm run build has been run (for SDK test importing dist/)
#
# Tests:
#   1. Structural — verify closeMilestone is wired into all paths (no API needed)
#   2. Live API — full lifecycle via raw Notion REST API
#   3. SDK — full lifecycle via compiled closeMilestone() function

set -e
cd "$(dirname "$0")/../../.."

echo "=== Test 1: Structural Wiring ==="
npx tsx tests/adhoc/2026-02-01-notion-endtask/test-structural-wiring.ts
echo ""

echo "=== Test 2: Live Notion API Lifecycle ==="
npx tsx tests/adhoc/2026-02-01-notion-endtask/test-live-close-milestone.ts
echo ""

echo "=== Test 3: SDK closeMilestone Integration ==="
npx tsx tests/adhoc/2026-02-01-notion-endtask/test-sdk-close-milestone.ts
echo ""

echo "======================================"
echo "ALL NOTION ENDTASK TESTS PASSED"
echo "======================================"
