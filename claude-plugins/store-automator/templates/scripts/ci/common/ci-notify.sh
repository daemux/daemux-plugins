#!/usr/bin/env bash
set -euo pipefail

# Shared CI notification helpers for GitHub Actions.
# Source this file; then call ci_skip or ci_done.

STEP_NAME="${STEP_NAME:-$(basename "${BASH_SOURCE[1]:-$0}" .sh)}"

_ci_summary_row() {
  local status="$1" detail="$2"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "| ${STEP_NAME} | ${status} | ${detail} |" >> "$GITHUB_STEP_SUMMARY"
  fi
}

_ci_output() {
  local key="$1" value="$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "${key}=${value}" >> "$GITHUB_OUTPUT"
  fi
}

ci_skip() {
  local reason="${1:-skipped}"
  echo "::warning::${STEP_NAME}: ${reason}"
  _ci_summary_row "Skipped" "$reason"
  _ci_output "status" "skipped"
  echo "[SKIP] ${STEP_NAME}: ${reason}"
  exit 0
}

ci_done() {
  local message="${1:-done}"
  echo "::notice::${STEP_NAME}: ${message}"
  _ci_summary_row "Done" "$message"
  _ci_output "status" "done"
  echo "[DONE] ${STEP_NAME}: ${message}"
  exit 0
}
