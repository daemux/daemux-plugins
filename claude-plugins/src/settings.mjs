import { existsSync } from 'node:fs';
import { ensureFile, readJson, writeJson } from './utils.mjs';

const ENV_DEFAULTS = {
  CLAUDE_CODE_ENABLE_TASKS: 'true',
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
};

const STATUS_LINE_PARTS = [
  'input=$(cat)',
  'user=$(whoami)',
  'host=$(hostname -s)',
  'dir=$(basename "$(echo "$input" | jq -r ".workspace.current_dir")")',
  'model=$(echo "$input" | jq -r ".model.display_name")',
  'used=$(echo "$input" | jq -r ".context_window.used_percentage // empty")',
  'remaining=$(echo "$input" | jq -r ".context_window.remaining_percentage // empty")',
  'if [ -n "$used" ]; then',
  '  ctx_info=$(printf "Context: %.1f%% used (%.1f%% remaining)" "$used" "$remaining")',
  'else',
  '  ctx_info="Context: N/A"',
  'fi',
  'printf "%s@%s:%s | %s | %s" "$user" "$host" "$dir" "$model" "$ctx_info"',
];

export function injectEnvVars(settingsPath) {
  try {
    ensureFile(settingsPath);
    const settings = readJson(settingsPath);
    settings.env = settings.env || {};

    const added = [];
    for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
      if (!(key in settings.env)) {
        settings.env[key] = value;
        added.push(key);
      }
    }

    if (added.length > 0) {
      writeJson(settingsPath, settings);
      console.log(`Added env vars: ${added.join(', ')}`);
    } else {
      console.log('All env vars already configured');
    }
  } catch (err) {
    console.log(`Warning: could not configure env vars (${err.message})`);
  }
}

export function removeEnvVars(settingsPath) {
  if (!existsSync(settingsPath)) return;

  try {
    const settings = readJson(settingsPath);
    if (!settings.env) return;

    for (const key of Object.keys(ENV_DEFAULTS)) {
      delete settings.env[key];
    }

    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }

    writeJson(settingsPath, settings);
    console.log('Removed env vars');
  } catch {
    // Silently skip if settings file is invalid
  }
}

export function injectStatusLine(settingsPath) {
  try {
    ensureFile(settingsPath);
    const settings = readJson(settingsPath);

    if (settings.statusLine) {
      console.log('statusLine already configured, skipping');
      return;
    }

    settings.statusLine = {
      type: 'command',
      command: STATUS_LINE_PARTS.join('; '),
    };
    writeJson(settingsPath, settings);
    console.log('Added statusLine configuration');
  } catch (err) {
    console.log(`Warning: could not configure statusLine (${err.message})`);
  }
}

export function removeStatusLine(settingsPath) {
  if (!existsSync(settingsPath)) return;

  try {
    const settings = readJson(settingsPath);
    if (!settings.statusLine) return;

    delete settings.statusLine;
    writeJson(settingsPath, settings);
    console.log('Removed statusLine configuration');
  } catch {
    // Silently skip if settings file is invalid
  }
}
