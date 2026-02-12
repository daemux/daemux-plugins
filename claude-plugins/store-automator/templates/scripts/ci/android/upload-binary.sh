#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo ""
  echo "============================================="
  echo "  Google Play is NOT ready for automation"
  echo "============================================="
  echo ""
  echo "This is likely the first release. You must upload the AAB manually."

  AAB_DIR="$APP_ROOT/build/app/outputs/bundle/release"
  AAB_FILE=$(find "$AAB_DIR" -name "*.aab" -type f 2>/dev/null | head -1)
  if [ -n "$AAB_FILE" ]; then
    echo ""
    echo "Built AAB: $AAB_FILE ($(du -h "$AAB_FILE" | cut -f1))"
  else
    echo ""
    echo "No AAB found. Run build.sh first."
  fi

  echo ""
  echo "Manual upload steps:"
  echo "  1. Go to Google Play Console: https://play.google.com/console"
  echo "  2. Select your app ($PACKAGE_NAME)"
  echo "  3. Go to Release > Testing > Internal testing (or your target track)"
  echo "  4. Create a new release and upload the AAB file"
  echo "  5. Complete the release form and roll out"
  echo ""
  echo "After the first manual upload, subsequent releases will be automated."
  exit 1
fi

# --- Validate prerequisites ---
SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  echo "ERROR: Service account JSON not found at $SA_FULL_PATH" >&2
  exit 1
fi

# --- Link fastlane directories and ensure installed ---
"$SCRIPT_DIR/../common/link-fastlane.sh" android
cd "$APP_ROOT/android"
if ! bundle exec fastlane --version >/dev/null 2>&1; then
  "$SCRIPT_DIR/../common/install-fastlane.sh" android
fi

# --- Upload via Fastlane ---
echo "Uploading AAB to Google Play (track: ${TRACK:-internal}, package: $PACKAGE_NAME)..."

PACKAGE_NAME="$PACKAGE_NAME" \
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH" \
TRACK="${TRACK:-internal}" \
ROLLOUT_FRACTION="${ROLLOUT_FRACTION:-}" \
IN_APP_UPDATE_PRIORITY="${IN_APP_UPDATE_PRIORITY:-0}" \
bundle exec fastlane upload_binary_android

echo "Android binary upload complete"
