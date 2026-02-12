import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

function isNonInteractive() {
  return Boolean(process.env.npm_config_yes) || process.argv.includes('--postinstall');
}

export function printGuide(title, steps) {
  console.log('');
  console.log(`${BOLD}${CYAN}=== ${title} ===${RESET}`);
  console.log('');
  for (let i = 0; i < steps.length; i++) {
    console.log(`  ${i + 1}. ${steps[i]}`);
  }
  console.log('');
}

export function askConfirmation(rl, question) {
  if (isNonInteractive()) return Promise.resolve('skip');

  return new Promise((resolve) => {
    rl.question(`${question} (y/n/skip): `, (answer) => {
      const val = answer.trim().toLowerCase();
      if (val === 'y' || val === 'yes') return resolve('yes');
      if (val === 's' || val === 'skip') return resolve('skip');
      resolve('no');
    });
  });
}

export function verifyFileExists(filePath, description) {
  if (existsSync(filePath)) {
    console.log(`${GREEN}  Found: ${description} (${filePath})${RESET}`);
    return true;
  }
  console.log(`${YELLOW}  Warning: ${description} not found at ${filePath}${RESET}`);
  return false;
}

export async function runGuide(rl, guide) {
  printGuide(guide.title, guide.steps);

  if (guide.verifyPath) {
    verifyFileExists(guide.verifyPath, guide.verifyDescription || guide.verifyPath);
  }

  if (guide.confirmQuestion) {
    const answer = await askConfirmation(rl, guide.confirmQuestion);
    if (answer === 'no') {
      console.log(`${YELLOW}  Skipped. You can complete this step later.${RESET}`);
    }
    return answer;
  }

  return 'yes';
}

export function askQuestion(rl, question, defaultValue) {
  if (isNonInteractive()) return Promise.resolve(defaultValue || '');

  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

export function isPlaceholder(value) {
  if (value === undefined || value === null || value === '') return true;
  const s = String(value);
  if (s.startsWith('REPLACE_WITH_')) return true;
  if (s.startsWith('yourapp')) return true;
  if (s.startsWith('com.yourcompany.')) return true;
  return false;
}
