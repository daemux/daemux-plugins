#!/usr/bin/env bash
# Requires link-fastlane.sh and install-fastlane.sh to have run first (workflow steps).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "ERROR: Google Play not ready. Cannot update data safety." >&2
  exit 1
fi

# --- Check if data safety CSV exists ---
DATA_SAFETY_CSV="$PROJECT_ROOT/fastlane/data_safety.csv"
if [ ! -f "$DATA_SAFETY_CSV" ]; then
  ci_skip "No data safety CSV found"
fi

# --- Hash-based change detection ---
STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

HASH=$(shasum -a 256 "$DATA_SAFETY_CSV" | cut -d' ' -f1)
STATE_FILE="$STATE_DIR/android-data-safety-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    ci_skip "Data safety CSV unchanged since last upload"
  fi
fi

echo "Changes detected in data safety config (hash: ${HASH:0:12}...)"

# --- Resolve service account path ---
SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  echo "ERROR: Service account JSON not found at $SA_FULL_PATH" >&2
  exit 1
fi

# --- Update data safety via Python script ---
# Exit codes: 0 = success, 2 = API limitation (manual update needed), other = error
echo "Updating Android data safety..."

set +e
PACKAGE_NAME="$PACKAGE_NAME" \
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH" \
python3 "$PROJECT_ROOT/scripts/update_data_safety.py" "$DATA_SAFETY_CSV"
SAFETY_EXIT=$?
set -e

if [ $SAFETY_EXIT -eq 0 ]; then
  echo "$HASH" > "$STATE_FILE"
  ci_done "Data safety section updated"
elif [ $SAFETY_EXIT -eq 2 ]; then
  # API limitation is non-fatal; hash is NOT saved so the step retries next run
  ci_skip "API limitation — update manually via Google Play Console (will retry next run)"
else
  echo "ERROR: Data safety update failed (exit code: $SAFETY_EXIT)" >&2
  exit $SAFETY_EXIT
fi
