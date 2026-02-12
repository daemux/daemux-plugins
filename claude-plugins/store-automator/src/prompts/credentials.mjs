import { join } from 'node:path';
import { runGuide, askQuestion, isPlaceholder } from '../guide.mjs';

function getDefault(key, cliFlags, currentConfig) {
  if (cliFlags[key] !== undefined) return cliFlags[key];
  const configVal = currentConfig[key];
  if (!isPlaceholder(configVal)) return configVal;
  return '';
}

async function promptAppStoreApiKey(rl, cliFlags, currentConfig, projectDir) {
  await runGuide(rl, {
    title: 'Create App Store Connect API Key',
    steps: [
      'Log in to App Store Connect (appstoreconnect.apple.com)',
      'Go to Users and Access -> Integrations -> Team Keys',
      'Click + to generate a new key with "App Manager" role',
      'Download the .p8 file',
      `Save to creds/AuthKey.p8 in your project`,
    ],
    verifyPath: join(projectDir, 'creds', 'AuthKey.p8'),
    verifyDescription: 'App Store Connect API Key (.p8)',
    confirmQuestion: 'Have you created and saved the API key?',
  });

  const keyId = await askQuestion(
    rl,
    'App Store Connect Key ID',
    getDefault('keyId', cliFlags, currentConfig)
  );

  const issuerId = await askQuestion(
    rl,
    'App Store Connect Issuer ID',
    getDefault('issuerId', cliFlags, currentConfig)
  );

  return { keyId, issuerId };
}

async function promptPlayServiceAccount(rl, projectDir) {
  await runGuide(rl, {
    title: 'Create Google Play Service Account',
    steps: [
      'Go to Google Play Console -> Setup -> API access',
      'Create a service account or link existing one',
      'Grant "Release manager" permission to the service account',
      'Download the JSON key file',
      'Save to creds/play-service-account.json in your project',
    ],
    verifyPath: join(projectDir, 'creds', 'play-service-account.json'),
    verifyDescription: 'Google Play Service Account JSON',
    confirmQuestion: 'Have you set up the service account?',
  });
}

async function promptAndroidKeystore(rl, cliFlags, currentConfig) {
  await runGuide(rl, {
    title: 'Set up Android Keystore',
    steps: [
      'If you don\'t have a keystore, run:',
      '  keytool -genkey -v -keystore creds/upload-keystore.jks \\',
      '    -keyalg RSA -keysize 2048 -validity 10000',
      'Keep the keystore file safe — you cannot replace it once uploaded to Google Play',
    ],
    confirmQuestion: 'Have you created or located your Android keystore?',
  });

  const keystorePassword = await askQuestion(
    rl,
    'Keystore password',
    getDefault('keystorePassword', cliFlags, currentConfig)
  );

  return keystorePassword;
}

async function promptMatchSigning(rl, cliFlags, currentConfig) {
  await runGuide(rl, {
    title: 'Set up Match Code Signing',
    steps: [
      'Create a PRIVATE Git repository for certificates (e.g. github.com/yourorg/certificates)',
      'Generate an SSH deploy key: ssh-keygen -t ed25519 -f creds/match_deploy_key',
      'Add the public key as a deploy key to the certificates repo (with write access)',
    ],
    confirmQuestion: 'Have you set up the certificates repository and deploy key?',
  });

  const matchDeployKeyPath = await askQuestion(
    rl,
    'Path to Match deploy key',
    getDefault('matchDeployKeyPath', cliFlags, currentConfig) || 'creds/match_deploy_key'
  );

  const matchGitUrl = await askQuestion(
    rl,
    'Match certificates Git URL (SSH)',
    getDefault('matchGitUrl', cliFlags, currentConfig)
  );

  return { matchDeployKeyPath, matchGitUrl };
}

export async function promptCredentials(rl, cliFlags, currentConfig, projectDir) {
  console.log('');
  console.log('\x1b[1m\x1b[36m=== Credentials Setup ===\x1b[0m');
  console.log('');

  const { keyId, issuerId } = await promptAppStoreApiKey(
    rl, cliFlags, currentConfig, projectDir
  );

  await promptPlayServiceAccount(rl, projectDir);

  const keystorePassword = await promptAndroidKeystore(rl, cliFlags, currentConfig);

  const { matchDeployKeyPath, matchGitUrl } = await promptMatchSigning(
    rl, cliFlags, currentConfig
  );

  return { keyId, issuerId, keystorePassword, matchDeployKeyPath, matchGitUrl };
}
