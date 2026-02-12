#!/usr/bin/env bash
set -euo pipefail

# Reads values from ci.config.yaml using yq and exports them as environment variables.
# Usage: source scripts/ci/common/read-config.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
export PROJECT_ROOT

CONFIG="$PROJECT_ROOT/ci.config.yaml"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: ci.config.yaml not found at $CONFIG" >&2
  exit 1
fi

if ! command -v yq &>/dev/null; then
  echo "ERROR: yq is not installed. Install with: brew install yq" >&2
  exit 1
fi

# App root
export FLUTTER_ROOT=$(yq '.flutter_root // "."' "$CONFIG")
export APP_ROOT="$PROJECT_ROOT/$FLUTTER_ROOT"

# App identity
export BUNDLE_ID=$(yq '.app.bundle_id // ""' "$CONFIG")
export PACKAGE_NAME=$(yq '.app.package_name // ""' "$CONFIG")
export APP_NAME=$(yq '.app.name // ""' "$CONFIG")
export SKU=$(yq '.app.sku // ""' "$CONFIG")
export APPLE_ID=$(yq '.app.apple_id // ""' "$CONFIG")

# Credentials - Apple
export P8_KEY_PATH=$(yq '.credentials.apple.p8_key_path // ""' "$CONFIG")
export APPLE_KEY_ID=$(yq '.credentials.apple.key_id // ""' "$CONFIG")
export APPLE_ISSUER_ID=$(yq '.credentials.apple.issuer_id // ""' "$CONFIG")

# Credentials - Google
export GOOGLE_SA_JSON_PATH=$(yq '.credentials.google.service_account_json_path // ""' "$CONFIG")

# Credentials - Android signing
export KEYSTORE_PASSWORD=$(yq '.credentials.android.keystore_password // ""' "$CONFIG")

# Credentials - Match (iOS code signing)
export MATCH_GIT_URL=$(yq '.credentials.match.git_url // ""' "$CONFIG")
export MATCH_DEPLOY_KEY_PATH=$(yq '.credentials.match.deploy_key_path // ""' "$CONFIG")

# iOS App Store settings
export PRIMARY_CATEGORY=$(yq '.ios.primary_category // ""' "$CONFIG")
export SECONDARY_CATEGORY=$(yq '.ios.secondary_category // ""' "$CONFIG")
export PRICE_TIER=$(yq '.ios.price_tier // ""' "$CONFIG")
export SUBMIT_FOR_REVIEW=$(yq '.ios.submit_for_review // "false"' "$CONFIG")
export AUTOMATIC_RELEASE=$(yq '.ios.automatic_release // "false"' "$CONFIG")

# Android Play Store settings
export TRACK=$(yq '.android.track // "internal"' "$CONFIG")
export ROLLOUT_FRACTION=$(yq '.android.rollout_fraction // ""' "$CONFIG")
export IN_APP_UPDATE_PRIORITY=$(yq '.android.in_app_update_priority // "0"' "$CONFIG")

# Web
export WEB_DOMAIN=$(yq '.web.domain // ""' "$CONFIG")

echo "Config loaded from $CONFIG"
echo "  APP_ROOT=$APP_ROOT"
echo "  BUNDLE_ID=$BUNDLE_ID"
echo "  PACKAGE_NAME=$PACKAGE_NAME"
