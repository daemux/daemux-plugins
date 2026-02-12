#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
source "$COMMON_DIR/read-config.sh"

echo "=== iOS IAP Sync ==="

# ── Step 1: Check if IAP config file exists ──
IAP_CONFIG="$PROJECT_ROOT/fastlane/iap_config.json"

if [ ! -f "$IAP_CONFIG" ]; then
  echo "No IAP config found at $IAP_CONFIG. Skipping IAP sync."
  exit 0
fi

# ── Step 2: Install Fastlane (needed to check plugin availability) ──
"$COMMON_DIR/install-fastlane.sh" ios

# ── Step 3: Check if IAP plugin is available ──
cd "$APP_ROOT/ios"

if ! bundle exec gem list fastlane-plugin-iap --installed >/dev/null 2>&1; then
  echo "WARNING: fastlane-plugin-iap not installed. Skipping IAP sync."
  echo "To enable: add 'fastlane-plugin-iap' to $APP_ROOT/ios/Gemfile and run 'bundle install'."
  exit 0
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
    echo "IAP config unchanged (hash: ${CURRENT_HASH:0:12}...). Skipping sync."
    exit 0
  fi
  echo "IAP config changed (old: ${STORED_HASH:0:12}..., new: ${CURRENT_HASH:0:12}...)"
else
  echo "No cached hash found. First run — will sync IAPs."
fi

# ── Step 5: Setup Fastlane symlink and build dir ──
"$COMMON_DIR/link-fastlane.sh" ios

# ── Step 6: Set up App Store Connect API key ──
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

# ── Step 7: Run IAP sync ──
echo "Syncing IAPs to App Store Connect..."

cd "$APP_ROOT/ios"

FASTLANE_API_KEY_PATH="$P8_FULL_PATH" \
BUNDLE_ID="$BUNDLE_ID" \
bundle exec fastlane sync_iap

# ── Step 8: Update hash on success ──
echo "$CURRENT_HASH" > "$STATE_FILE"
echo "IAP sync successful. Hash cached: ${CURRENT_HASH:0:12}..."

echo "=== iOS IAP Sync Complete ==="
