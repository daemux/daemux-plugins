import { askQuestion, isPlaceholder } from '../guide.mjs';

const FIELDS = [
  {
    key: 'appName',
    label: 'App Name (display name)',
    configKey: 'app.name',
    flag: 'appName',
  },
  {
    key: 'bundleId',
    label: 'Bundle ID (e.g. com.company.app)',
    configKey: 'bundle_id',
    flag: 'bundleId',
  },
  {
    key: 'packageName',
    label: 'Android Package Name',
    configKey: 'android.package_name',
    flag: 'packageName',
  },
  {
    key: 'sku',
    label: 'App Store Connect SKU',
    configKey: 'ios.sku',
    flag: 'sku',
  },
  {
    key: 'appleId',
    label: 'Apple Developer Account Email',
    configKey: 'ios.apple_id',
    flag: 'appleId',
  },
];

function getDefault(key, cliFlags, currentConfig) {
  if (cliFlags[key] !== undefined) return cliFlags[key];
  const configVal = currentConfig[key];
  if (!isPlaceholder(configVal)) return configVal;
  return '';
}

export async function promptAppIdentity(rl, cliFlags, currentConfig) {
  console.log('');
  console.log('\x1b[1m\x1b[36m=== App Identity ===\x1b[0m');
  console.log('');

  const result = {};

  for (const field of FIELDS) {
    const flagVal = cliFlags[field.flag];
    if (flagVal !== undefined) {
      result[field.key] = flagVal;
      continue;
    }

    const defaultVal = getDefault(field.key, cliFlags, currentConfig);
    result[field.key] = await askQuestion(rl, field.label, defaultVal);
  }

  if (!result.packageName && result.bundleId) {
    result.packageName = result.bundleId;
  }

  return result;
}
