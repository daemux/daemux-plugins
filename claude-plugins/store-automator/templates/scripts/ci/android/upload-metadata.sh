#!/usr/bin/env bash
# Requires link-fastlane.sh and install-fastlane.sh to have run first (workflow steps).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

# --- Check Google Play readiness ---
if [ "${GOOGLE_PLAY_READY:-false}" != "true" ]; then
  echo "ERROR: Google Play not ready. Cannot upload metadata." >&2
  echo "Run check-readiness.sh for details." >&2
  exit 1
fi

# --- Hash-based change detection ---
STATE_DIR="$PROJECT_ROOT/.ci-state"
mkdir -p "$STATE_DIR"

HASH=$(find "$PROJECT_ROOT/fastlane/metadata" "$PROJECT_ROOT/fastlane/screenshots/android" \
  -type f ! -name '.DS_Store' -print0 2>/dev/null \
  | LC_ALL=C sort -z \
  | xargs -0 shasum -a 256 2>/dev/null \
  | shasum -a 256 \
  | cut -d' ' -f1)
STATE_FILE="$STATE_DIR/android-metadata-hash"

if [ -f "$STATE_FILE" ]; then
  STORED_HASH=$(cat "$STATE_FILE")
  if [ "$HASH" = "$STORED_HASH" ]; then
    ci_skip "Android metadata unchanged since last upload"
  fi
fi

echo "Changes detected in Android metadata (hash: ${HASH:0:12}...)"

# --- Resolve service account path ---
SA_FULL_PATH="$PROJECT_ROOT/$GOOGLE_SA_JSON_PATH"
if [ ! -f "$SA_FULL_PATH" ]; then
  echo "ERROR: Service account JSON not found at $SA_FULL_PATH" >&2
  exit 1
fi

# --- Upload metadata via Fastlane ---
echo "Uploading Android metadata..."

cd "$APP_ROOT/android"

set +e
FASTLANE_OUTPUT=$(PACKAGE_NAME="$PACKAGE_NAME" \
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH="$SA_FULL_PATH" \
bundle exec fastlane upload_metadata_android 2>&1)
FASTLANE_EXIT=$?
set -e

echo "$FASTLANE_OUTPUT"

if [ $FASTLANE_EXIT -ne 0 ]; then
  # Google Play API rejects non-draft edits on apps that have never been
  # published.  This resolves after the first manual release via the Play
  # Console, so we warn instead of failing the workflow.
  if echo "$FASTLANE_OUTPUT" | grep -qi "draft app"; then
    echo "::warning title=Google Play Draft App::First manual release required. See job summary for instructions."
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      cat >> "$GITHUB_STEP_SUMMARY" << 'SUMMARY'
## :warning: Google Play Draft App — First-Time Setup Required

Metadata and screenshots were uploaded by CI but **could not be saved** because the app hasn't completed its initial setup on Google Play Console. This is a [Google Play API limitation](https://developers.google.com/android-publisher/edits) — all API edits are rejected until the first manual release.

### One-time setup steps:

1. Go to [Google Play Console](https://play.google.com/console) → Select your app
2. **Dashboard** → Complete all required setup tasks shown in the checklist
3. **Store listing** → Create your default store listing (title, description, screenshots)
   - *Note: CI uploaded this data but it was discarded. After completing setup, re-run CI to auto-upload.*
4. **Content rating** → Complete the content rating questionnaire
5. **App pricing** → Set pricing and distribution countries
6. **Release** → Go to **Testing → Internal testing** (or **Production**)
   - Click **Create new release**
   - The AAB was already uploaded by CI — select it
   - Add release notes
   - Click **Review release** → **Start rollout**

### After first release:
All subsequent CI runs will automatically upload metadata, screenshots, and new builds without manual intervention. Re-trigger the CI workflow after completing the steps above.
SUMMARY
    fi
    ci_skip "App is in draft status — manual first release required on Google Play Console"
  fi
  exit $FASTLANE_EXIT
fi

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"

ci_done "Android metadata uploaded to Google Play"
