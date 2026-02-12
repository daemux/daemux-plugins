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

# Update Gemfile.lock to use the current bundler version.
# Old lockfiles (e.g., BUNDLED WITH 1.17.2) cause errors on modern Ruby
# because bundler auto-downloads the old version which may be incompatible.
LOCKFILE="$PLATFORM_DIR/Gemfile.lock"
if [ -f "$LOCKFILE" ]; then
  CURRENT_BUNDLER=$(bundle --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  LOCK_BUNDLER=$(awk '/^BUNDLED WITH/{getline; gsub(/^[ \t]+|[ \t]+$/,""); print}' "$LOCKFILE")
  if [ -n "$LOCK_BUNDLER" ] && [ "$LOCK_BUNDLER" != "$CURRENT_BUNDLER" ]; then
    echo "Updating Gemfile.lock bundler: $LOCK_BUNDLER -> $CURRENT_BUNDLER"
    awk -v ver="   $CURRENT_BUNDLER" '/^BUNDLED WITH/{print;getline;print ver;next}1' \
      "$LOCKFILE" > "$LOCKFILE.tmp" && mv "$LOCKFILE.tmp" "$LOCKFILE"
  fi
fi

bundle config set --local path vendor/bundle
bundle install --jobs 4 --retry 3

echo "Verifying Fastlane installation..."
bundle exec fastlane --version

echo "Fastlane installed successfully for $PLATFORM"
