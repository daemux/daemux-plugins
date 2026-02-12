#!/usr/bin/env bash
# Syncs iOS IAPs to App Store Connect via direct API calls (Python script).
# Requires read-config.sh to have been sourced (provides PROJECT_ROOT, credentials, etc.).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== iOS IAP Sync ==="

# --- Check if IAP config file exists ---
IAP_CONFIG="$PROJECT_ROOT/fastlane/iap_config.json"

if [ ! -f "$IAP_CONFIG" ]; then
  ci_skip "No iOS IAP config file found"
fi

# --- Hash-based change detection ---
CURRENT_HASH=$(shasum -a 256 "$IAP_CONFIG" | cut -d' ' -f1)

STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/ios-iap-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$CURRENT_HASH" = "$STORED_HASH" ]; then
    ci_skip "iOS IAP config unchanged since last sync"
  fi
  echo "IAP config changed (old: ${STORED_HASH:0:12}..., new: ${CURRENT_HASH:0:12}...)"
else
  echo "No cached hash found. First run — will sync IAPs."
fi

# --- Set up App Store Connect API credentials ---
P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY="$(cat "$P8_FULL_PATH")"
export BUNDLE_ID="$BUNDLE_ID"

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

# --- Run IAP sync via Python ---
SYNC_SCRIPT="$PROJECT_ROOT/scripts/sync_iap_ios.py"

if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "ERROR: sync_iap_ios.py not found at $SYNC_SCRIPT" >&2
  exit 1
fi

echo "Syncing IAPs to App Store Connect..."
python3 "$SYNC_SCRIPT" "$IAP_CONFIG"

# --- Update hash on success ---
echo "$CURRENT_HASH" > "$STATE_FILE"
ci_done "iOS IAP synced to App Store Connect"
