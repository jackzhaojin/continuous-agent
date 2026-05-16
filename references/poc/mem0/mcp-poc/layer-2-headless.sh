#!/usr/bin/env bash
#
# Layer 2 — Headless agentic MCP verification
#
# Spawns `claude -p` (headless Claude Code) with the mem0 MCP server registered,
# gives the LLM a planning-style prompt that *should* require memory lookup,
# and captures the full transcript (including tool calls) to JSON.
#
# This proves the actual pattern the executive will use:
#   LLM + planning task → decides to call MCP search → reasons over result → answers.
#
# Pre-reqs:
#   - mem0 account, API key, graph mode enabled in dashboard
#   - SDK POC (graph-poc) has been run at least once to seed memories
#   - `claude` CLI on PATH
#   - `uvx` on PATH (for the mem0 MCP server)
#   - Repo .env.executive populated with V3_MEM0_API_KEY and V3_MEM0_USER_ID

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.executive"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[fatal] Missing $ENV_FILE" >&2
  exit 1
fi

# Load executive env, then alias V3_* vars to the names the mem0 MCP server expects.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export MEM0_API_KEY="${V3_MEM0_API_KEY:?V3_MEM0_API_KEY missing in .env.executive}"
export MEM0_DEFAULT_USER_ID="${V3_MEM0_USER_ID:?V3_MEM0_USER_ID missing in .env.executive}"

OUT_DIR="$SCRIPT_DIR/.poc-output"
mkdir -p "$OUT_DIR"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_FILE="$OUT_DIR/layer-2-run-$TIMESTAMP.json"

PROMPT='You have access to a mem0 second-brain memory system through MCP tools.

Task: using ONLY the memory tools (not your training data), answer:
  (a) What was decided about V3.0 second-brain hosting?
  (b) What entities are linked together in the memory graph?
  (c) What should be tested next, based on what the memories say?

For each fact, cite the memory id you used. If a search returns nothing, say so explicitly instead of guessing.

Search the scope user_id="'"$MEM0_DEFAULT_USER_ID"'" app_id="v3-mem0-graph-poc".'

echo "==> Running headless Claude Code with mem0 MCP..."
echo "    config:    $SCRIPT_DIR/.mcp.json"
echo "    user_id:   $MEM0_DEFAULT_USER_ID"
echo "    transcript: $OUT_FILE"
echo

cd "$SCRIPT_DIR"

claude -p \
  --mcp-config "$SCRIPT_DIR/.mcp.json" \
  --strict-mcp-config \
  --output-format json \
  --permission-mode acceptEdits \
  "$PROMPT" \
  | tee "$OUT_FILE"

echo
echo "==> Done. Transcript saved to $OUT_FILE"
echo
echo "Verify:"
echo "  - The transcript contains at least one tool_use block calling mem0__search_memories"
echo "  - The final assistant text cites memory ids from results (not hallucinated)"
echo "  - The (b) answer is grounded in retrieved memories. Hosted v3 mem0 has entity linking"
echo "    baked in (no toggle) so an empty relations[] is expected — verify the answer uses"
echo "    actual search results rather than the LLM's prior knowledge."
