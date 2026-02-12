#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "ERROR: Google Play not ready. Cannot update data safety." >&2
  exit 1
fi

# --- Check if data safety CSV exists ---
DATA_SAFETY_CSV="$PROJECT_ROOT/fastlane/data_safety.csv"
if [ ! -f "$DATA_SAFETY_CSV" ]; then
  echo "No data_safety.csv found at $DATA_SAFETY_CSV. Skipping."
  exit 0
fi

# --- Hash-based change detection ---
STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

HASH=$(shasum -a 256 "$DATA_SAFETY_CSV" | cut -d' ' -f1)
STATE_FILE="$STATE_DIR/android-data-safety-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    echo "No changes in data_safety.csv (hash: ${HASH:0:12}...). Skipping."
    exit 0
  fi
fi

echo "Changes detected in data safety config (hash: ${HASH:0:12}...)"

# --- Link fastlane directories ---
"$SCRIPT_DIR/../common/link-fastlane.sh" android

# --- Ensure fastlane is installed ---
cd "$APP_ROOT/android"
if ! bundle exec fastlane --version >/dev/null 2>&1; then
  "$SCRIPT_DIR/../common/install-fastlane.sh" android
fi

# --- Resolve service account path ---
SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  echo "ERROR: Service account JSON not found at $SA_FULL_PATH" >&2
  exit 1
fi

# --- Update data safety via Fastlane ---
echo "Updating Android data safety..."

PACKAGE_NAME="$PACKAGE_NAME" \
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH" \
DATA_SAFETY_CSV_PATH="$DATA_SAFETY_CSV" \
bundle exec fastlane update_data_safety

echo "Android data safety update complete"

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"
echo "Updated state hash: ${HASH:0:12}..."
