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
  # Google Play API rejects all edits on draft apps (apps that have never
  # passed Google review).  Submitting to closed testing and getting approved
  # removes draft status.  We warn instead of failing the workflow.
  if echo "$FASTLANE_OUTPUT" | grep -qi "draft app"; then
    echo "::warning title=Google Play Draft App::Closed testing submission required to exit draft status. See job summary for instructions."
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      cat >> "$GITHUB_STEP_SUMMARY" << 'SUMMARY'
## :warning: Google Play Draft App — Closed Testing Required (Internal Testing Is NOT Enough)

Metadata and screenshots were uploaded by CI but **could not be saved** because the app is still in **draft status**. This is a [Google Play API limitation](https://developers.google.com/android-publisher/edits) — all API edits are rejected until the app exits draft status.

**"Draft" is an app-level status**, not a release-level one. Internal testing bypasses Google review entirely, so it **cannot** transition your app out of draft. You must submit to **closed testing** (or higher) to trigger Google's review and remove draft status.

### One-time setup steps:

1. Go to [Google Play Console](https://play.google.com/console) → Select your app
2. **Dashboard** → Complete **all** required setup tasks in the checklist:
   - **Store listing** — app name, descriptions, screenshots, app icon, feature graphic
     - *Copy-paste the values from the **Store Listing** table below, then re-run CI after setup to auto-upload future changes.*
   - **App Content** declarations — **all** of the following:
     - Privacy policy
     - Data safety
     - Content rating questionnaire
     - Target audience and content
     - Ads declaration
     - App access (instructions if login required)
     - Government apps declaration
     - Financial features declaration (if applicable)
     - Health apps (if applicable)
   - **Pricing and distribution** — countries and free/paid
3. **Submit to Closed Testing** (not internal testing):
   - Go to **Testing → Closed testing** → Create a track if needed → **Create new release**
   - The AAB was already uploaded by CI — select it, add release notes
   - Click **Review release** → **Start rollout to closed testing**
   - This submits the app to **Google review**
4. **Wait for Google review approval** — typically 1-7 days for new apps
   - :information_source: *New personal developer accounts (created after Nov 2023): Google requires **20+ testers** for **14+ continuous days** of closed testing before you can request production access.*

### After Google approves the review:
The app permanently exits draft status and all API operations (metadata, builds, screenshots) work automatically. Re-trigger the CI workflow after approval.
SUMMARY

      # --- Append store listing table (read from metadata files) ---
      META_DIR="$PROJECT_ROOT/fastlane/metadata/en-US"
      _app_name="" _short_desc="" _full_desc=""
      [ -s "$META_DIR/title.txt" ] && _app_name=$(cat "$META_DIR/title.txt")
      [ -s "$META_DIR/short_description.txt" ] && _short_desc=$(cat "$META_DIR/short_description.txt")
      [ -s "$META_DIR/full_description.txt" ] && _full_desc=$(cat "$META_DIR/full_description.txt")

      if [ -n "$_app_name" ] || [ -n "$_short_desc" ] || [ -n "$_full_desc" ]; then
        {
          echo ""
          echo "### Store Listing (copy-paste into Google Play Console)"
          echo ""
          if [ -n "$_app_name" ] || [ -n "$_short_desc" ]; then
            echo "| Field | Value |"
            echo "|-------|-------|"
            [ -n "$_app_name" ] && echo "| App Name (max 30 chars) | \`$_app_name\` |"
            [ -n "$_short_desc" ] && echo "| Short description (max 80 chars) | \`$_short_desc\` |"
          fi
          if [ -n "$_full_desc" ]; then
            echo ""
            echo "**Full description** (max 4000 chars):"
            echo ""
            echo "~~~"
            echo "$_full_desc"
            echo "~~~"
          fi
        } >> "$GITHUB_STEP_SUMMARY"
      fi

      # --- Append app URLs table (read from metadata files) ---
      _privacy_url="" _support_url="" _marketing_url="" _support_email=""
      [ -s "$META_DIR/privacy_url.txt" ] && _privacy_url=$(cat "$META_DIR/privacy_url.txt")
      [ -s "$META_DIR/support_url.txt" ] && _support_url=$(cat "$META_DIR/support_url.txt")
      [ -s "$META_DIR/marketing_url.txt" ] && _marketing_url=$(cat "$META_DIR/marketing_url.txt")
      _support_email=$(yq '.web.support_email // ""' "$PROJECT_ROOT/ci.config.yaml" 2>/dev/null || true)

      if [ -n "$_privacy_url" ] || [ -n "$_support_url" ] || [ -n "$_marketing_url" ] || [ -n "$_support_email" ]; then
        {
          echo ""
          echo "### App URLs (copy these during setup)"
          echo ""
          echo "| Field | Value |"
          echo "|-------|-------|"
          [ -n "$_privacy_url" ] && echo "| Privacy Policy URL | \`$_privacy_url\` |"
          [ -n "$_support_url" ] && echo "| Support URL | \`$_support_url\` |"
          [ -n "$_marketing_url" ] && echo "| Marketing URL | \`$_marketing_url\` |"
          [ -n "$_support_email" ] && echo "| Support Email | \`$_support_email\` |"
        } >> "$GITHUB_STEP_SUMMARY"
      fi
    fi
    ci_skip "App is in draft status — submit to closed testing on Google Play Console to exit draft"
  fi
  exit $FASTLANE_EXIT
fi

# --- Update hash on success ---
echo "$HASH" > "$STATE_FILE"

ci_done "Android metadata uploaded to Google Play"
