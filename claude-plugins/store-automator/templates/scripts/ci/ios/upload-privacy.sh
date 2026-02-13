#!/usr/bin/env bash
# Uploads Apple App Privacy declarations via fastlane.
# Requires Apple ID auth (not API key), so this typically runs locally.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== iOS App Privacy Upload ==="

# --- Check if privacy JSON exists ---
PRIVACY_JSON="$PROJECT_ROOT/fastlane/app_privacy_details.json"

if [ ! -f "$PRIVACY_JSON" ]; then
  ci_skip "No app_privacy_details.json found at $PRIVACY_JSON"
fi

echo "  Found: $PRIVACY_JSON"

# --- Privacy upload requires Apple ID auth (not API key) ---
if [ -z "${APPLE_ID:-}" ]; then
  echo "Skipping privacy upload: APPLE_ID not set (requires Apple ID auth, not API key)"
  echo "Run locally: cd fastlane/ios && bundle exec fastlane upload_privacy_ios"
  ci_skip "APPLE_ID not set (requires Apple ID auth)"
fi

# --- Export required env vars ---
export BUNDLE_ID="$BUNDLE_ID"

echo "Uploading App Privacy details for $BUNDLE_ID..."
cd "$PROJECT_ROOT/fastlane/ios"
bundle exec fastlane upload_privacy_ios

ci_done "App Privacy declarations uploaded to App Store Connect"
