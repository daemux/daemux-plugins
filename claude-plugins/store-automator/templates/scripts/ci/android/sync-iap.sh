#!/usr/bin/env bash
# Syncs Android IAPs to Google Play via direct API calls (Python script).
# Requires read-config.sh to have been sourced (provides PROJECT_ROOT, credentials, etc.).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== Android IAP Sync ==="

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "ERROR: Google Play not ready. Cannot sync IAPs." >&2
  exit 1
fi

# --- Check if IAP config exists ---
IAP_CONFIG="$PROJECT_ROOT/fastlane/iap_config.json"
if [ ! -f "$IAP_CONFIG" ]; then
  ci_skip "No Android IAP config file found"
fi

# --- Hash-based change detection (config + Python scripts) ---
STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

HASH=$(cat "$IAP_CONFIG" \
  "$PROJECT_ROOT/scripts/sync_iap_android.py" \
  "$PROJECT_ROOT/scripts/gplay_iap_api.py" \
  | shasum -a 256 | cut -d' ' -f1)
STATE_FILE="$STATE_DIR/android-iap-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    ci_skip "Android IAP config unchanged since last sync"
  fi
fi

echo "Changes detected in IAP config (hash: ${HASH:0:12}...)"

# --- Resolve service account path ---
SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  echo "ERROR: Service account JSON not found at $SA_FULL_PATH" >&2
  exit 1
fi

# --- Run IAP sync via Python ---
SYNC_SCRIPT="$PROJECT_ROOT/scripts/sync_iap_android.py"

if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "ERROR: sync_iap_android.py not found at $SYNC_SCRIPT" >&2
  exit 1
fi

echo "Syncing Android IAP configuration..."

SA_JSON="$SA_FULL_PATH" \
PACKAGE_NAME="$PACKAGE_NAME" \
python3 "$SYNC_SCRIPT" "$IAP_CONFIG"

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"

ci_done "Android IAP synced to Google Play"
