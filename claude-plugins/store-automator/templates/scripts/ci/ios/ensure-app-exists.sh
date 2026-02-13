#!/usr/bin/env bash
# Ensures the app exists in App Store Connect (registers bundle ID, creates
# app record, sets content rights and pricing). Fully idempotent.
# Requires read-config.sh to have been sourced (provides PROJECT_ROOT, credentials, etc.).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== Ensure App Exists in App Store Connect ==="

# --- Validate ASC credentials ---
if [ -z "${APPLE_KEY_ID:-}" ] || [ -z "${APPLE_ISSUER_ID:-}" ]; then
  ci_skip "ASC credentials not configured"
fi

if [ -z "${BUNDLE_ID:-}" ] || [ -z "${APP_NAME:-}" ]; then
  ci_skip "BUNDLE_ID or APP_NAME not set in ci.config.yaml"
fi

# --- Set up App Store Connect API credentials ---
P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY="$(cat "$P8_FULL_PATH")"
export BUNDLE_ID="$BUNDLE_ID"
export APP_NAME="$APP_NAME"
export SKU="${SKU:-$BUNDLE_ID}"
export PLATFORM="${PLATFORM:-IOS}"

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

# --- Run ensure-app-exists via Python ---
CREATE_SCRIPT="$PROJECT_ROOT/scripts/create_app_record.py"

if [ ! -f "$CREATE_SCRIPT" ]; then
  echo "ERROR: create_app_record.py not found at $CREATE_SCRIPT" >&2
  exit 1
fi

echo "Ensuring app exists in App Store Connect..."
python3 "$CREATE_SCRIPT"

ci_done "App exists and is configured in App Store Connect"
