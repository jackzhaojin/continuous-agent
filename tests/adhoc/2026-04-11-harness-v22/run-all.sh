#!/usr/bin/env bash
# Run the full harness v2.2 test suite (unit + mock e2e).
#
# Usage:
#   tests/adhoc/2026-04-11-harness-v22/run-all.sh
#
# Exits non-zero if any test file fails. Does NOT hit any real LLM API —
# all orchestrator tests use a MockAgentWorkerProvider. For a live Claude
# run, invoke tests/e2e/harnesses/claude-live-generic.e2e.ts separately.

set -euo pipefail

cd "$(dirname "$0")/../../.."
ROOT="$(pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

tests=(
  "tests/adhoc/2026-04-11-harness-v22/unit-core.adhoc.ts"
  "tests/adhoc/2026-04-11-harness-v22/unit-state-and-mode.adhoc.ts"
  "tests/adhoc/2026-04-11-harness-v22/unit-loaders-and-config.adhoc.ts"
  "tests/e2e/harnesses/mock-generic-orchestrator.e2e.ts"
  "tests/e2e/harnesses/mock-eds-orchestrator.e2e.ts"
  "tests/e2e/harnesses/mock-study-orchestrator.e2e.ts"
  "tests/adhoc/validate-kimi-k2.5-harness.adhoc.ts"
  "tests/e2e/harnesses/vendor-auth-check.e2e.ts"
)

total_pass=0
total_fail=0
failed_files=()

for t in "${tests[@]}"; do
  echo -e "${YELLOW}▶ $t${NC}"
  if npx tsx "$ROOT/$t" > /tmp/harness-test-out.log 2>&1; then
    line=$(grep -E '^[0-9]+ passed' /tmp/harness-test-out.log | tail -1 || echo "")
    echo -e "${GREEN}  PASS${NC} — $line"
    if [[ "$line" =~ ^([0-9]+)\ passed,\ ([0-9]+)\ failed ]]; then
      total_pass=$((total_pass + ${BASH_REMATCH[1]}))
      total_fail=$((total_fail + ${BASH_REMATCH[2]}))
    fi
  else
    echo -e "${RED}  FAIL${NC}"
    cat /tmp/harness-test-out.log | tail -20
    failed_files+=("$t")
  fi
  echo ""
done

echo "================================================================"
echo -e "Total: ${GREEN}${total_pass} passed${NC}, ${RED}${total_fail} failed${NC}"
if [ ${#failed_files[@]} -gt 0 ]; then
  echo -e "${RED}Failed files:${NC}"
  for f in "${failed_files[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
echo -e "${GREEN}All harness v2.2 tests passed.${NC}"
