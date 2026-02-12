#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "ERROR: Google Play not ready. Cannot sync IAPs." >&2
  exit 1
fi

# --- Check if IAP config exists ---
IAP_CONFIG="$PROJECT_ROOT/fastlane/iap_config.json"
if [ ! -f "$IAP_CONFIG" ]; then
  echo "No iap_config.json found at $IAP_CONFIG. Skipping IAP sync."
  exit 0
fi

# --- Check if IAP plugin is available ---
cd "$APP_ROOT/android"
if ! bundle exec gem list fastlane-plugin-iap --installed; then
  echo "ERROR: fastlane-plugin-iap not installed." >&2
  echo "To enable: add it to app/android/Pluginfile and run 'bundle install'." >&2
  exit 1
fi

# --- Hash-based change detection ---
STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

HASH=$(shasum -a 256 "$IAP_CONFIG" | cut -d' ' -f1)
STATE_FILE="$STATE_DIR/android-iap-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    echo "No changes in iap_config.json (hash: ${HASH:0:12}...). Skipping."
    exit 0
  fi
fi

echo "Changes detected in IAP config (hash: ${HASH:0:12}...)"

# --- Resolve service account path ---
SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  echo "ERROR: Service account JSON not found at $SA_FULL_PATH" >&2
  exit 1
fi

# --- Sync IAP via Fastlane ---
echo "Syncing Android IAP configuration..."

PACKAGE_NAME="$PACKAGE_NAME" \
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH" \
bundle exec fastlane sync_google_iap

echo "Android IAP sync complete"

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"
echo "Updated state hash: ${HASH:0:12}..."
