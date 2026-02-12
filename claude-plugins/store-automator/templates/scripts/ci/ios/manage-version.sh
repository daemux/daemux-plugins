#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Validate required config ---
if [ -z "$APPLE_KEY_ID" ] || [ -z "$APPLE_ISSUER_ID" ] || [ -z "$P8_KEY_PATH" ]; then
  echo "ERROR: Missing Apple credentials in ci.config.yaml (APPLE_KEY_ID, APPLE_ISSUER_ID, or P8_KEY_PATH)" >&2
  exit 1
fi

P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
if [ ! -f "$P8_FULL_PATH" ]; then
  echo "ERROR: P8 key file not found at $P8_FULL_PATH" >&2
  exit 1
fi

# --- Set ASC API env vars for manage_version_ios.py ---
export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY
APP_STORE_CONNECT_PRIVATE_KEY=$(cat "$P8_FULL_PATH")

# --- Export BUNDLE_ID for manage_version_ios.py ---
export BUNDLE_ID

# --- Run the existing Python script ---
echo "Running manage_version_ios.py..."
VERSION_JSON=$(python3 "$PROJECT_ROOT/scripts/manage_version_ios.py")

if [ -z "$VERSION_JSON" ]; then
  echo "ERROR: manage_version_ios.py returned empty output" >&2
  exit 1
fi

echo "Version info: $VERSION_JSON"

# --- Parse JSON output ---
# Expected format: {"version": "X.Y.Z", "version_id": "...", "state": "..."}
read -r APP_VERSION APP_VERSION_ID APP_STATUS < <(
  echo "$VERSION_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d['version'], d.get('version_id',''), d.get('state',''))
"
)

echo "Parsed version: $APP_VERSION (id: $APP_VERSION_ID, status: $APP_STATUS)"

# --- Export to environment ---
export APP_VERSION
export APP_VERSION_ID
export APP_STATUS

# Write to $GITHUB_ENV for inter-step communication in CI
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "APP_VERSION=$APP_VERSION" >> "$GITHUB_ENV"
  echo "APP_VERSION_ID=$APP_VERSION_ID" >> "$GITHUB_ENV"
  echo "APP_STATUS=$APP_STATUS" >> "$GITHUB_ENV"
  echo "Exported to GITHUB_ENV"
fi

echo "iOS version management complete: $APP_VERSION"
