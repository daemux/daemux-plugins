#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Helper: write key=value to $GITHUB_ENV when running in CI ---
persist_to_github_env() {
  if [ -n "${GITHUB_ENV:-}" ]; then
    for pair in "$@"; do
      echo "$pair" >> "$GITHUB_ENV"
    done
  fi
}

# --- Require keystore password (needed for generation AND validation) ---
if [ -z "${KEYSTORE_PASSWORD:-}" ]; then
  echo "ERROR: KEYSTORE_PASSWORD not set in ci.config.yaml (credentials.keystore_password)" >&2
  exit 1
fi

ANDROID_DIR="$APP_ROOT/android"
KEYSTORE_TARGET="$ANDROID_DIR/upload.keystore"
CREDS_KEYSTORE="$PROJECT_ROOT/creds/android_upload.keystore"

# --- Locate or create keystore ---
if [ -f "$KEYSTORE_TARGET" ]; then
  echo "Keystore found at $KEYSTORE_TARGET"
elif [ -f "$CREDS_KEYSTORE" ]; then
  echo "Keystore found in creds/, copying to $KEYSTORE_TARGET"
  cp "$CREDS_KEYSTORE" "$KEYSTORE_TARGET"
else
  echo "No keystore found. Generating a new upload keystore..."

  keytool -genkey -v \
    -keystore "$KEYSTORE_TARGET" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -alias upload \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEYSTORE_PASSWORD" \
    -dname "CN=Upload Key, O=${APP_NAME:-App}"

  echo "New keystore generated at $KEYSTORE_TARGET"

  # Backup to creds/ for local development persistence.
  # In CI the workspace is ephemeral, so the keystore should already exist
  # in creds/ (committed or restored from a secret/artifact).
  mkdir -p "$PROJECT_ROOT/creds"
  cp "$KEYSTORE_TARGET" "$CREDS_KEYSTORE"
  echo "Backed up keystore to $CREDS_KEYSTORE"
fi

# --- Resolve absolute path ---
KEYSTORE_ABS_PATH="$(cd "$(dirname "$KEYSTORE_TARGET")" && pwd)/$(basename "$KEYSTORE_TARGET")"

# --- Validate keystore ---
echo "Validating keystore..."
if ! keytool -list -keystore "$KEYSTORE_ABS_PATH" -storepass "$KEYSTORE_PASSWORD" -alias upload >/dev/null 2>&1; then
  echo "ERROR: Keystore validation failed. Check password and alias." >&2
  exit 1
fi
echo "Keystore validated successfully"

# --- Set Gradle signing env vars (matches build.gradle.kts) ---
export CM_KEYSTORE_PATH="$KEYSTORE_ABS_PATH"
export CM_KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD"
export CM_KEY_ALIAS="upload"
export CM_KEY_PASSWORD="$KEYSTORE_PASSWORD"

persist_to_github_env \
  "CM_KEYSTORE_PATH=$CM_KEYSTORE_PATH" \
  "CM_KEYSTORE_PASSWORD=$CM_KEYSTORE_PASSWORD" \
  "CM_KEY_ALIAS=$CM_KEY_ALIAS" \
  "CM_KEY_PASSWORD=$CM_KEY_PASSWORD"

echo "Android keystore setup complete"
echo "  CM_KEYSTORE_PATH=$CM_KEYSTORE_PATH"
echo "  CM_KEY_ALIAS=$CM_KEY_ALIAS"
