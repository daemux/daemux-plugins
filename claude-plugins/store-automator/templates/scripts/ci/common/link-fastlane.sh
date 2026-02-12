#!/usr/bin/env bash
set -euo pipefail

# Creates symlinks so that `cd app/ios && bundle exec fastlane` (or android)
# can find the Fastfile. Fastlane config lives at project root under fastlane/ios/
# and fastlane/android/. This script links them into the platform directories.
#
# Usage: scripts/ci/common/link-fastlane.sh <ios|android>

PLATFORM="${1:?Usage: link-fastlane.sh <ios|android>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"

create_symlink() {
  local target="$1"
  local link="$2"

  if [ -e "$link" ] && [ ! -L "$link" ]; then
    echo "ERROR: $link exists and is not a symlink. Cannot create link." >&2
    return 1
  fi

  ln -sfn "$target" "$link"
  echo "Linked: $link -> $target"

  if [ ! -e "$link" ]; then
    echo "ERROR: Symlink target does not exist: $target" >&2
    return 1
  fi
}

echo "Linking Fastlane directories for $PLATFORM..."

FASTLANE_ROOT="$PROJECT_ROOT/fastlane"
PLATFORM_DIR="$APP_ROOT/$PLATFORM"

if [ ! -d "$FASTLANE_ROOT/$PLATFORM" ]; then
  echo "ERROR: Fastlane config not found at $FASTLANE_ROOT/$PLATFORM" >&2
  exit 1
fi

if [ ! -d "$PLATFORM_DIR" ]; then
  echo "ERROR: Platform directory not found at $PLATFORM_DIR" >&2
  exit 1
fi

# Create symlink: app/ios/fastlane -> ../../fastlane/ios
# Create symlink: app/android/fastlane -> ../../fastlane/android
RELATIVE_TARGET="../../fastlane/$PLATFORM"
LINK_PATH="$PLATFORM_DIR/fastlane"

create_symlink "$RELATIVE_TARGET" "$LINK_PATH"

echo "Fastlane linking complete for $PLATFORM"
ls -la "$LINK_PATH"
