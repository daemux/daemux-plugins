#!/usr/bin/env bash
# Submits the iOS app for App Store review via ASC API.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== Submit iOS for Review ==="

if [ "$SUBMIT_FOR_REVIEW" != "true" ]; then
  ci_skip "submit_for_review is disabled"
fi

# --- Validate ASC credentials ---
if [ -z "$APPLE_KEY_ID" ] || [ -z "$APPLE_ISSUER_ID" ] || [ -z "$P8_KEY_PATH" ]; then
  echo "ERROR: Missing Apple credentials in ci.config.yaml (APPLE_KEY_ID, APPLE_ISSUER_ID, or P8_KEY_PATH)" >&2
  exit 1
fi

P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

# --- Set ASC API env vars for submit_for_review_ios.py ---
export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY="$(cat "$P8_FULL_PATH")"
export BUNDLE_ID

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

echo "Submitting iOS app for App Store review..."
python3 "$PROJECT_ROOT/scripts/submit_for_review_ios.py"

ci_done "iOS app submitted for App Store review"
