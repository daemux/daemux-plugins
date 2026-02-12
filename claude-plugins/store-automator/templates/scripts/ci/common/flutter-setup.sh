#!/usr/bin/env bash
set -euo pipefail

# Runs Flutter pub get and verifies the SDK is available.
# Usage: scripts/ci/common/flutter-setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"

if ! command -v flutter &>/dev/null; then
  echo "ERROR: Flutter SDK not found in PATH" >&2
  exit 1
fi

echo "Flutter version:"
flutter --version

echo "Running flutter pub get in $APP_ROOT..."
cd "$APP_ROOT"
flutter pub get

echo "Flutter setup complete"
