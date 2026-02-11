import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CI_CONFIG_FILE = 'ci.config.yaml';
const FIELD_PATTERNS = {
  app_id: /^(\s*app_id:\s*)"[^"]*"/m,
  team_id: /^(\s*team_id:\s*)"[^"]*"/m,
  bundle_id: /^(\s*bundle_id:\s*)"[^"]*"/m,
  package_name: /^(\s*package_name:\s*)"[^"]*"/m,
};

function writeCiField(projectDir, field, value) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return false;

  try {
    const pattern = FIELD_PATTERNS[field];
    const content = readFileSync(configPath, 'utf8');
    if (!pattern.test(content)) return false;

    const safeValue = value.replace(/\$/g, '$$$$');
    const updated = content.replace(pattern, `$1"${safeValue}"`);
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

export function writeCiBundleId(projectDir, bundleId) {
  return writeCiField(projectDir, 'bundle_id', bundleId);
}

export function writeCiPackageName(projectDir, packageName) {
  return writeCiField(projectDir, 'package_name', packageName);
}
