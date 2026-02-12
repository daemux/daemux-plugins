import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CI_CONFIG_FILE = 'ci.config.yaml';

const KEY_TO_CAMEL = {
  'app.name': 'appName',
  'app.bundle_id': 'bundleId',
  'app.package_name': 'packageName',
  'app.sku': 'sku',
  'app.apple_id': 'appleId',
  'credentials.apple.key_id': 'keyId',
  'credentials.apple.issuer_id': 'issuerId',
  'credentials.android.keystore_password': 'keystorePassword',
  'ios.primary_category': 'primaryCategory',
  'ios.secondary_category': 'secondaryCategory',
  'ios.price_tier': 'priceTier',
  'ios.submit_for_review': 'submitForReview',
  'ios.automatic_release': 'automaticRelease',
  'android.track': 'track',
  'android.rollout_fraction': 'rolloutFraction',
  'android.in_app_update_priority': 'inAppUpdatePriority',
  'web.domain': 'domain',
  'web.cloudflare_project_name': 'cfProjectName',
  'web.tagline': 'tagline',
  'web.primary_color': 'primaryColor',
  'web.secondary_color': 'secondaryColor',
  'web.company_name': 'companyName',
  'web.contact_email': 'contactEmail',
  'web.support_email': 'supportEmail',
  'web.jurisdiction': 'jurisdiction',
  'metadata.languages': 'languages',
};

const FIELD_PATTERNS = {
  'app.name': { regex: /^(  name: ).*$/m, replacement: (v) => `  name: "${v}"` },
  'app.bundle_id': { regex: /^(  bundle_id: ).*$/m, replacement: (v) => `  bundle_id: "${v}"` },
  'app.package_name': { regex: /^(  package_name: ).*$/m, replacement: (v) => `  package_name: "${v}"` },
  'app.sku': { regex: /^(  sku: ).*$/m, replacement: (v) => `  sku: "${v}"` },
  'app.apple_id': { regex: /^(  apple_id: ).*$/m, replacement: (v) => `  apple_id: "${v}"` },
  'credentials.apple.key_id': {
    regex: /^(    key_id: ).*$/m, replacement: (v) => `    key_id: "${v}"`,
  },
  'credentials.apple.issuer_id': {
    regex: /^(    issuer_id: ).*$/m, replacement: (v) => `    issuer_id: "${v}"`,
  },
  'credentials.android.keystore_password': {
    regex: /^(    keystore_password: ).*$/m, replacement: (v) => `    keystore_password: "${v}"`,
  },
  'ios.primary_category': {
    regex: /^(  primary_category: ).*$/m, replacement: (v) => `  primary_category: "${v}"`,
  },
  'ios.secondary_category': {
    regex: /^(  secondary_category: ).*$/m, replacement: (v) => `  secondary_category: "${v}"`,
  },
  'ios.price_tier': { regex: /^(  price_tier: ).*$/m, replacement: (v) => `  price_tier: ${v}` },
  'ios.submit_for_review': {
    regex: /^(  submit_for_review: ).*$/m, replacement: (v) => `  submit_for_review: ${v}`,
  },
  'ios.automatic_release': {
    regex: /^(  automatic_release: ).*$/m, replacement: (v) => `  automatic_release: ${v}`,
  },
  'android.track': { regex: /^(  track: ).*$/m, replacement: (v) => `  track: "${v}"` },
  'android.rollout_fraction': {
    regex: /^(  rollout_fraction: ).*$/m, replacement: (v) => `  rollout_fraction: "${v}"`,
  },
  'android.in_app_update_priority': {
    regex: /^(  in_app_update_priority: ).*$/m, replacement: (v) => `  in_app_update_priority: ${v}`,
  },
  'web.domain': { regex: /^(  domain: ).*$/m, replacement: (v) => `  domain: "${v}"` },
  'web.cloudflare_project_name': {
    regex: /^(  cloudflare_project_name: ).*$/m, replacement: (v) => `  cloudflare_project_name: "${v}"`,
  },
  'web.tagline': { regex: /^(  tagline: ).*$/m, replacement: (v) => `  tagline: "${v}"` },
  'web.primary_color': {
    regex: /^(  primary_color: ).*$/m, replacement: (v) => `  primary_color: "${v}"`,
  },
  'web.secondary_color': {
    regex: /^(  secondary_color: ).*$/m, replacement: (v) => `  secondary_color: "${v}"`,
  },
  'web.company_name': {
    regex: /^(  company_name: ).*$/m, replacement: (v) => `  company_name: "${v}"`,
  },
  'web.contact_email': {
    regex: /^(  contact_email: ).*$/m, replacement: (v) => `  contact_email: "${v}"`,
  },
  'web.support_email': {
    regex: /^(  support_email: ).*$/m, replacement: (v) => `  support_email: "${v}"`,
  },
  'web.jurisdiction': {
    regex: /^(  jurisdiction: ).*$/m, replacement: (v) => `  jurisdiction: "${v}"`,
  },
  'web.app_store_url': {
    regex: /^(  app_store_url: ).*$/m, replacement: (v) => `  app_store_url: "${v}"`,
  },
  'web.google_play_url': {
    regex: /^(  google_play_url: ).*$/m, replacement: (v) => `  google_play_url: "${v}"`,
  },
};

