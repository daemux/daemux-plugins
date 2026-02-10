#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(__filename));
const cpDir = join(repoRoot, 'claude-plugins', 'default-development');

function readJsonFile(relPath) {
  const fullPath = join(cpDir, relPath);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

const pkg = readJsonFile('package.json');
const marketplace = readJsonFile('.claude-plugin/marketplace.json');
const plugin = readJsonFile('plugins/daemux-dev-toolkit/.claude-plugin/plugin.json');

const versions = {
  'package.json': pkg.version,
  'marketplace.json (metadata)': marketplace.metadata.version,
  'marketplace.json (plugin)': marketplace.plugins[0].version,
  'plugin.json': plugin.version,
};

const values = new Set(Object.values(versions));

console.log('Version check:');
for (const [source, version] of Object.entries(versions)) {
  console.log(`  ${source}: ${version}`);
}

if (values.size !== 1) {
  console.error('\nERROR: Version mismatch detected! All versions must be identical.');
  process.exit(1);
}

console.log(`\nAll versions in sync: ${pkg.version}`);
