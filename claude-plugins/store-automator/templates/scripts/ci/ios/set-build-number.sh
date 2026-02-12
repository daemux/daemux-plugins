#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Validate prerequisites ---
if [ -z "${APP_VERSION:-}" ]; then
  echo "ERROR: APP_VERSION not set. Run manage-version.sh first." >&2
  exit 1
fi

if [ -z "$BUNDLE_ID" ]; then
  echo "ERROR: BUNDLE_ID not set in ci.config.yaml" >&2
  exit 1
fi

# --- Ensure ASC API env vars are set ---
if [ -z "${APP_STORE_CONNECT_KEY_IDENTIFIER:-}" ]; then
  P8_FULL_PATH="$PROJECT_ROOT/$P8_KEY_PATH"
  export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
  export APP_STORE_CONNECT_ISSUER_ID="$APPLE_ISSUER_ID"
  export APP_STORE_CONNECT_PRIVATE_KEY
  APP_STORE_CONNECT_PRIVATE_KEY=$(cat "$P8_FULL_PATH")
fi

# --- Ensure PyJWT is installed ---
pip3 install PyJWT >/dev/null 2>&1 || true

# --- Fetch latest build number from ASC ---
echo "Fetching latest build number from App Store Connect..."

LATEST_BUILD=$(python3 -c "
import os, json, time, jwt, urllib.request

key_id = os.environ['APP_STORE_CONNECT_KEY_IDENTIFIER']
issuer_id = os.environ['APP_STORE_CONNECT_ISSUER_ID']
private_key = os.environ['APP_STORE_CONNECT_PRIVATE_KEY']
bundle_id = os.environ.get('BUNDLE_ID', '')

# Generate JWT token
now = int(time.time())
payload = {'iss': issuer_id, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'}
token = jwt.encode(payload, private_key, algorithm='ES256', headers={'kid': key_id})
headers = {'Authorization': f'Bearer {token}'}

try:
    # Resolve app ID from bundle ID
    req = urllib.request.Request(
        f'https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]={bundle_id}',
        headers=headers)
    with urllib.request.urlopen(req) as resp:
        app_id = json.loads(resp.read())['data'][0]['id']

    # Fetch latest build
    req = urllib.request.Request(
        f'https://api.appstoreconnect.apple.com/v1/builds?filter[app]={app_id}&sort=-version&limit=1',
        headers=headers)
    with urllib.request.urlopen(req) as resp:
        builds = json.loads(resp.read())['data']

    print(builds[0]['attributes']['version'] if builds else '0')
except Exception:
    print('0')
" 2>/dev/null || echo "0")

echo "Latest build number from ASC: $LATEST_BUILD"

# --- Increment build number ---
BUILD_NUMBER=$((LATEST_BUILD + 1))
echo "New build number: $BUILD_NUMBER"

# --- Write to pubspec.yaml ---
PUBSPEC="$APP_ROOT/pubspec.yaml"
if [ ! -f "$PUBSPEC" ]; then
  echo "ERROR: pubspec.yaml not found at $PUBSPEC" >&2
  exit 1
fi

echo "Updating pubspec.yaml: version: ${APP_VERSION}+${BUILD_NUMBER}"
sed -i '' "s/^version: .*/version: ${APP_VERSION}+${BUILD_NUMBER}/" "$PUBSPEC"

# Verify the write
WRITTEN_VERSION=$(grep '^version:' "$PUBSPEC" | head -1)
echo "Written to pubspec.yaml: $WRITTEN_VERSION"

# --- Export ---
export BUILD_NUMBER

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "BUILD_NUMBER=$BUILD_NUMBER" >> "$GITHUB_ENV"
  echo "Exported BUILD_NUMBER to GITHUB_ENV"
fi

echo "Build number set: $BUILD_NUMBER"
