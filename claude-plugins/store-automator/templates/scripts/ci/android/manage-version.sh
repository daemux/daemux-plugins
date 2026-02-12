#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

PUBSPEC="$APP_ROOT/pubspec.yaml"

# --- Step 1: Get iOS version (for cross-platform consistency) ---

echo "Getting iOS version for cross-platform consistency..."

P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY
APP_STORE_CONNECT_PRIVATE_KEY=$(cat "$P8_FULL_PATH")

VERSION_JSON=$(python3 "$PROJECT_ROOT/scripts/manage_version_ios.py")
if [ -z "$VERSION_JSON" ]; then
  echo "ERROR: manage_version_ios.py returned empty output" >&2
  exit 1
fi

APP_VERSION=$(echo "$VERSION_JSON" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
echo "iOS version: $APP_VERSION"

# --- Step 2: Get latest Android version code ---

echo "Getting latest Android version code..."

LATEST_CODE="0"

if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "Google Play not ready. Reading version code from pubspec.yaml or default."
  if [ -f "$PUBSPEC" ]; then
    CURRENT_VERSION=$(grep '^version:' "$PUBSPEC" | head -1 | sed 's/version: //')
    if [[ "$CURRENT_VERSION" == *"+"* ]]; then
      LATEST_CODE="${CURRENT_VERSION#*+}"
      echo "Current version code from pubspec.yaml: $LATEST_CODE"
    fi
  fi
elif [ ! -f "$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH" ]; then
  echo "ERROR: Service account JSON not found at $PROJECT_ROOT/$GOOGLE_SA_JSON_PATH" >&2
  exit 1
else
  SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
  cd "$APP_ROOT/android"

  if ! bundle exec fastlane --version >/dev/null 2>&1; then
    "$SCRIPT_DIR/../common/install-fastlane.sh" android
  fi

  export PACKAGE_NAME
  export GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH"
  export TRACK="${TRACK:-internal}"

  # Primary: Fastlane action
  LATEST_CODE=$(bundle exec fastlane run google_play_track_version_codes \
    package_name:"$PACKAGE_NAME" \
    json_key:"$SA_FULL_PATH" \
    track:"$TRACK" 2>&1 \
    | grep -oE '[0-9]+' | sort -n | tail -1)

  # Fallback: direct Ruby Supply::Client API
  if [ -z "$LATEST_CODE" ] || [ "$LATEST_CODE" = "0" ]; then
    LATEST_CODE=$(bundle exec ruby -e "
require 'supply'
require 'supply/client'

Supply.config = FastlaneCore::Configuration.create(
  Supply::Options.available_options,
  {
    package_name: ENV['PACKAGE_NAME'],
    json_key: ENV['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH'],
    track: ENV.fetch('TRACK', 'internal')
  }
)

client = Supply::Client.make_from_config
all_codes = []
['internal', 'alpha', 'beta', 'production'].each do |track|
  begin
    track_codes = client.track_version_codes(track)
    all_codes.concat(track_codes) if track_codes
  rescue => e
    # Track may not exist yet
  end
end
puts all_codes.max || 0
")
  fi

  if [ -z "$LATEST_CODE" ]; then
    echo "ERROR: Failed to fetch version codes from Google Play" >&2
    exit 1
  fi

  echo "Latest version code from Google Play: $LATEST_CODE"
fi

# --- Step 3: Increment and write ---

BUILD_NUMBER=$((LATEST_CODE + 1))
ANDROID_VERSION_CODE="$BUILD_NUMBER"

echo "New Android version code: $BUILD_NUMBER"

if [ ! -f "$PUBSPEC" ]; then
  echo "ERROR: pubspec.yaml not found at $PUBSPEC" >&2
  exit 1
fi

sed -i '' "s/^version: .*/version: ${APP_VERSION}+${BUILD_NUMBER}/" "$PUBSPEC"
echo "Updated pubspec.yaml: $(grep '^version:' "$PUBSPEC" | head -1)"

# --- Step 4: Export ---

export APP_VERSION BUILD_NUMBER ANDROID_VERSION_CODE

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "APP_VERSION=$APP_VERSION" >> "$GITHUB_ENV"
  echo "BUILD_NUMBER=$BUILD_NUMBER" >> "$GITHUB_ENV"
  echo "ANDROID_VERSION_CODE=$ANDROID_VERSION_CODE" >> "$GITHUB_ENV"
  echo "Exported version vars to GITHUB_ENV"
fi

echo "Android version management complete: ${APP_VERSION}+${BUILD_NUMBER}"
