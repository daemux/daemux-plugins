#!/usr/bin/env bash
set -euo pipefail

# Installs Fastlane and its dependencies for the given platform.
# Usage: scripts/ci/common/install-fastlane.sh <ios|android>

PLATFORM="${1:?Usage: install-fastlane.sh <ios|android>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"

PLATFORM_DIR="$APP_ROOT/$PLATFORM"

if [ ! -d "$PLATFORM_DIR" ]; then
  echo "ERROR: Platform directory not found: $PLATFORM_DIR" >&2
  exit 1
fi

GEMFILE="$PLATFORM_DIR/Gemfile"
if [ ! -f "$GEMFILE" ]; then
  echo "ERROR: Gemfile not found at $GEMFILE" >&2
  exit 1
fi

echo "Installing Fastlane for $PLATFORM..."
cd "$PLATFORM_DIR"

if ! command -v bundle &>/dev/null; then
  echo "Installing bundler..."
  gem install bundler --no-document --user-install
fi

export BUNDLE_PATH="${BUNDLE_PATH:-vendor/bundle}"
bundle install --jobs 4 --retry 3

echo "Verifying Fastlane installation..."
bundle exec fastlane --version

echo "Fastlane installed successfully for $PLATFORM"
