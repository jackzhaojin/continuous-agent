#!/usr/bin/env bash
#
# run-verifier.sh - Execute verifier definitions and report results
#
# Usage: ./run-verifier.sh <verifier_id> <project_root> [param=value ...]
#
# Examples:
#   ./run-verifier.sh git-status-clean /path/to/project
#   ./run-verifier.sh files-exist /path/to/project file_list="package.json README.md"
#

set -uo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFINITIONS_DIR="${SCRIPT_DIR}/definitions"
RESULTS_DIR="${SCRIPT_DIR}/results"

# Global for yq availability
USE_YQ=false

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Show usage
usage() {
    echo "Usage: $0 <verifier_id> <project_root> [param=value ...]"
    echo ""
    echo "Arguments:"
    echo "  verifier_id    ID of the verifier to run (e.g., git-status-clean)"
    echo "  project_root   Path to the project to verify"
    echo "  param=value    Optional parameters for the verifier"
    echo ""
    echo "Available verifiers:"
    if [ -d "$DEFINITIONS_DIR" ]; then
        for f in "$DEFINITIONS_DIR"/*.yml; do
            if [ -f "$f" ]; then
                basename "$f" .yml
            fi
        done
    fi
    echo ""
    echo "Examples:"
    echo "  $0 git-status-clean /path/to/project"
    echo "  $0 files-exist /path/to/project file_list=\"package.json README.md\""
    exit 1
}

# Check for required tools
check_requirements() {
    # Check for yq (YAML parser) or use grep fallback
    if command -v yq &> /dev/null; then
        USE_YQ=true
    else
        log_warning "yq not found, using grep-based YAML parsing (limited)"
        USE_YQ=false
    fi
}

# Parse YAML value using yq or grep
parse_yaml_value() {
    local file="$1"
    local key="$2"

    if [ "$USE_YQ" = true ]; then
        yq -r ".$key // empty" "$file" 2>/dev/null || echo ""
    else
        # Fallback: simple grep-based extraction for top-level keys
        grep "^${key}:" "$file" 2>/dev/null | sed "s/^${key}:[[:space:]]*//" | sed 's/^"//' | sed 's/"$//' || echo ""
    fi
}

# Parse multi-line command from YAML
parse_yaml_command() {
    local file="$1"

    if [ "$USE_YQ" = true ]; then
        yq -r '.command // empty' "$file" 2>/dev/null || echo ""
    else
        # Fallback: extract command block (handles | multiline)
        awk '/^command:/{found=1; if($2 == "|") {getline; while(/^  / || /^$/) {sub(/^  /,""); print; getline}} else {sub(/^command:[[:space:]]*/,""); print}}' "$file"
    fi
}

