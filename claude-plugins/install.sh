#!/bin/bash
# Daemux Claude Plugins - Install/Update Script
# Run from any project directory to install or update the plugin

set -e

# Parse arguments
SCOPE="project"
while [[ $# -gt 0 ]]; do
  case $1 in
    -g|--global)
      SCOPE="user"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if ! command -v claude &> /dev/null; then
  echo "Claude CLI not found. Installing..."
  curl -fsSL https://claude.ai/install.sh | bash
  echo ""
fi

MP=~/.claude/plugins/marketplaces/daemux-claude-plugins

echo "Installing/updating Daemux Claude Plugins..."

TEMP_DIR=$(mktemp -d)
echo "Fetching latest plugins..."
git clone --depth 1 https://github.com/daemux/daemux-plugins.git "$TEMP_DIR" 2>/dev/null

echo "Installing marketplace..."
rm -rf "$MP"
mkdir -p "$MP"
cp -a "$TEMP_DIR/claude-plugins/." "$MP/"
rm -rf "$TEMP_DIR"

rm -rf ~/.claude/plugins/marketplaces/gowalk-plugins 2>/dev/null || true
rm -rf ~/.claude/plugins/marketplaces/gowalk-public-gowalk-claude-plugins 2>/dev/null || true
rm -rf ~/.claude/plugins/marketplaces/daemux-daemux-plugins 2>/dev/null || true

echo "Clearing plugin cache..."
rm -rf ~/.claude/plugins/cache/gowalk-plugins 2>/dev/null || true
rm -rf ~/.claude/plugins/cache/daemux-claude-plugins 2>/dev/null || true

echo "Installing MCP dependencies..."
npm install --prefix "$MP/plugins/daemux-dev-toolkit/mcp-servers/deploy" --production --silent 2>/dev/null
npm install --prefix "$MP/plugins/daemux-dev-toolkit/mcp-servers/tailwindcss" --production --silent 2>/dev/null

echo "Updating marketplace registration..."
KNOWN_MP=~/.claude/plugins/known_marketplaces.json
[ ! -f "$KNOWN_MP" ] && echo '{}' > "$KNOWN_MP"
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$KNOWN_MP', 'utf8'));
data['daemux-claude-plugins'] = {
  source: { source: 'github', repo: 'daemux/daemux-plugins' },
  installLocation: '$MP',
  lastUpdated: new Date().toISOString()
};
fs.writeFileSync('$KNOWN_MP', JSON.stringify(data, null, 2) + '\n');
"

echo "Installing plugin (scope: $SCOPE)..."
claude plugin install daemux-dev-toolkit@daemux-claude-plugins --scope $SCOPE 2>/dev/null || \
  claude plugin update daemux-dev-toolkit@daemux-claude-plugins --scope $SCOPE

# Configure default model in global settings (applies to both global and project installs)
# DISABLED: sonnet[1m] currently broken for Max 20x users (regression since Dec 2025)
# See: https://github.com/anthropics/claude-code/issues/15057
# Uncomment when Anthropic fixes the 1M context beta availability
#
# echo "Configuring default model..."
# GLOBAL_SETTINGS=~/.claude/settings.json
# if [ ! -f "$GLOBAL_SETTINGS" ]; then
#   echo '{}' > "$GLOBAL_SETTINGS"
# fi
#
# node -e "
# const fs = require('fs');
# const settings = JSON.parse(fs.readFileSync('$GLOBAL_SETTINGS', 'utf8'));
#
# // Set default model to sonnet[1m] (Sonnet 4.5 with 1M context)
# // Updates existing config unless already sonnet[1m]
# if (settings.model === 'sonnet[1m]') {
#   console.log('Model already set to sonnet[1m]');
# } else if (settings.model) {
#   const oldModel = settings.model;
#   settings.model = 'sonnet[1m]';
#   fs.writeFileSync('$GLOBAL_SETTINGS', JSON.stringify(settings, null, 2) + '\n');
#   console.log('Updated model: ' + oldModel + ' → sonnet[1m] (Sonnet 4.5 with 1M context)');
# } else {
#   settings.model = 'sonnet[1m]';
#   fs.writeFileSync('$GLOBAL_SETTINGS', JSON.stringify(settings, null, 2) + '\n');
#   console.log('Set default model to sonnet[1m] (Sonnet 4.5 with 1M token context)');
# }
# "

if [ "$SCOPE" = "user" ]; then
  TEMPLATE_SOURCE="$MP/templates/CLAUDE.md.template"
  mkdir -p ~/.claude
  if [ -f "$TEMPLATE_SOURCE" ]; then
    echo "Installing CLAUDE.md..."
    cp "$TEMPLATE_SOURCE" ~/.claude/CLAUDE.md
  fi
  echo ""
  echo "Done! Plugin installed globally."
  echo ""
  echo "Note: Global install skips project settings. Configure env vars manually if needed."
  exit 0
fi

SETTINGS=".claude/settings.json"
mkdir -p .claude

TEMPLATE_SOURCE="$MP/templates/CLAUDE.md.template"
if [ -f "$TEMPLATE_SOURCE" ]; then
  echo "Installing CLAUDE.md..."
  cp "$TEMPLATE_SOURCE" ".claude/CLAUDE.md"
fi

[ ! -f "$SETTINGS" ] && echo '{}' > "$SETTINGS"

echo "Configuring project settings..."
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS', 'utf8'));

settings.env = settings.env || {};

const defaults = {
  'CLAUDE_CODE_ENABLE_TASKS': 'true',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS': '1',
  'GEMINI_API_KEY': '',
  'NANOBANANA_MODEL': 'gemini-3-pro-image-preview',
  'DEPLOY_SERVER_USER': '',
  'DEPLOY_SERVER_IP': '',
  'DEPLOY_SERVER_PORT': '22',
  'DEPLOY_PROJECT_NAME': '',
  'DEPLOY_REMOTE_PATH': '',
  'DEPLOY_SERVICES': '',
  'DEPLOY_AUTH_METHOD': 'key',
  'DEPLOY_SSH_KEY_PATH': '',
  'DEPLOY_DB_HOST': '',
  'DEPLOY_DB_PORT': '5432',
  'DEPLOY_DB_NAME': '',
  'DEPLOY_DB_USER': '',
  'DEPLOY_DB_PASSWORD': ''
};

const added = [];
for (const [key, value] of Object.entries(defaults)) {
  if (!(key in settings.env)) {
    settings.env[key] = value;
    added.push(key);
  }
}

fs.writeFileSync('$SETTINGS', JSON.stringify(settings, null, 2) + '\n');
console.log(added.length > 0 ? 'Added env vars: ' + added.join(', ') : 'All env vars already configured');
"

echo ""
echo "Done! Plugin installed successfully."
echo ""
echo "Next steps:"
echo "  1. Edit .claude/settings.json to configure your deploy server settings"
echo "  2. Set GEMINI_API_KEY if using nano-banana image generation"
