#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Validate prerequisites ---
if [ -z "$BUNDLE_ID" ]; then
  echo "ERROR: BUNDLE_ID not set in ci.config.yaml" >&2
  exit 1
fi

if [ -z "$P8_KEY_PATH" ] || [ -z "$APPLE_KEY_ID" ] || [ -z "$APPLE_ISSUER_ID" ]; then
  echo "ERROR: Apple credentials not configured in ci.config.yaml" >&2
  exit 1
fi

P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

# --- Setup Fastlane ---
"$SCRIPT_DIR/../common/link-fastlane.sh" ios
"$SCRIPT_DIR/../common/install-fastlane.sh" ios

# --- Set up Fastlane environment ---
export FASTLANE_API_KEY_PATH="$P8_FULL_PATH"
export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY
APP_STORE_CONNECT_PRIVATE_KEY=$(cat "$P8_FULL_PATH")

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

# --- Upload via Fastlane ---
echo "Uploading IPA to App Store Connect..."
cd "$APP_ROOT/ios"

bundle exec fastlane upload_binary_ios

echo "iOS binary upload complete"
