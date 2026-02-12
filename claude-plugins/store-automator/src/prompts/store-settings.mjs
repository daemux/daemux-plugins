import {
  runGuide, askQuestion, getDefault, getDefaultWithFallback, printSectionHeader,
} from '../guide.mjs';

const IOS_KEYS = ['primaryCategory', 'secondaryCategory', 'priceTier', 'submitForReview', 'automaticRelease'];
const ANDROID_KEYS = ['track', 'rolloutFraction', 'inAppUpdatePriority'];

function allKeysFilled(keys, cliFlags, currentConfig) {
  return keys.every((k) => {
    const val = getDefault(k, cliFlags, currentConfig);
    return val !== '' && val !== undefined;
  });
}

async function promptIosSettings(rl, cliFlags, currentConfig) {
  const iosFilled = allKeysFilled(IOS_KEYS, cliFlags, currentConfig);

  await runGuide(rl, {
    title: 'Create App in App Store Connect',
    steps: [
      'Go to App Store Connect -> My Apps -> +',
      'Select your Bundle ID',
      'Fill in app name and primary language',
      'Save the app',
    ],
    confirmQuestion: 'Have you created the app in App Store Connect?',
  }, { skip: iosFilled });

  const primaryCat = getDefault('primaryCategory', cliFlags, currentConfig);
  const primaryCategory = await askQuestion(
    rl, 'iOS Primary Category (e.g. GAMES, UTILITIES)', primaryCat, { skipIfFilled: !!primaryCat }
  );

  const secCat = getDefault('secondaryCategory', cliFlags, currentConfig);
  const secondaryCategory = await askQuestion(
    rl, 'iOS Secondary Category (optional)', secCat, { skipIfFilled: !!secCat }
  );

  const priceVal = getDefaultWithFallback('priceTier', cliFlags, currentConfig, '0');
  const priceTier = await askQuestion(
    rl, 'iOS Price Tier', priceVal, { skipIfFilled: !!priceVal }
  );

  const submitVal = getDefaultWithFallback('submitForReview', cliFlags, currentConfig, 'true');
  const submitForReview = await askQuestion(
    rl, 'Auto-submit for review? (true/false)', submitVal, { skipIfFilled: !!submitVal }
  );

  const autoVal = getDefaultWithFallback('automaticRelease', cliFlags, currentConfig, 'true');
  const automaticRelease = await askQuestion(
    rl, 'Automatic release after approval? (true/false)', autoVal, { skipIfFilled: !!autoVal }
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
  const androidFilled = allKeysFilled(ANDROID_KEYS, cliFlags, currentConfig);

  await runGuide(rl, {
    title: 'Create App in Google Play Console',
    steps: [
      'Go to Google Play Console -> All apps -> Create app',
      'Enter app name and default language',
      'Select app type (App) and free/paid',
      'Complete the declarations and create',
    ],
    confirmQuestion: 'Have you created the app in Google Play Console?',
  }, { skip: androidFilled });

  const trackVal = getDefaultWithFallback('track', cliFlags, currentConfig, 'internal');
  const track = await askQuestion(
    rl, 'Android release track (internal/alpha/beta/production)', trackVal, { skipIfFilled: !!trackVal }
  );

  const rolloutVal = getDefaultWithFallback('rolloutFraction', cliFlags, currentConfig, '1.0');
  const rolloutFraction = await askQuestion(
    rl, 'Rollout fraction (0.0 - 1.0)', rolloutVal, { skipIfFilled: !!rolloutVal }
  );

  const priorityVal = getDefaultWithFallback('inAppUpdatePriority', cliFlags, currentConfig, '3');
  const inAppUpdatePriority = await askQuestion(
    rl, 'In-app update priority (0-5)', priorityVal, { skipIfFilled: !!priorityVal }
  );

  return {
    track,
    rolloutFraction: Number(rolloutFraction) || 1.0,
    inAppUpdatePriority: Number(inAppUpdatePriority) || 3,
  };
}

async function promptMetadataSettings(rl, cliFlags, currentConfig) {
  const langVal = getDefaultWithFallback('languages', cliFlags, currentConfig, 'en-US');
  const languages = await askQuestion(
    rl, 'Metadata languages (comma-separated, e.g. en-US,de-DE)', langVal, { skipIfFilled: !!langVal }
  );

  return { languages: languages.split(',').map((l) => l.trim()).filter(Boolean) };
}

export async function promptStoreSettings(rl, cliFlags, currentConfig) {
  const iosFilled = allKeysFilled(IOS_KEYS, cliFlags, currentConfig);
  const androidFilled = allKeysFilled(ANDROID_KEYS, cliFlags, currentConfig);
  const langVal = getDefaultWithFallback('languages', cliFlags, currentConfig, 'en-US');
  const allFilled = iosFilled && androidFilled && !!langVal;

  if (!allFilled) {
    printSectionHeader('Store Settings');
  }

  const ios = await promptIosSettings(rl, cliFlags, currentConfig);
  const android = await promptAndroidSettings(rl, cliFlags, currentConfig);
  const metadata = await promptMetadataSettings(rl, cliFlags, currentConfig);

  return { ...ios, ...android, ...metadata };
}

const WEB_KEYS = [
  'domain', 'cfProjectName', 'tagline', 'primaryColor', 'secondaryColor',
  'companyName', 'contactEmail', 'supportEmail', 'jurisdiction',
];

export async function promptWebSettings(rl, cliFlags, currentConfig) {
  const webFilled = WEB_KEYS.every((k) => !!getDefault(k, cliFlags, currentConfig));

  if (!webFilled) {
    printSectionHeader('Web Settings');
  }

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
    const val = getDefault(field.key, cliFlags, currentConfig);
    result[field.key] = await askQuestion(rl, field.label, val, { skipIfFilled: !!val });
  }
  return result;
}

export async function runPostInstallGuides(rl, currentConfig = {}) {
  const hasRepo = !!currentConfig._githubRepoConfigured;
  const hasSecrets = !!currentConfig._githubSecretsConfigured;
  const hasFirebase = !!currentConfig._firebaseConfigured;

  await runGuide(rl, {
    title: 'Create Private GitHub Repository',
    steps: [
      'Go to github.com/new',
      'Create a PRIVATE repository',
      'Push your project to the repository',
    ],
    confirmQuestion: 'Have you created the GitHub repository?',
  }, { skip: hasRepo });

  await runGuide(rl, {
    title: 'Set GitHub Actions Secrets',
    steps: [
      'Go to your repo -> Settings -> Secrets -> Actions',
      'Add secret MATCH_PASSWORD (your match encryption password)',
      'Add secret KEYSTORE_PASSWORD (your Android keystore password)',
      'Upload creds/ files as secrets if using CI',
    ],
    confirmQuestion: 'Have you configured GitHub Actions secrets?',
  }, { skip: hasSecrets });

  await runGuide(rl, {
    title: 'Create Firebase Project (optional)',
    steps: [
      'Go to console.firebase.google.com',
      'Create a new project or select existing',
      'Add your iOS and Android apps',
      'Download google-services.json and GoogleService-Info.plist',
    ],
    confirmQuestion: 'Have you set up Firebase? (skip if not needed)',
  }, { skip: hasFirebase });
}
