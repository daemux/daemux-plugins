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
  local target_path="$1"
  local template_source="$MP/templates/CLAUDE.md.template"

  if [ -f "$template_source" ]; then
    echo "Installing CLAUDE.md..."
    mkdir -p "$(dirname "$target_path")"
    cp "$template_source" "$target_path"
  fi
}

# Inject statusLine into a settings.json file (non-destructive)
# Note: no error suppression -- install failures should be visible (set -e)
inject_status_line() {
  local settings_file="$1"

  if [ ! -f "$settings_file" ]; then
    mkdir -p "$(dirname "$settings_file")"
    echo '{}' > "$settings_file"
  fi

  node -e "
const fs = require('fs');
const filePath = process.argv[1];
const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));

if (settings.statusLine) {
  console.log('statusLine already configured (keeping existing), skipping Daemux statusLine');
} else {
  const parts = [
    'input=\$(cat)',
    'user=\$(whoami)',
    'host=\$(hostname -s)',
    'dir=\$(basename \"\$(echo \"\$input\" | jq -r \".workspace.current_dir\")\")',
    'model=\$(echo \"\$input\" | jq -r \".model.display_name\")',
    'used=\$(echo \"\$input\" | jq -r \".context_window.used_percentage // empty\")',
    'remaining=\$(echo \"\$input\" | jq -r \".context_window.remaining_percentage // empty\")',
    'if [ -n \"\$used\" ]; then',
    '  ctx_info=\$(printf \"Context: %.1f%% used (%.1f%% remaining)\" \"\$used\" \"\$remaining\")',
    'else',
    '  ctx_info=\"Context: N/A\"',
    'fi',
    'printf \"%s@%s:%s | %s | %s\" \"\$user\" \"\$host\" \"\$dir\" \"\$model\" \"\$ctx_info\"'
  ];
  settings.statusLine = { type: 'command', command: parts.join('; ') };
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Added statusLine configuration');
}
" -- "$settings_file" \
  || { echo "Warning: could not configure statusLine (invalid settings.json?)"; }
}

# Remove statusLine from a settings.json file
remove_status_line() {
  local settings_file="$1"

  if [ ! -f "$settings_file" ]; then
    return
  fi

  node -e "
const fs = require('fs');
const filePath = process.argv[1];
const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));

if (settings.statusLine) {
  delete settings.statusLine;
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Removed statusLine configuration');
}
" -- "$settings_file" 2>/dev/null || true
}

# Inject required env vars into a settings.json file (non-destructive)
inject_env_vars() {
  local settings_file="$1"

  if [ ! -f "$settings_file" ]; then
    mkdir -p "$(dirname "$settings_file")"
    echo '{}' > "$settings_file"
  fi

  node -e "
const fs = require('fs');
const filePath = process.argv[1];
const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));

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

if (added.length > 0) {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Added env vars: ' + added.join(', '));
} else {
  console.log('All env vars already configured');
}
" -- "$settings_file" \
  || { echo "Warning: could not configure env vars (invalid settings.json?)"; }
}

# Remove plugin env vars from a settings.json file
remove_env_vars() {
  local settings_file="$1"

  if [ ! -f "$settings_file" ]; then
    return
  fi

  node -e "
const fs = require('fs');
const filePath = process.argv[1];
const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));

if (settings.env) {
  delete settings.env.CLAUDE_CODE_ENABLE_TASKS;
  delete settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

  if (Object.keys(settings.env).length === 0) {
    delete settings.env;
  }

  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Removed env vars');
}
" -- "$settings_file" 2>/dev/null || true
}

# Uninstall mode
if [ "$ACTION" = "uninstall" ]; then
  echo "Uninstalling Daemux Claude Plugins (scope: $SCOPE)..."

  # Uninstall the plugin
  if [ "$SCOPE" = "user" ]; then
    claude plugin uninstall daemux-dev-toolkit@daemux-claude-plugins 2>/dev/null || true
  else
    claude plugin uninstall daemux-dev-toolkit@daemux-claude-plugins --scope $SCOPE 2>/dev/null || true
  fi

  if [ "$SCOPE" = "user" ]; then
    # Global uninstall - remove marketplace and global CLAUDE.md
    echo "Removing marketplace..."
    rm -rf "$MP"
    rm -rf ~/.claude/plugins/cache/daemux-claude-plugins

    echo "Removing marketplace registration..."
    if [ -f "$KNOWN_MP" ]; then
      node -e "
