#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspace = process.argv[2];
if (!workspace) { console.error('Usage: auto-version.mjs <workspace-dir>'); process.exit(1); }

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, data) { writeFileSync(path, JSON.stringify(data, null, 2) + '\n'); }

function updateJsonVersion(path, version) {
  if (!existsSync(path)) return;
  const data = readJson(path);
  data.version = version;
  writeJson(path, data);
}

const pkgPath = join(rootDir, workspace, 'package.json');
const pkg = readJson(pkgPath);

let published = '0.0.0';
try {
  published = execSync(`npm view ${pkg.name} version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString() : '';
  if (stderr.includes('E404')) {
    // Package not yet published
  } else {
    console.error(`Failed to query npm for ${pkg.name}: ${stderr || err.message}`);
    process.exit(1);
  }
}

const parts = published.split('.').map(Number);
if (parts.length !== 3 || parts.some(isNaN)) {
  console.error(`Unexpected version format from npm: "${published}"`);
  process.exit(1);
}
parts[2] += 1;
const newVersion = parts.join('.');

pkg.version = newVersion;
writeJson(pkgPath, pkg);

updateJsonVersion(join(rootDir, workspace, '.claude-plugin', 'plugin.json'), newVersion);

const marketplacePath = join(rootDir, workspace, '.claude-plugin', 'marketplace.json');
if (existsSync(marketplacePath)) {
  const mj = readJson(marketplacePath);
  if (mj.metadata) mj.metadata.version = newVersion;
  if (mj.plugins?.[0]) {
    mj.plugins[0].version = newVersion;
    updateJsonVersion(
      join(rootDir, workspace, mj.plugins[0].source, '.claude-plugin', 'plugin.json'),
      newVersion
    );
  }
  writeJson(marketplacePath, mj);
}

console.log(newVersion);
