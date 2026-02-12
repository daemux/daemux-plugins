#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Helpers ---

# Export GOOGLE_PLAY_READY and persist to $GITHUB_ENV when in CI.
set_play_ready() {
  local value="$1"
  export GOOGLE_PLAY_READY="$value"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "GOOGLE_PLAY_READY=$value" >> "$GITHUB_ENV"
  fi
}

# Log an error, mark not-ready, and hard-fail.
fail_not_ready() {
  echo "ERROR: $1" >&2
  set_play_ready "false"
  exit 1
}

# --- Validate required config ---
if [ -z "${GOOGLE_SA_JSON_PATH:-}" ]; then
  fail_not_ready "GOOGLE_SA_JSON_PATH not set in ci.config.yaml"
fi

SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  fail_not_ready "Service account JSON not found at $SA_FULL_PATH"
fi

if [ -z "${PACKAGE_NAME:-}" ]; then
  fail_not_ready "PACKAGE_NAME not set in ci.config.yaml"
fi

# --- Set env vars for the Python script ---
export SA_JSON="$SA_FULL_PATH"
export PACKAGE_NAME

# --- Run the existing Python script ---
echo "Checking Google Play readiness for $PACKAGE_NAME..."
READINESS_JSON=$(python3 "$PROJECT_ROOT/scripts/check_google_play.py")

if [ -z "$READINESS_JSON" ]; then
  fail_not_ready "check_google_play.py returned empty output"
fi

echo "Readiness info: $READINESS_JSON"

# --- Parse JSON output (single invocation for both fields) ---
# Expected format: {"ready": true/false, "missing_steps": [...]}
PARSED=$(echo "$READINESS_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
ready = str(data.get('ready', False)).lower()
steps = data.get('missing_steps', [])
print(ready)
for s in steps:
    print(f'  - {s}')
")

# First line is the ready status; remaining lines are missing steps.
READY=$(echo "$PARSED" | head -n 1)
MISSING_STEPS=$(echo "$PARSED" | tail -n +2)

# --- Export result ---
set_play_ready "$READY"

# --- Print guidance if not ready ---
if [ "$READY" != "true" ]; then
  echo ""
  echo "============================================="
  echo "  Google Play is NOT ready for automation"
  echo "============================================="
  echo ""
  echo "Missing steps:"
  echo "$MISSING_STEPS"
  echo ""
  echo "To fix:"
  echo "  1. Go to Google Play Console: https://play.google.com/console"
  echo "  2. Ensure the app ($PACKAGE_NAME) has been manually created"
  echo "  3. Complete the store listing, content rating, and pricing"
  echo "  4. Upload at least one AAB manually for the first release"
  echo "  5. Grant the service account access to the app"
  echo ""
  echo "Google Play is NOT ready. CI cannot proceed."
  exit 1
else
  echo "Google Play is ready for automated publishing"
fi
