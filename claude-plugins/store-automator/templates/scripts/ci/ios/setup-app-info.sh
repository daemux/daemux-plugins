#!/usr/bin/env bash
# Sets up App Store Connect app info (content rights, age rating, categories) via ASC API.
# Requires read-config.sh to have been sourced (provides PROJECT_ROOT, credentials, etc.).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"
source "$SCRIPT_DIR/../common/ci-notify.sh"

echo "=== App Store Connect App Info Setup ==="

# --- Validate ASC credentials ---
if [ -z "${APPLE_KEY_ID:-}" ] || [ -z "${APPLE_ISSUER_ID:-}" ]; then
  ci_skip "ASC credentials not configured"
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
export PROJECT_ROOT="$PROJECT_ROOT"

echo "ASC API key configured (Key ID: $APPLE_KEY_ID)"

# --- Run app setup via Python ---
SETUP_SCRIPT="$PROJECT_ROOT/scripts/asc_app_setup.py"

if [ ! -f "$SETUP_SCRIPT" ]; then
  echo "ERROR: asc_app_setup.py not found at $SETUP_SCRIPT" >&2
  exit 1
fi

echo "Setting up App Store Connect app info..."
python3 "$SETUP_SCRIPT"

ci_done "App Store Connect app info configured"
