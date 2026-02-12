import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { runGuide, askQuestion, getDefault, printSectionHeader } from '../guide.mjs';

async function promptAppStoreApiKey(rl, cliFlags, currentConfig, projectDir) {
  const keyId = getDefault('keyId', cliFlags, currentConfig);
  const issuerId = getDefault('issuerId', cliFlags, currentConfig);
  const allFilled = !!(keyId && issuerId);

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
  }, { skip: allFilled });

  return {
    keyId: await askQuestion(rl, 'App Store Connect Key ID', keyId, { skipIfFilled: !!keyId }),
    issuerId: await askQuestion(rl, 'App Store Connect Issuer ID', issuerId, { skipIfFilled: !!issuerId }),
  };
}

async function promptPlayServiceAccount(rl, projectDir) {
  const jsonPath = join(projectDir, 'creds', 'play-service-account.json');
  const fileExists = existsSync(jsonPath);

  await runGuide(rl, {
    title: 'Create Google Play Service Account',
    steps: [
      'Go to Google Play Console -> Setup -> API access',
      'Create a service account or link existing one',
      'Grant "Release manager" permission to the service account',
      'Download the JSON key file',
      'Save to creds/play-service-account.json in your project',
    ],
    verifyPath: jsonPath,
    verifyDescription: 'Google Play Service Account JSON',
    confirmQuestion: 'Have you set up the service account?',
  }, { skip: fileExists });
}

async function promptAndroidKeystore(rl, cliFlags, currentConfig) {
  const keystorePassword = getDefault('keystorePassword', cliFlags, currentConfig);

  await runGuide(rl, {
    title: 'Set up Android Keystore',
    steps: [
      'If you don\'t have a keystore, run:',
      '  keytool -genkey -v -keystore creds/upload-keystore.jks \\',
      '    -keyalg RSA -keysize 2048 -validity 10000',
      'Keep the keystore file safe — you cannot replace it once uploaded to Google Play',
    ],
    confirmQuestion: 'Have you created or located your Android keystore?',
  }, { skip: !!keystorePassword });

  return await askQuestion(
    rl, 'Keystore password', keystorePassword, { skipIfFilled: !!keystorePassword }
  );
}

async function promptMatchSigning(rl, cliFlags, currentConfig) {
  const matchDeployKeyPath = getDefault('matchDeployKeyPath', cliFlags, currentConfig) || 'creds/match_deploy_key';
  const matchGitUrl = getDefault('matchGitUrl', cliFlags, currentConfig);
  const allFilled = !!(matchDeployKeyPath && matchGitUrl);

  await runGuide(rl, {
    title: 'Set up Match Code Signing',
    steps: [
      'Create a PRIVATE Git repository for certificates (e.g. github.com/yourorg/certificates)',
      'Generate an SSH deploy key: ssh-keygen -t ed25519 -f creds/match_deploy_key',
      'Add the public key as a deploy key to the certificates repo (with write access)',
    ],
    confirmQuestion: 'Have you set up the certificates repository and deploy key?',
  }, { skip: allFilled });

  return {
    matchDeployKeyPath: await askQuestion(
      rl, 'Path to Match deploy key', matchDeployKeyPath, { skipIfFilled: !!matchDeployKeyPath }
    ),
    matchGitUrl: await askQuestion(
      rl, 'Match certificates Git URL (SSH)', matchGitUrl, { skipIfFilled: !!matchGitUrl }
    ),
  };
}

export async function promptCredentials(rl, cliFlags, currentConfig, projectDir) {
  const keyId = getDefault('keyId', cliFlags, currentConfig);
  const issuerId = getDefault('issuerId', cliFlags, currentConfig);
  const keystorePassword = getDefault('keystorePassword', cliFlags, currentConfig);
  const matchDeployKeyPath = getDefault('matchDeployKeyPath', cliFlags, currentConfig) || 'creds/match_deploy_key';
  const matchGitUrl = getDefault('matchGitUrl', cliFlags, currentConfig);
  const jsonPath = join(projectDir, 'creds', 'play-service-account.json');
  const jsonExists = existsSync(jsonPath);

  const allFilled = !!(keyId && issuerId && keystorePassword && matchDeployKeyPath && matchGitUrl && jsonExists);

  if (!allFilled) {
    printSectionHeader('Credentials Setup');
  }

  const apiKey = await promptAppStoreApiKey(rl, cliFlags, currentConfig, projectDir);
  await promptPlayServiceAccount(rl, projectDir);
  const ksPassword = await promptAndroidKeystore(rl, cliFlags, currentConfig);
  const match = await promptMatchSigning(rl, cliFlags, currentConfig);

  return { ...apiKey, keystorePassword: ksPassword, ...match };
}
