#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/read-config.sh"

# --- Validate prerequisites ---
if [ -z "${EXPORT_OPTIONS_PLIST:-}" ]; then
  echo "ERROR: EXPORT_OPTIONS_PLIST not set. Run setup-signing.sh first (TASK_3)." >&2
  exit 1
fi

if [ ! -f "$EXPORT_OPTIONS_PLIST" ]; then
  echo "ERROR: Export options plist not found at $EXPORT_OPTIONS_PLIST" >&2
  exit 1
fi

if ! command -v flutter &>/dev/null; then
  echo "ERROR: Flutter SDK not found in PATH" >&2
  exit 1
fi

# --- Build IPA ---
echo "Building IPA..."
echo "  APP_ROOT: $APP_ROOT"
echo "  EXPORT_OPTIONS_PLIST: $EXPORT_OPTIONS_PLIST"

cd "$APP_ROOT"
flutter build ipa \
  --release \
  --export-options-plist="$EXPORT_OPTIONS_PLIST"

# --- Verify IPA exists ---
IPA_DIR="$APP_ROOT/build/ios/ipa"
IPA_FILE=$(find "$IPA_DIR" -name "*.ipa" -type f 2>/dev/null | head -1)
if [ -z "$IPA_FILE" ]; then
  echo "ERROR: No .ipa file found in $IPA_DIR" >&2
  exit 1
fi

echo "IPA built successfully: $IPA_FILE"
echo "IPA size: $(du -h "$IPA_FILE" | cut -f1)"

# --- Export ---
export IPA_PATH="$IPA_FILE"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "IPA_PATH=$IPA_FILE" >> "$GITHUB_ENV"
  echo "Exported IPA_PATH to GITHUB_ENV"
fi

echo "iOS build complete: $IPA_PATH"