# Main execution
main() {
    # Check arguments
    if [ $# -lt 2 ]; then
        usage
    fi

    local verifier_id="$1"
    local project_root="$2"
    shift 2

    # Store parameters in a temp file for portability (avoid associative arrays)
    local params_file=$(mktemp)
    trap "rm -f $params_file" EXIT

    # Parse additional parameters into temp file
    for arg in "$@"; do
        if [[ "$arg" =~ ^([^=]+)=(.*)$ ]]; then
            echo "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}" >> "$params_file"
        fi
    done

    # Check requirements
    check_requirements

    # Find definition file
    local definition_file="${DEFINITIONS_DIR}/${verifier_id}.yml"
    if [ ! -f "$definition_file" ]; then
        log_error "Verifier definition not found: $definition_file"
        exit 1
    fi

    # Validate project root
    if [ ! -d "$project_root" ]; then
        log_error "Project root does not exist: $project_root"
        exit 1
    fi

    # Resolve to absolute path
    project_root="$(cd "$project_root" && pwd)"

    # Create results directory
    mkdir -p "$RESULTS_DIR"

    # Generate result file name
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local result_file="${RESULTS_DIR}/${verifier_id}_${timestamp}.log"
    local json_result="${RESULTS_DIR}/${verifier_id}_${timestamp}.json"

    # Parse definition
    log_info "Loading verifier: $verifier_id"
    local description=$(parse_yaml_value "$definition_file" "description")
    local timeout_seconds=$(parse_yaml_value "$definition_file" "timeout_seconds")
    local command=$(parse_yaml_command "$definition_file")

    # Default timeout
    timeout_seconds="${timeout_seconds:-60}"

    log_info "Description: $description"
    log_info "Project: $project_root"
    log_info "Timeout: ${timeout_seconds}s"

    # Substitute variables in command
    command="${command//\$\{project_root\}/$project_root}"

    # Substitute parameters from file and export them
    local params_json="{"
    local first_param=true
    while IFS='=' read -r key value; do
        if [ -n "$key" ]; then
            # Substitute in command
            command="${command//\$\{$key\}/$value}"
            command="${command//\$$key/$value}"
            # Export as environment variable
            export "$key"="$value"
            # Build JSON
            if [ "$first_param" = true ]; then
                first_param=false
            else
                params_json="${params_json},"
            fi
            params_json="${params_json}\"$key\":\"$value\""
        fi
    done < "$params_file"
    params_json="${params_json}}"

    # Record start time
    local start_time=$(date +%s)
    local start_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Execute command
    log_info "Executing verifier..."
    echo "========================================" > "$result_file"
    echo "Verifier: $verifier_id" >> "$result_file"
    echo "Project: $project_root" >> "$result_file"
    echo "Started: $start_iso" >> "$result_file"
    echo "========================================" >> "$result_file"
    echo "" >> "$result_file"

    local exit_code=0
    local output=""

    # Run with timeout
    set +e
    if command -v timeout &> /dev/null; then
        output=$(cd "$project_root" && timeout "${timeout_seconds}s" bash -c "$command" 2>&1)
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            output="${output}"$'\n'"ERROR: Command timed out after ${timeout_seconds} seconds"
        fi
    elif command -v gtimeout &> /dev/null; then
        # macOS with coreutils
        output=$(cd "$project_root" && gtimeout "${timeout_seconds}s" bash -c "$command" 2>&1)
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            output="${output}"$'\n'"ERROR: Command timed out after ${timeout_seconds} seconds"
        fi
    else
        # No timeout available, run directly
        output=$(cd "$project_root" && bash -c "$command" 2>&1)
        exit_code=$?
    fi
    set -e

    # Record end time
    local end_time=$(date +%s)
    local end_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local duration=$((end_time - start_time))

    # Write output to log
    echo "$output" >> "$result_file"
    echo "" >> "$result_file"
    echo "========================================" >> "$result_file"
    echo "Exit Code: $exit_code" >> "$result_file"
    echo "Duration: ${duration}s" >> "$result_file"
    echo "Completed: $end_iso" >> "$result_file"
    echo "========================================" >> "$result_file"

    # Determine pass/fail
    local status="PASS"
    local status_reason=""

    if [ $exit_code -ne 0 ]; then
        status="FAIL"
        status_reason="Exit code was $exit_code (expected 0)"
    fi

    # Check for error patterns in output (basic check)
    if [ "$status" = "PASS" ]; then
        if echo "$output" | grep -qi "^ERROR:"; then
            status="FAIL"
            status_reason="Output contains ERROR"
        fi
    fi

    # Calculate output stats
    local output_lines=$(echo "$output" | wc -l | tr -d ' ')
    local output_bytes=$(echo "$output" | wc -c | tr -d ' ')

    # Generate JSON result
    cat > "$json_result" << EOF
{
  "verifier_id": "$verifier_id",
  "version": "1.0",
  "project_root": "$project_root",
  "status": "$status",
  "exit_code": $exit_code,
  "duration_seconds": $duration,
  "started_at": "$start_iso",
  "completed_at": "$end_iso",
  "status_reason": "$status_reason",
  "log_file": "$result_file",
  "parameters": $params_json,
  "evidence": {
    "output_lines": $output_lines,
    "output_bytes": $output_bytes
  }
}
EOF

    # Print result
    echo ""
    echo "========================================"
    if [ "$status" = "PASS" ]; then
        log_success "Verifier: $verifier_id"
        echo -e "${GREEN}Status: PASS${NC}"
    else
        log_error "Verifier: $verifier_id"
        echo -e "${RED}Status: FAIL${NC}"
        if [ -n "$status_reason" ]; then
            echo -e "${RED}Reason: $status_reason${NC}"
        fi
    fi
    echo "Duration: ${duration}s"
    echo "Log: $result_file"
    echo "JSON: $json_result"
    echo "========================================"

    # Print evidence summary
    echo ""
    echo "=== Evidence Summary ==="
    echo "Output preview (last 10 lines):"
    echo "$output" | tail -10
    echo ""

    # Return appropriate exit code
    if [ "$status" = "PASS" ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main
main "$@"
