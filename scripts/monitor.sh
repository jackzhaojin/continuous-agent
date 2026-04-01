#!/usr/bin/env bash

set -euo pipefail
shopt -s nullglob

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REFRESH_SECONDS="${1:-30}"

if ! [[ "$REFRESH_SECONDS" =~ ^[0-9]+$ ]] || [ "$REFRESH_SECONDS" -lt 1 ]; then
  echo "Usage: scripts/monitor.sh [refresh_seconds]" >&2
  exit 1
fi

latest_exec_log() {
  ls -1t ledgers/executive-*.log 2>/dev/null | head -1
}

latest_goal_started() {
  tail -n 200 ledgers/work-ledger.jsonl 2>/dev/null | rg '"event":"GOAL_STARTED"' | tail -1
}

extract_json_field() {
  local line="$1"
  local field="$2"
  printf '%s\n' "$line" | sed -nE "s/.*\"$field\":\"([^\"]+)\".*/\\1/p"
}

active_output_path() {
  local exec_log="$1"
  [ -n "$exec_log" ] || return 0
  tail -n 200 "$exec_log" 2>/dev/null \
    | rg 'Output path:' \
    | tail -1 \
    | sed -E 's/.*Output path: ([^(]+).*/\1/' \
    | sed 's/[[:space:]]*$//'
}

render_recent_activity() {
  local output_path="$1"
  local roots=("ledgers" "workspace")

  if [ -n "$output_path" ] && [ -d "$output_path" ]; then
    roots+=("$output_path")
  fi

  find "${roots[@]}" \
    \( -path '*/node_modules/*' -o -path '*/dist/*' -o -path '*/.git/*' -o -path '*/.vite/*' \) -prune -o \
    -type f -exec stat -f '%m %Sm %N' -t '%H:%M:%S' {} + 2>/dev/null \
    | sort -nr \
    | head -15 \
    | awk '{ ts=$2; $1=""; $2=""; sub(/^  */, ""); print ts "  " $0 }'
}

while true; do
  clear

  ts="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  exec_log="$(latest_exec_log)"
  active_start="$(latest_goal_started)"
  active_contract="$(extract_json_field "$active_start" "contract_id")"
  active_goal="$(extract_json_field "$active_start" "title")"
  output_path="$(active_output_path "$exec_log")"
  worker_log=""

  if [ -n "$active_contract" ]; then
    worker_log="$(ls -1 ledgers/*/worker-"$active_contract".log 2>/dev/null | head -1)"
  fi

  echo "CONTINUOUS AGENT MONITOR  $ts"
  echo "Refresh: ${REFRESH_SECONDS}s | Mode: read-only"
  echo

  echo "[PROCESS]"
  pm2 status
  echo

  echo "[ACTIVE]"
  echo "Goal: ${active_goal:-unknown}"
  echo "Contract: ${active_contract:-unknown}"
  echo "Output: ${output_path:-unknown}"
  echo "Worker log: ${worker_log:-none}"
  echo

  echo "[REPO CHANGES]"
  git status --short
  echo

  echo "[RECENT FILE ACTIVITY]"
  render_recent_activity "$output_path"
  echo

  echo "[EXECUTIVE TAIL]"
  if [ -n "$exec_log" ]; then
    tail -n 8 "$exec_log"
  else
    echo "no executive log"
  fi
  echo

  echo "[WORK LEDGER TAIL]"
  tail -n 6 ledgers/work-ledger.jsonl 2>/dev/null || true
  echo

  echo "[WORKER TAIL]"
  if [ -n "$worker_log" ] && [ -f "$worker_log" ]; then
    tail -n 8 "$worker_log"
  else
    echo "no worker log"
  fi

  sleep "$REFRESH_SECONDS"
done
