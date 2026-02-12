import { existsSync, cpSync, copyFileSync, chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir } from './utils.mjs';

const FILE_COPIES = [
  ['ci.config.yaml.template', 'ci.config.yaml'],
  ['codemagic.template.yaml', 'ci-templates/codemagic.template.yaml'],
  ['Gemfile.template', 'Gemfile'],
];

const DIR_COPIES = ['scripts', 'fastlane', 'web'];

const DIR_COPIES_MAPPED = [
  ['github', '.github'],
];

const FIREBASE_COPIES = [
  ['firebase/firestore.rules.template', 'backend/firestore.rules'],
  ['firebase/storage.rules.template', 'backend/storage.rules'],
  ['firebase/firebase.json.template', 'backend/firebase.json'],
  ['firebase/firestore.indexes.json.template', 'backend/firestore.indexes.json'],
  ['firebase/.firebaserc.template', 'backend/.firebaserc'],
];

const GH_ACTIONS_WORKFLOWS = [
  ['github/workflows/ios-release.yml', '.github/workflows/ios-release.yml'],
  ['github/workflows/android-release.yml', '.github/workflows/android-release.yml'],
];

const GH_ACTIONS_SCRIPT_DIRS = [
  'scripts/ci/common',
  'scripts/ci/android',
  'scripts/ci/ios',
];

function copyIfMissing(srcPath, destPath, label, isDirectory) {
  if (!existsSync(srcPath)) return;
  if (existsSync(destPath)) {
    console.log(`  ${label} already exists, skipping.`);
    return;
  }
  ensureDir(join(destPath, '..'));
  if (isDirectory) {
    cpSync(srcPath, destPath, { recursive: true });
  } else {
    copyFileSync(srcPath, destPath);
  }
}

export function installClaudeMd(targetPath, packageDir) {
  const template = join(packageDir, 'templates', 'CLAUDE.md.template');
  if (!existsSync(template)) return;
  const action = existsSync(targetPath) ? 'Updating' : 'Installing';
  console.log(`${action} CLAUDE.md...`);
  ensureDir(join(targetPath, '..'));
  copyFileSync(template, targetPath);
}

export function installCiTemplates(projectDir, packageDir) {
  console.log('Installing CI/CD templates...');
  const templateDir = join(packageDir, 'templates');

  for (const [src, dest] of FILE_COPIES) {
    copyIfMissing(join(templateDir, src), join(projectDir, dest), dest, false);
  }

  for (const dir of DIR_COPIES) {
    copyIfMissing(
      join(templateDir, dir),
      join(projectDir, dir),
      `${dir}/`,
      true,
    );
  }

  for (const [src, dest] of DIR_COPIES_MAPPED) {
    copyIfMissing(
      join(templateDir, src),
      join(projectDir, dest),
      `${dest}/`,
      true,
    );
  }
}

export function installFirebaseTemplates(projectDir, packageDir) {
  console.log('Installing Firebase backend templates...');
  const templateDir = join(packageDir, 'templates');
  ensureDir(join(projectDir, 'backend'));

  for (const [src, dest] of FIREBASE_COPIES) {
    copyIfMissing(join(templateDir, src), join(projectDir, dest), dest, false);
  }
}

function copyOrUpdate(srcPath, destPath, label) {
  if (!existsSync(srcPath)) return;
  ensureDir(join(destPath, '..'));
  if (existsSync(destPath)) {
    console.log(`  ${label} exists, overwriting.`);
  }
  copyFileSync(srcPath, destPath);
}

function chmodShFiles(dirPath) {
  if (!existsSync(dirPath)) return;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      chmodShFiles(fullPath);
    } else if (entry.name.endsWith('.sh')) {
      chmodSync(fullPath, 0o755);
    }
  }
}

export function installGitHubActionsTemplates(projectDir, packageDir) {
  console.log('Installing GitHub Actions templates...');
  const templateDir = join(packageDir, 'templates');

  for (const [src, dest] of GH_ACTIONS_WORKFLOWS) {
    copyOrUpdate(join(templateDir, src), join(projectDir, dest), dest);
  }

  for (const scriptDir of GH_ACTIONS_SCRIPT_DIRS) {
    const scriptsSrc = join(templateDir, scriptDir);
    const scriptsDest = join(projectDir, scriptDir);
    if (existsSync(scriptsSrc)) {
      ensureDir(scriptsDest);
      cpSync(scriptsSrc, scriptsDest, { recursive: true });
      chmodShFiles(scriptsDest);
      console.log(`  ${scriptDir}/ copied.`);
    }
  }
}

export function installMatchfile(projectDir, packageDir, flutterRoot, { matchGitUrl, bundleId }) {
  console.log('Installing Matchfile...');
  const src = join(packageDir, 'templates', 'Matchfile.template');
  if (!existsSync(src)) return;

  const destDir = join(projectDir, flutterRoot, 'ios', 'fastlane');
  ensureDir(destDir);
  const dest = join(destDir, 'Matchfile');

  copyOrUpdate(src, dest, 'Matchfile');

  const content = readFileSync(dest, 'utf8');
  const updated = content
    .replace('{{MATCH_GIT_URL}}', matchGitUrl)
    .replace('{{BUNDLE_ID}}', bundleId);
  writeFileSync(dest, updated, 'utf8');
}
