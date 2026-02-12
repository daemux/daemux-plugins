#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Validate prerequisites ---
if [ -z "${CM_KEYSTORE_PATH:-}" ]; then
  echo "ERROR: CM_KEYSTORE_PATH not set. Run setup-keystore.sh first." >&2
  exit 1
fi
if [ ! -f "$CM_KEYSTORE_PATH" ]; then
  echo "ERROR: Keystore not found at $CM_KEYSTORE_PATH" >&2
  exit 1
fi
if ! command -v flutter &>/dev/null; then
  echo "ERROR: Flutter SDK not found in PATH" >&2
  exit 1
fi

echo "Building Android AAB..."
echo "  APP_ROOT: $APP_ROOT"
echo "  CM_KEYSTORE_PATH: $CM_KEYSTORE_PATH"
echo "  CM_KEY_ALIAS: ${CM_KEY_ALIAS:-not set}"

# --- Build AAB ---
cd "$APP_ROOT"
flutter build appbundle --release

# --- Locate AAB ---
AAB_DIR="$APP_ROOT/build/app/outputs/bundle/release"
AAB_FILE=$(find "$AAB_DIR" -name "*.aab" -type f 2>/dev/null | head -1)

if [ -z "${AAB_FILE:-}" ]; then
  echo "ERROR: No .aab file found in $AAB_DIR" >&2
  ls -la "$AAB_DIR" >&2 2>/dev/null || true
  exit 1
fi

echo "AAB built: $AAB_FILE ($(du -h "$AAB_FILE" | cut -f1))"

# --- Export ---
export AAB_PATH="$AAB_FILE"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "AAB_PATH=$AAB_FILE" >> "$GITHUB_ENV"
  echo "Exported AAB_PATH to GITHUB_ENV"
fi

echo "Android build complete: $AAB_PATH"
