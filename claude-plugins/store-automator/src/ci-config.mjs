import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CI_CONFIG_FILE = 'ci.config.yaml';
const APP_ID_PATTERN = /^(\s*app_id:\s*)"[^"]*"/m;

export function writeCiAppId(projectDir, appId) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return false;

  try {
    const content = readFileSync(configPath, 'utf8');
    if (!APP_ID_PATTERN.test(content)) return false;

    const updated = content.replace(APP_ID_PATTERN, `$1"${appId}"`);
    if (updated === content) return false;

    writeFileSync(configPath, updated, 'utf8');
    return true;
  } catch {
    return false;
  }
}
