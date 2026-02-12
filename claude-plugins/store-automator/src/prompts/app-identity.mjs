import { askQuestion, getDefault, printSectionHeader } from '../guide.mjs';

const FIELDS = [
  { key: 'appName', label: 'App Name (display name)' },
  { key: 'bundleId', label: 'Bundle ID (e.g. com.company.app)' },
  { key: 'packageName', label: 'Android Package Name' },
  { key: 'sku', label: 'App Store Connect SKU' },
  { key: 'appleId', label: 'Apple Developer Account Email' },
];

export async function promptAppIdentity(rl, cliFlags, currentConfig) {
  const allFilled = FIELDS.every((f) => !!getDefault(f.key, cliFlags, currentConfig));

  if (!allFilled) {
    printSectionHeader('App Identity');
  }

  const result = {};

  for (const field of FIELDS) {
    const flagVal = getDefault(field.key, cliFlags, currentConfig);
    if (flagVal) {
      result[field.key] = flagVal;
      continue;
    }

    result[field.key] = await askQuestion(rl, field.label, '');
  }

  if (!result.packageName && result.bundleId) {
    result.packageName = result.bundleId;
  }

  return result;
}
