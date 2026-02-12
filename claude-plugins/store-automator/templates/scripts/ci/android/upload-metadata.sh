#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "Google Play not ready. Skipping metadata upload."
  echo "Run check-readiness.sh for details."
  exit 0
fi

# --- Hash-based change detection ---
STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

HASH=$(find "$PROJECT_ROOT/fastlane/metadata" "$PROJECT_ROOT/fastlane/screenshots/android" \
  -type f 2>/dev/null | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d' ' -f1)
STATE_FILE="$STATE_DIR/android-metadata-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    echo "No changes in Android metadata or screenshots (hash: ${HASH:0:12}...). Skipping."
    exit 0
  fi
fi

echo "Changes detected in Android metadata (hash: ${HASH:0:12}...)"

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

# --- Upload metadata via Fastlane ---
echo "Uploading Android metadata..."

PACKAGE_NAME="$PACKAGE_NAME" \
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH" \
bundle exec fastlane upload_metadata_android

echo "Android metadata uploaded successfully"

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"
echo "Updated state hash: ${HASH:0:12}..."
