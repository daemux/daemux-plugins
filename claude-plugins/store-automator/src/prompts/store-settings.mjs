import { runGuide, askQuestion, isPlaceholder } from '../guide.mjs';

function getDefault(key, cliFlags, currentConfig) {
  if (cliFlags[key] !== undefined) return cliFlags[key];
  const configVal = currentConfig[key];
  if (!isPlaceholder(configVal)) return configVal;
  return '';
}

function getDefaultWithFallback(key, cliFlags, currentConfig, fallback) {
  const val = getDefault(key, cliFlags, currentConfig);
  return val !== '' ? val : fallback;
}

async function promptIosSettings(rl, cliFlags, currentConfig) {
  await runGuide(rl, {
    title: 'Create App in App Store Connect',
    steps: [
      'Go to App Store Connect -> My Apps -> +',
      'Select your Bundle ID',
      'Fill in app name and primary language',
      'Save the app',
    ],
    confirmQuestion: 'Have you created the app in App Store Connect?',
  });

  const primaryCategory = await askQuestion(
    rl,
    'iOS Primary Category (e.g. GAMES, UTILITIES)',
    getDefault('primaryCategory', cliFlags, currentConfig)
  );

  const secondaryCategory = await askQuestion(
    rl,
    'iOS Secondary Category (optional)',
    getDefault('secondaryCategory', cliFlags, currentConfig)
  );

  const priceTier = await askQuestion(
    rl,
    'iOS Price Tier',
    getDefaultWithFallback('priceTier', cliFlags, currentConfig, '0')
  );

  const submitForReview = await askQuestion(
    rl,
    'Auto-submit for review? (true/false)',
    getDefaultWithFallback('submitForReview', cliFlags, currentConfig, 'true')
  );

  const automaticRelease = await askQuestion(
    rl,
    'Automatic release after approval? (true/false)',
    getDefaultWithFallback('automaticRelease', cliFlags, currentConfig, 'true')
  );

  return {
    primaryCategory,
    secondaryCategory,
    priceTier: Number(priceTier) || 0,
    submitForReview: submitForReview === 'true',
    automaticRelease: automaticRelease === 'true',
  };
}

async function promptAndroidSettings(rl, cliFlags, currentConfig) {
  await runGuide(rl, {
    title: 'Create App in Google Play Console',
    steps: [
      'Go to Google Play Console -> All apps -> Create app',
      'Enter app name and default language',
      'Select app type (App) and free/paid',
      'Complete the declarations and create',
    ],
    confirmQuestion: 'Have you created the app in Google Play Console?',
  });

  const track = await askQuestion(
    rl,
    'Android release track (internal/alpha/beta/production)',
    getDefaultWithFallback('track', cliFlags, currentConfig, 'internal')
  );

  const rolloutFraction = await askQuestion(
    rl,
    'Rollout fraction (0.0 - 1.0)',
    getDefaultWithFallback('rolloutFraction', cliFlags, currentConfig, '1.0')
  );

  const inAppUpdatePriority = await askQuestion(
    rl,
    'In-app update priority (0-5)',
    getDefaultWithFallback('inAppUpdatePriority', cliFlags, currentConfig, '3')
  );

  return {
    track,
    rolloutFraction: Number(rolloutFraction) || 1.0,
    inAppUpdatePriority: Number(inAppUpdatePriority) || 3,
  };
}

async function promptMetadataSettings(rl, cliFlags, currentConfig) {
  const languages = await askQuestion(
    rl,
    'Metadata languages (comma-separated, e.g. en-US,de-DE)',
    getDefaultWithFallback('languages', cliFlags, currentConfig, 'en-US')
  );

  return { languages: languages.split(',').map((l) => l.trim()).filter(Boolean) };
}

export async function promptStoreSettings(rl, cliFlags, currentConfig) {
  console.log('');
  console.log('\x1b[1m\x1b[36m=== Store Settings ===\x1b[0m');
  console.log('');

  const ios = await promptIosSettings(rl, cliFlags, currentConfig);
  const android = await promptAndroidSettings(rl, cliFlags, currentConfig);
  const metadata = await promptMetadataSettings(rl, cliFlags, currentConfig);

  return { ...ios, ...android, ...metadata };
}

export async function promptWebSettings(rl, cliFlags, currentConfig) {
  console.log('');
  console.log('\x1b[1m\x1b[36m=== Web Settings ===\x1b[0m');
  console.log('');

  const fields = [
    { key: 'domain', label: 'Domain (e.g. example.com)' },
    { key: 'cfProjectName', label: 'Cloudflare Pages project name' },
    { key: 'tagline', label: 'App tagline' },
    { key: 'primaryColor', label: 'Primary color (hex, e.g. #4A90D9)' },
    { key: 'secondaryColor', label: 'Secondary color (hex)' },
    { key: 'companyName', label: 'Company name' },
    { key: 'contactEmail', label: 'Contact email' },
    { key: 'supportEmail', label: 'Support email' },
    { key: 'jurisdiction', label: 'Legal jurisdiction (e.g. Delaware, USA)' },
  ];

  const result = {};
  for (const field of fields) {
    result[field.key] = await askQuestion(
      rl,
      field.label,
      getDefault(field.key, cliFlags, currentConfig)
    );
  }
  return result;
}

export async function runPostInstallGuides(rl) {
  await runGuide(rl, {
    title: 'Create Private GitHub Repository',
    steps: [
      'Go to github.com/new',
      'Create a PRIVATE repository',
      'Push your project to the repository',
    ],
    confirmQuestion: 'Have you created the GitHub repository?',
  });

  await runGuide(rl, {
    title: 'Set GitHub Actions Secrets',
    steps: [
      'Go to your repo -> Settings -> Secrets -> Actions',
      'Add secret MATCH_PASSWORD (your match encryption password)',
      'Add secret KEYSTORE_PASSWORD (your Android keystore password)',
      'Upload creds/ files as secrets if using CI',
    ],
    confirmQuestion: 'Have you configured GitHub Actions secrets?',
  });

  await runGuide(rl, {
    title: 'Create Firebase Project (optional)',
    steps: [
      'Go to console.firebase.google.com',
      'Create a new project or select existing',
      'Add your iOS and Android apps',
      'Download google-services.json and GoogleService-Info.plist',
    ],
    confirmQuestion: 'Have you set up Firebase? (skip if not needed)',
  });
}
