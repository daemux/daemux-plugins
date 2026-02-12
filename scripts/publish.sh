#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

PACKAGES=(packages/plugin-sdk llm-providers/anthropic-provider channels/telegram-adapter features/human-behavior features/transcription)
PLUGINS=(llm-providers/anthropic-provider channels/telegram-adapter features/human-behavior features/transcription)

# Load token from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$NPM_TOKEN" ]; then
  echo "Error: NPM_TOKEN not set. Add it to .env or export it."
  exit 1
fi

echo "Authenticated as: $(npm whoami)"

# Save original versions for restoration
declare -A ORIG_VERSIONS
for pkg in "${PACKAGES[@]}"; do
  ORIG_VERSIONS[$pkg]=$(node -p "require('./$pkg/package.json').version")
done

cleanup() {
  echo "Restoring original versions and workspace:* references..."
  SDK_VERSION=$(node -p "require('./packages/plugin-sdk/package.json').version")
  for pkg in "${PLUGINS[@]}"; do
    sed -i '' "s/\"\\^${SDK_VERSION}\"/\"workspace:*\"/" "$pkg/package.json"
  done
  for pkg in "${PACKAGES[@]}"; do
    local orig="${ORIG_VERSIONS[$pkg]}"
    local curr=$(node -p "require('./$pkg/package.json').version")
    if [ "$curr" != "$orig" ]; then
      sed -i '' "s/\"version\": \"${curr}\"/\"version\": \"${orig}\"/" "$pkg/package.json"
      local plugin_json="$pkg/.claude-plugin/plugin.json"
      if [ -f "$plugin_json" ]; then
        sed -i '' "s/\"version\": \"${curr}\"/\"version\": \"${orig}\"/" "$plugin_json"
      fi
    fi
  done
  echo "Local versions and workspace:* references restored."
}
trap cleanup EXIT

# Auto-version all packages
echo "Auto-versioning packages..."
for pkg in "${PACKAGES[@]}"; do
  NEW_VERSION=$(node scripts/auto-version.mjs "$pkg")
  echo "  $pkg: ${ORIG_VERSIONS[$pkg]} -> $NEW_VERSION"
done

# Get SDK version after auto-versioning
SDK_VERSION=$(node -p "require('./packages/plugin-sdk/package.json').version")
echo "SDK version: $SDK_VERSION"

# Resolve workspace:* for publishing
for pkg in "${PLUGINS[@]}"; do
  sed -i '' "s/\"workspace:\*\"/\"^${SDK_VERSION}\"/" "$pkg/package.json"
done

echo "Building all packages..."
npm run build

echo "Publishing @daemux/plugin-sdk@${SDK_VERSION}..."
npm -w packages/plugin-sdk publish --access public

for pkg in "${PLUGINS[@]}"; do
  PKG_NAME=$(node -p "require('./$pkg/package.json').name")
  PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
  echo "Publishing ${PKG_NAME}@${PKG_VERSION}..."
  npm -w "$pkg" publish --access public
done

echo "All packages published successfully!"
