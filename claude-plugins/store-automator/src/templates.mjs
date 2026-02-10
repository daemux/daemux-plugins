import { existsSync, cpSync, copyFileSync } from 'node:fs';
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
  if (existsSync(targetPath)) {
    console.log('CLAUDE.md already exists, skipping (will not overwrite).');
    return;
  }
  console.log('Installing CLAUDE.md...');
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
