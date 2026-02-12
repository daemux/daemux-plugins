#!/usr/bin/env bash
# Requires link-fastlane.sh and install-fastlane.sh to have run first (workflow steps).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
source "$COMMON_DIR/read-config.sh"
source "$COMMON_DIR/ci-notify.sh"

echo "=== iOS IAP Sync ==="

# ── Step 1: Check if IAP config file exists ──
IAP_CONFIG="$PROJECT_ROOT/fastlane/iap_config.json"

if [ ! -f "$IAP_CONFIG" ]; then
  ci_skip "No iOS IAP config file found"
fi

# ── Step 2: Check if IAP plugin is available ──
cd "$APP_ROOT/ios"

if ! bundle exec gem list fastlane-plugin-iap --installed >/dev/null 2>&1; then
  ci_skip "fastlane-plugin-iap not installed"
fi

echo "fastlane-plugin-iap is installed. Proceeding with sync."

# ── Step 4: Hash-based change detection ──
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

# ── Step 3: Set up App Store Connect API key ──
P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

export APP_STORE_CONNECT_API_KEY_KEY_ID="$APPLE_KEY_ID"
export APP_STORE_CONNECT_API_KEY_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_API_KEY_KEY="$(cat "$P8_FULL_PATH")"
export APP_STORE_CONNECT_API_KEY_IS_KEY_CONTENT_BASE64="false"

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

# ── Step 4: Run IAP sync ──
echo "Syncing IAPs to App Store Connect..."

cd "$APP_ROOT/ios"

FASTLANE_API_KEY_PATH="$P8_FULL_PATH" \
BUNDLE_ID="$BUNDLE_ID" \
bundle exec fastlane sync_iap

# ── Step 5: Update hash on success ──
echo "$CURRENT_HASH" > "$STATE_FILE"
ci_done "iOS IAP synced to App Store Connect"