const fs = require('fs');
const filePath = process.argv[1];
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
delete data['daemux-claude-plugins'];
fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
" -- "$KNOWN_MP" 2>/dev/null || true
    fi

    if [ -f ~/.claude/CLAUDE.md ]; then
      echo "Removing global CLAUDE.md..."
      rm -f ~/.claude/CLAUDE.md
    fi

    echo "Cleaning global env vars..."
    remove_env_vars ~/.claude/settings.json

    echo "Cleaning global statusLine..."
    remove_status_line ~/.claude/settings.json

    echo ""
    echo "Done! Plugin uninstalled globally."
  else
    # Project uninstall - only remove project settings
    if [ -f .claude/CLAUDE.md ]; then
      echo "Removing project CLAUDE.md..."
      rm -f .claude/CLAUDE.md
    fi

    SETTINGS=".claude/settings.json"
    echo "Cleaning project settings..."
    remove_env_vars "$SETTINGS"

    echo "Cleaning project statusLine..."
    remove_status_line "$SETTINGS"

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

# Capture previous version before overwriting
OLD_VERSION=""
OLD_MP_JSON="$MP/.claude-plugin/marketplace.json"
if [ -f "$OLD_MP_JSON" ]; then
  OLD_VERSION=$(node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    console.log(data.metadata.version);
  " -- "$OLD_MP_JSON" 2>/dev/null || true)
fi

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
const filePath = process.argv[1];
const installDir = process.argv[2];
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
data['daemux-claude-plugins'] = {
  source: { source: 'github', repo: 'daemux/daemux-plugins' },
  installLocation: installDir,
  lastUpdated: new Date().toISOString()
};
fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
" -- "$KNOWN_MP" "$MP"

echo "Installing plugin (scope: $SCOPE)..."
if [ "$SCOPE" = "user" ]; then
  claude plugin install daemux-dev-toolkit@daemux-claude-plugins
else
  claude plugin install daemux-dev-toolkit@daemux-claude-plugins --scope $SCOPE
fi

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

# Read new version
NEW_MP_JSON="$MP/.claude-plugin/marketplace.json"
NEW_VERSION=$(node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  console.log(data.metadata.version);
" -- "$NEW_MP_JSON" 2>/dev/null || true)

if [ "$SCOPE" = "user" ]; then
  install_claude_md ~/.claude/CLAUDE.md

  echo "Configuring global env vars..."
  inject_env_vars ~/.claude/settings.json

  echo "Configuring global statusLine..."
  inject_status_line ~/.claude/settings.json

  echo ""
  if [ -n "$OLD_VERSION" ] && [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
    echo "Done! Plugin updated globally: v${OLD_VERSION} → v${NEW_VERSION}"
  elif [ -n "$OLD_VERSION" ]; then
    echo "Done! Plugin reinstalled globally (v${NEW_VERSION})"
  else
    echo "Done! Plugin installed globally (v${NEW_VERSION})"
  fi
  echo ""
  echo "Note: Global install does not modify project-level settings."
  exit 0
fi

SETTINGS=".claude/settings.json"
mkdir -p .claude

install_claude_md .claude/CLAUDE.md

echo "Configuring project settings..."
inject_env_vars "$SETTINGS"

echo "Configuring project statusLine..."
inject_status_line "$SETTINGS"

echo ""
if [ -n "$OLD_VERSION" ] && [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
  echo "Done! Plugin updated: v${OLD_VERSION} → v${NEW_VERSION}"
elif [ -n "$OLD_VERSION" ]; then
  echo "Done! Plugin reinstalled (v${NEW_VERSION})"
else
  echo "Done! Plugin installed (v${NEW_VERSION})"
fi
echo ""
echo "The plugin is ready to use. Configure additional env vars in .claude/settings.json as needed."
