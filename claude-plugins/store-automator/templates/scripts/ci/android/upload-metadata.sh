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
## :warning: Google Play Draft App - Manual Action Required

Metadata upload could not be committed because the app is still in **draft state** on Google Play.

### How to fix:

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app
3. Navigate to **Release > Production** (or **Internal testing**)
4. Click **Create new release**
5. The AAB was already uploaded by CI -- select it
6. Fill in release notes
7. Complete **Store listing** (description, screenshots -- already uploaded by CI)
8. Complete **Content rating** questionnaire
9. Complete **Pricing & distribution** settings
10. Click **Review release** then **Start rollout**

> After the first manual release, all subsequent CI metadata uploads will commit successfully without this error.
SUMMARY
    fi
    ci_skip "App is in draft status — manual first release required on Google Play Console"
  fi
  exit $FASTLANE_EXIT
fi

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"

ci_done "Android metadata uploaded to Google Play"
