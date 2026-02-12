#!/usr/bin/env bash
set -euo pipefail

# Content-based change detection using SHA256 hashes.
# Stores hashes in .ci-state/ directory (gitignored).
# Exit 0 = changed (or first run) -> proceed with work
# Exit 1 = unchanged -> skip work
#
# Usage: scripts/ci/common/check-changed.sh <directory-path> [--use-cache]
#
# Hash update pattern:
#   1. Call check-changed.sh <path> -- if exit 1, skip.
#   2. Do the work (upload, sync, etc.)
#   3. On success: mv .ci-state/<key>.hash.pending .ci-state/<key>.hash
#   4. On failure: leave .pending file (next run will see change again)

USE_CACHE=false
TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --use-cache) USE_CACHE=true ;;
    *) TARGET="$1" ;;
  esac
  shift
done

if [ -z "$TARGET" ]; then
  echo "Usage: check-changed.sh <directory-path> [--use-cache]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

# When running locally without --use-cache, always report changed
if [ -z "${CI:-}" ] && [ "$USE_CACHE" = "false" ]; then
  echo "Local mode (no --use-cache): reporting changed"
  exit 0
fi

# Generate a safe filename from the target path
STATE_KEY=$(echo "$TARGET" | sed 's/[^a-zA-Z0-9]/_/g')
STATE_FILE="$STATE_DIR/$STATE_KEY.hash"

# Check if any files exist before hashing
FILE_COUNT=$(find "$PROJECT_ROOT/$TARGET" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$FILE_COUNT" -eq 0 ]; then
  echo "No files found matching '$TARGET'. Reporting changed (first run)."
  exit 0
fi

# Compute current content hash using a direct pipeline.
# NOTE: Using `while read` to safely handle filenames with spaces.
CURRENT_HASH=$(
  find "$PROJECT_ROOT/$TARGET" -type f 2>/dev/null | sort \
    | while IFS= read -r file; do shasum -a 256 "$file"; done \
    | shasum -a 256 | cut -d' ' -f1
)

# Compare with stored hash
if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$CURRENT_HASH" = "$STORED_HASH" ]; then
    echo "No changes detected for '$TARGET' (hash: ${CURRENT_HASH:0:12}...)"
    exit 1
  fi
fi

echo "Changes detected for '$TARGET' (hash: ${CURRENT_HASH:0:12}...)"
echo "$CURRENT_HASH" > "$STATE_FILE.pending"
exit 0
