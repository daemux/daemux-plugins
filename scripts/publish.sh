#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Load token from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$NPM_TOKEN" ]; then
  echo "Error: NPM_TOKEN not set. Add it to .env or export it."
  exit 1
fi

echo "Authenticated as: $(npm whoami)"

# Get SDK version
SDK_VERSION=$(node -p "require('./packages/plugin-sdk/package.json').version")
echo "SDK version: $SDK_VERSION"

# Resolve workspace:* for publishing
for pkg in llm-providers/anthropic-provider channels/telegram-adapter features/human-behavior features/transcription; do
  sed -i '' "s/\"workspace:\*\"/\"^${SDK_VERSION}\"/" "$pkg/package.json"
done

# Build
echo "Building all packages..."
npm run build

# Publish SDK first
echo "Publishing @daemux/plugin-sdk@${SDK_VERSION}..."
npm -w packages/plugin-sdk publish --access public

# Publish remaining packages
for pkg in llm-providers/anthropic-provider channels/telegram-adapter features/human-behavior features/transcription mcp-servers/codemagic; do
  PKG_NAME=$(node -p "require('./$pkg/package.json').name")
  PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
  echo "Publishing ${PKG_NAME}@${PKG_VERSION}..."
  npm -w "$pkg" publish --access public
done

# Restore workspace:* locally
for pkg in llm-providers/anthropic-provider channels/telegram-adapter features/human-behavior features/transcription; do
  sed -i '' "s/\"\\^${SDK_VERSION}\"/\"workspace:*\"/" "$pkg/package.json"
done

echo "All packages published successfully!"
echo "Local workspace:* references restored."
