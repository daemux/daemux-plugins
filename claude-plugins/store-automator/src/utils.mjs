import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const MARKETPLACE_NAME = 'daemux-store-automator';
export const PLUGIN_NAME = 'store-automator';
export const PLUGIN_REF = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

const home = homedir();
export const MARKETPLACE_DIR = join(home, '.claude', 'plugins', 'marketplaces', MARKETPLACE_NAME);
export const KNOWN_MP_PATH = join(home, '.claude', 'plugins', 'known_marketplaces.json');
export const CACHE_DIR = join(home, '.claude', 'plugins', 'cache', MARKETPLACE_NAME);

export function getPackageDir() {
  const thisFile = fileURLToPath(import.meta.url);
  return dirname(dirname(thisFile));
}

export function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

export function ensureFile(filePath, defaultContent = '{}') {
  ensureDir(dirname(filePath));
  if (!existsSync(filePath)) {
    writeFileSync(filePath, defaultContent, 'utf8');
  }
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
