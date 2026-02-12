#!/usr/bin/env bash
# Requires link-fastlane.sh and install-fastlane.sh to have run first (workflow steps).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== iOS Metadata & Screenshots Upload ==="

# --- Check preconditions ---
METADATA_DIR="$PROJECT_ROOT/fastlane/metadata"
SCREENSHOTS_DIR="$PROJECT_ROOT/fastlane/screenshots/ios"

if [ ! -d "$METADATA_DIR" ] && [ ! -d "$SCREENSHOTS_DIR" ]; then
  ci_skip "No iOS metadata directories found"
fi

for dir in "$METADATA_DIR" "$SCREENSHOTS_DIR"; do
  [ -d "$dir" ] && echo "  Found: $dir"
done

# --- Validate Apple credentials ---
if [ -z "$P8_KEY_PATH" ] || [ -z "$APPLE_KEY_ID" ] || [ -z "$APPLE_ISSUER_ID" ]; then
  echo "ERROR: Apple credentials not configured in ci.config.yaml" >&2
  exit 1
fi

P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

# --- Set up Fastlane environment ---
export FASTLANE_API_KEY_PATH="$P8_FULL_PATH"
export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export FASTLANE_ENABLE_BETA_DELIVER_SYNC_SCREENSHOTS=1

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

# --- Run upload ---
echo "Uploading iOS metadata and screenshots..."
cd "$APP_ROOT/ios"

bundle exec fastlane upload_metadata_ios

ci_done "iOS metadata uploaded to App Store Connect"
