import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CI_CONFIG_FILE = 'ci.config.yaml';
const FIELD_PATTERNS = {
  app_id: /^(\s*app_id:\s*)"[^"]*"/m,
  team_id: /^(\s*team_id:\s*)"[^"]*"/m,
};

function writeCiField(projectDir, field, value) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return false;

  try {
    const pattern = FIELD_PATTERNS[field];
    const content = readFileSync(configPath, 'utf8');
    if (!pattern.test(content)) return false;

    const updated = content.replace(pattern, `$1"${value}"`);
    if (updated === content) return false;

    writeFileSync(configPath, updated, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function writeCiAppId(projectDir, appId) {
  return writeCiField(projectDir, 'app_id', appId);
}

export function writeCiTeamId(projectDir, teamId) {
  return writeCiField(projectDir, 'team_id', teamId);
}