function extractFieldValue(content, regex) {
  const match = content.match(regex);
  if (!match) return undefined;
  const line = match[0];
  const colonIdx = line.indexOf(':');
  if (colonIdx < 0) return undefined;
  const raw = line.slice(colonIdx + 1).trim();
  if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') return raw.slice(1, -1);
  return raw;
}

export { isPlaceholder } from './guide.mjs';

export function readCiConfig(projectDir) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return {};
  const content = readFileSync(configPath, 'utf-8');
  const raw = {};
  for (const [key, { regex }] of Object.entries(FIELD_PATTERNS)) {
    const val = extractFieldValue(content, regex);
    if (val !== undefined) raw[key] = val;
  }
  raw['metadata.languages'] = extractLanguages(content);

  const config = {};
  for (const [dotKey, value] of Object.entries(raw)) {
    const camelKey = KEY_TO_CAMEL[dotKey];
    if (camelKey) {
      config[camelKey] = value;
    } else {
      config[dotKey] = value;
    }
  }
  return config;
}

function extractLanguages(content) {
  const lines = content.split('\n');
  const langIdx = lines.findIndex((l) => /^\s*languages:\s*$/.test(l));
  if (langIdx < 0) return [];
  const langs = [];
  for (let i = langIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^\s+-\s+(.+)$/);
    if (!match) break;
    langs.push(match[1].trim());
  }
  return langs;
}

export function writeCiFields(projectDir, fields) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return false;
  let content = readFileSync(configPath, 'utf-8');
  let changed = false;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const pattern = FIELD_PATTERNS[key];
    if (!pattern) continue;
    const safeValue = String(value).replace(/\$/g, '$$$$');
    const updated = content.replace(pattern.regex, pattern.replacement(safeValue));
    if (updated !== content) {
      content = updated;
      changed = true;
    }
  }
  if (changed) writeFileSync(configPath, content, 'utf-8');
  return changed;
}

export function writeCiLanguages(projectDir, languagesStr) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return false;
  const langs = languagesStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (langs.length === 0) return false;

  const yamlLines = langs.map((l) => `    - ${l}`).join('\n');
  const content = readFileSync(configPath, 'utf-8');
  const updated = content.replace(
    /^(  languages:\s*)\n(?:\s+-\s+.+\n?)*/m,
    `$1\n${yamlLines}\n`
  );
  if (updated === content) return false;
  writeFileSync(configPath, updated, 'utf-8');
  return true;
}

export function writeCiBundleId(projectDir, bundleId) {
  return writeCiFields(projectDir, {
    'app.bundle_id': bundleId,
  });
}

export function writeCiPackageName(projectDir, packageName) {
  return writeCiFields(projectDir, {
    'app.package_name': packageName,
  });
}

export function writeMatchConfig(projectDir, { deployKeyPath, gitUrl }) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return false;
  let content = readFileSync(configPath, 'utf-8');
  let changed = false;

  const dpRegex = /^(\s*deploy_key_path:\s*)"[^"]*"/m;
  const guRegex = /^(\s*git_url:\s*)"[^"]*"/m;

  if (deployKeyPath && dpRegex.test(content)) {
    const safe = deployKeyPath.replace(/\$/g, '$$$$');
    content = content.replace(dpRegex, `$1"${safe}"`);
    changed = true;
  }
  if (gitUrl && guRegex.test(content)) {
    const safe = gitUrl.replace(/\$/g, '$$$$');
    content = content.replace(guRegex, `$1"${safe}"`);
    changed = true;
  }
  if (changed) writeFileSync(configPath, content, 'utf-8');
  return changed;
}

export function readFlutterRoot(projectDir) {
  const configPath = join(projectDir, CI_CONFIG_FILE);
  if (!existsSync(configPath)) return '.';
  try {
    const content = readFileSync(configPath, 'utf8');
    const match = content.match(/^flutter_root:\s*"([^"]*)"/m);
    return match ? match[1] : '.';
  } catch {
    return '.';
  }
}
