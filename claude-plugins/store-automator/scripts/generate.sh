#!/bin/bash
set -euo pipefail

# Usage: ./scripts/generate.sh [path/to/ci.config.yaml]
# Generates codemagic.yaml in the current directory from codemagic.template.yaml

CONFIG="${1:-ci.config.yaml}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/.."
TEMPLATE="$TEMPLATE_DIR/codemagic.template.yaml"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: $CONFIG not found"
  exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
  TEMPLATE="ci-templates/codemagic.template.yaml"
  if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: codemagic.template.yaml not found"
    exit 1
  fi
fi

if ! command -v yq &>/dev/null; then
  echo "ERROR: yq is required. Install with: brew install yq"
  exit 1
fi

# Validate that a config value does not contain characters that break sed
validate_value() {
  local name="$1"
  local value="$2"
  if [[ "$value" =~ [|/\\] ]]; then
    echo "ERROR: $name contains invalid characters (|, /, or \\) that would break substitution."
    echo "  Current value: $value"
    echo "  Please remove |, /, and \\ characters from $name in $CONFIG"
    exit 1
  fi
}

# Read app values from ci.config.yaml
BUNDLE_ID=$(yq -r '.app.bundle_id' "$CONFIG")
PACKAGE_NAME=$(yq -r '.app.package_name' "$CONFIG")
APP_NAME=$(yq -r '.app.name' "$CONFIG")
SKU=$(yq -r '.app.sku' "$CONFIG")
APPLE_ID=$(yq -r '.app.apple_id' "$CONFIG")
TRACK=$(yq -r '.android.track' "$CONFIG")
ROLLOUT=$(yq -r '.android.rollout_fraction' "$CONFIG")
UPDATE_PRIORITY=$(yq -r '.android.in_app_update_priority' "$CONFIG")
PRIMARY_CAT=$(yq -r '.ios.primary_category' "$CONFIG")
SECONDARY_CAT=$(yq -r '.ios.secondary_category' "$CONFIG")
PRICE_TIER=$(yq -r '.ios.price_tier' "$CONFIG")
SUBMIT_REVIEW=$(yq -r '.ios.submit_for_review' "$CONFIG")
AUTO_RELEASE=$(yq -r '.ios.automatic_release' "$CONFIG")

# Read flutter_root (defaults to "." if not set)
APP_ROOT=$(yq -r '.flutter_root // "."' "$CONFIG")

# Read credentials from ci.config.yaml
P8_KEY_PATH=$(yq -r '.credentials.apple.p8_key_path' "$CONFIG")
APPLE_KEY_ID=$(yq -r '.credentials.apple.key_id' "$CONFIG")
APPLE_ISSUER_ID=$(yq -r '.credentials.apple.issuer_id' "$CONFIG")
GOOGLE_SA_JSON_PATH=$(yq -r '.credentials.google.service_account_json_path' "$CONFIG")
KEYSTORE_PASSWORD=$(yq -r '.credentials.android.keystore_password' "$CONFIG")

# Validate all values before sed substitution
validate_value "app.bundle_id" "$BUNDLE_ID"
validate_value "app.package_name" "$PACKAGE_NAME"
validate_value "app.name" "$APP_NAME"
validate_value "app.sku" "$SKU"
validate_value "app.apple_id" "$APPLE_ID"
validate_value "android.track" "$TRACK"
validate_value "ios.primary_category" "$PRIMARY_CAT"
validate_value "ios.secondary_category" "$SECONDARY_CAT"
validate_value "credentials.apple.key_id" "$APPLE_KEY_ID"
validate_value "credentials.apple.issuer_id" "$APPLE_ISSUER_ID"
validate_value "flutter_root" "$APP_ROOT"

# Generate codemagic.yaml from template
sed \
  -e "s|\${BUNDLE_ID}|$BUNDLE_ID|g" \
  -e "s|\${PACKAGE_NAME}|$PACKAGE_NAME|g" \
  -e "s|\${APP_NAME}|$APP_NAME|g" \
  -e "s|\${SKU}|$SKU|g" \
  -e "s|\${APPLE_ID}|$APPLE_ID|g" \
  -e "s|\${TRACK}|$TRACK|g" \
  -e "s|\${ROLLOUT_FRACTION}|$ROLLOUT|g" \
  -e "s|\${IN_APP_UPDATE_PRIORITY}|$UPDATE_PRIORITY|g" \
  -e "s|\${PRIMARY_CATEGORY}|$PRIMARY_CAT|g" \
  -e "s|\${SECONDARY_CATEGORY}|$SECONDARY_CAT|g" \
  -e "s|\${PRICE_TIER}|$PRICE_TIER|g" \
  -e "s|\${SUBMIT_FOR_REVIEW}|$SUBMIT_REVIEW|g" \
  -e "s|\${AUTOMATIC_RELEASE}|$AUTO_RELEASE|g" \
  -e "s|\${P8_KEY_PATH}|$P8_KEY_PATH|g" \
  -e "s|\${APPLE_KEY_ID}|$APPLE_KEY_ID|g" \
  -e "s|\${APPLE_ISSUER_ID}|$APPLE_ISSUER_ID|g" \
  -e "s|\${GOOGLE_SA_JSON_PATH}|$GOOGLE_SA_JSON_PATH|g" \
  -e "s|\${KEYSTORE_PASSWORD}|$KEYSTORE_PASSWORD|g" \
  -e "s|\${APP_ROOT}|$APP_ROOT|g" \
  "$TEMPLATE" > codemagic.yaml

echo "Generated codemagic.yaml for $APP_NAME ($BUNDLE_ID)"
echo "  iOS:     bundle_id=$BUNDLE_ID, category=$PRIMARY_CAT"
echo "  Android: package=$PACKAGE_NAME, track=$TRACK"
echo "  Flutter:  root=$APP_ROOT"
echo "  Credentials: P8=$P8_KEY_PATH, SA=$GOOGLE_SA_JSON_PATH"
