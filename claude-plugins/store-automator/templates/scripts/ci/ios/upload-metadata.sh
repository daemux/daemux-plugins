#!/usr/bin/env bash
# Requires link-fastlane.sh and install-fastlane.sh to have run first (workflow steps).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
source "$COMMON_DIR/read-config.sh"
source "$COMMON_DIR/ci-notify.sh"

echo "=== iOS Metadata & Screenshots Upload ==="

# --- Check preconditions ---
METADATA_DIR="$PROJECT_ROOT/fastlane/metadata"
SCREENSHOTS_DIR="$PROJECT_ROOT/fastlane/screenshots/ios"

if [ ! -d "$METADATA_DIR" ] && [ ! -d "$SCREENSHOTS_DIR" ]; then
  ci_skip "No iOS metadata directories found"
fi

HASH_DIRS=()
for dir in "$METADATA_DIR" "$SCREENSHOTS_DIR"; do
  [ -d "$dir" ] && HASH_DIRS+=("$dir") && echo "  Found: $dir"
done

# --- Hash-based change detection ---
HASH=$(
  find "${HASH_DIRS[@]}" -type f ! -name '.DS_Store' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum -a 256 2>/dev/null \
    | shasum -a 256 \
    | cut -d' ' -f1
)

STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/ios-metadata-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    ci_skip "iOS metadata unchanged since last upload"
  fi
  echo "Changes detected (old: ${STORED_HASH:0:12}..., new: ${HASH:0:12}...)"
else
  echo "No cached hash found. First run — will upload metadata."
fi

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

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"
ci_done "iOS metadata uploaded to App Store Connect"
