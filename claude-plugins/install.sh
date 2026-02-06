#!/bin/bash
# Daemux Claude Plugins - Install/Update/Uninstall Script
# Run from any project directory to install, update, or uninstall the plugin

set -e

# Parse arguments
SCOPE="project"
ACTION="install"
while [[ $# -gt 0 ]]; do
  case $1 in
    -g|--global)
      SCOPE="user"
      shift
      ;;
    -u|--uninstall)
      ACTION="uninstall"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Common paths
MP=~/.claude/plugins/marketplaces/daemux-claude-plugins
KNOWN_MP=~/.claude/plugins/known_marketplaces.json

# Install CLAUDE.md template
install_claude_md() {
  local target_path=$1
  local template_source="$MP/templates/CLAUDE.md.template"

  if [ -f "$template_source" ]; then
    echo "Installing CLAUDE.md..."
    mkdir -p "$(dirname "$target_path")"
    cp "$template_source" "$target_path"
  fi
}

# Uninstall mode
if [ "$ACTION" = "uninstall" ]; then
  echo "Uninstalling Daemux Claude Plugins (scope: $SCOPE)..."

  # Uninstall the plugin
  claude plugin uninstall daemux-dev-toolkit@daemux-claude-plugins --scope $SCOPE 2>/dev/null || true

  if [ "$SCOPE" = "user" ]; then
    # Global uninstall - remove marketplace and global CLAUDE.md
    echo "Removing marketplace..."
    rm -rf "$MP"
    rm -rf ~/.claude/plugins/cache/daemux-claude-plugins

    echo "Removing marketplace registration..."
    if [ -f "$KNOWN_MP" ]; then
      node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$KNOWN_MP', 'utf8'));
delete data['daemux-claude-plugins'];
fs.writeFileSync('$KNOWN_MP', JSON.stringify(data, null, 2) + '\n');
" 2>/dev/null || true
    fi

    if [ -f ~/.claude/CLAUDE.md ]; then
      echo "Removing global CLAUDE.md..."
      rm -f ~/.claude/CLAUDE.md
    fi

    echo ""
    echo "Done! Plugin uninstalled globally."
  else
    # Project uninstall - only remove project settings
    if [ -f .claude/CLAUDE.md ]; then
      echo "Removing project CLAUDE.md..."
      rm -f .claude/CLAUDE.md
    fi

    # Remove env vars from project settings
    SETTINGS=".claude/settings.json"
    if [ -f "$SETTINGS" ]; then
      echo "Cleaning project settings..."
      node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS', 'utf8'));

if (settings.env) {
  delete settings.env.CLAUDE_CODE_ENABLE_TASKS;
  delete settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

  // Remove env object if empty
  if (Object.keys(settings.env).length === 0) {
    delete settings.env;
  }
}

fs.writeFileSync('$SETTINGS', JSON.stringify(settings, null, 2) + '\n');
" 2>/dev/null || true
    fi

    echo ""
    echo "Done! Plugin uninstalled from this project."
    echo ""
    echo "Note: Marketplace files remain in $MP"
    echo "Run with --global --uninstall to remove marketplace completely."
  fi

  exit 0
fi

# Install/Update mode
if ! command -v claude &> /dev/null; then
  echo "Claude CLI not found. Installing..."
  curl -fsSL https://claude.ai/install.sh | bash
  echo ""
fi

echo "Installing/updating Daemux Claude Plugins..."

TEMP_DIR=$(mktemp -d)
echo "Fetching latest plugins..."
git clone --depth 1 https://github.com/daemux/daemux-plugins.git "$TEMP_DIR" 2>/dev/null

echo "Installing marketplace..."
rm -rf "$MP"
mkdir -p "$MP"
cp -a "$TEMP_DIR/claude-plugins/." "$MP/"
rm -rf "$TEMP_DIR"

rm -rf ~/.claude/plugins/marketplaces/daemux-daemux-plugins 2>/dev/null || true

echo "Clearing plugin cache..."
rm -rf ~/.claude/plugins/cache/daemux-claude-plugins 2>/dev/null || true

echo "Updating marketplace registration..."
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
  install_claude_md ~/.claude/CLAUDE.md
  echo ""
  echo "Done! Plugin installed globally."
  echo ""
  echo "Note: Global install skips project settings. Configure env vars manually if needed."
  exit 0
fi

SETTINGS=".claude/settings.json"
mkdir -p .claude

install_claude_md .claude/CLAUDE.md

[ ! -f "$SETTINGS" ] && echo '{}' > "$SETTINGS"

echo "Configuring project settings..."
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS', 'utf8'));

settings.env = settings.env || {};

const defaults = {
  'CLAUDE_CODE_ENABLE_TASKS': 'true',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS': '1'
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
echo "The plugin is ready to use. Configure additional env vars in .claude/settings.json as needed."
