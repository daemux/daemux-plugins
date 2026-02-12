import { existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  MARKETPLACE_DIR, KNOWN_MP_PATH, CACHE_DIR,
  MARKETPLACE_NAME, PLUGIN_REF,
  getPackageDir, exec, ensureDir, ensureFile, readJson, writeJson,
} from './utils.mjs';
import { injectEnvVars, injectStatusLine } from './settings.mjs';
import { promptAll } from './prompt.mjs';
import { getMcpServers, writeMcpJson } from './mcp-setup.mjs';
import { installClaudeMd, installCiTemplates, installFirebaseTemplates } from './templates.mjs';
import { readCiConfig, writeCiFields, writeCiLanguages, writeMatchConfig, isPlaceholder } from './ci-config.mjs';
import { installGitHubActionsPath } from './install-paths.mjs';

function checkClaudeCli() {
  const result = exec('command -v claude') || exec('which claude');
  if (!result) {
    console.log('Claude CLI not found.');
    console.log('Install it first: https://docs.anthropic.com/en/docs/claude-code/overview');
    process.exit(1);
  }
}

function readMarketplaceVersion(fallback = '') {
  const mpJson = join(MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json');
  if (!existsSync(mpJson)) return fallback;
  try {
    return readJson(mpJson).metadata.version;
  } catch {
    return fallback;
  }
}

function copyPluginFiles(packageDir) {
  console.log('Installing marketplace...');
  rmSync(MARKETPLACE_DIR, { recursive: true, force: true });
  ensureDir(MARKETPLACE_DIR);

  const dirs = ['.claude-plugin', 'plugins', 'templates'];
  for (const dir of dirs) {
    const src = join(packageDir, dir);
    const dest = join(MARKETPLACE_DIR, dir);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
    }
  }
}

function clearCache() {
  console.log('Clearing plugin cache...');
  rmSync(CACHE_DIR, { recursive: true, force: true });
}

function registerMarketplace() {
  console.log('Updating marketplace registration...');
  ensureFile(KNOWN_MP_PATH);
  let data;
  try {
    data = readJson(KNOWN_MP_PATH);
  } catch {
    data = {};
  }
  data[MARKETPLACE_NAME] = {
    source: { source: 'github', repo: 'daemux/daemux-plugins' },
    installLocation: MARKETPLACE_DIR,
    lastUpdated: new Date().toISOString(),
  };
  writeJson(KNOWN_MP_PATH, data);
}

function runClaudeInstall(scope) {
  console.log(`Installing plugin (scope: ${scope})...`);
  const scopeArg = scope === 'user' ? '' : ` --scope ${scope}`;
  try {
    execSync(`claude plugin install ${PLUGIN_REF}${scopeArg}`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.log(`Warning: claude plugin install returned non-zero (${err.status || 'unknown'})`);
  }
}

function printSummary(scope, oldVersion, newVersion) {
  console.log('');
  const scopeLabel = scope === 'user' ? ' globally' : '';
  if (oldVersion && oldVersion !== newVersion) {
    console.log(`Done! store-automator updated${scopeLabel}: v${oldVersion} -> v${newVersion}`);
  } else if (oldVersion) {
    console.log(`Done! store-automator reinstalled${scopeLabel} (v${newVersion})`);
  } else {
    console.log(`Done! store-automator installed${scopeLabel} (v${newVersion})`);
  }
}

function mapPromptsToCiFields(prompted) {
  return {
    'app.name': prompted.appName,
    'app.bundle_id': prompted.bundleId,
    'app.package_name': prompted.packageName,
    'app.sku': prompted.sku,
    'app.apple_id': prompted.appleId,
    'credentials.apple.key_id': prompted.keyId,
    'credentials.apple.issuer_id': prompted.issuerId,
    'credentials.android.keystore_password': prompted.keystorePassword,
    'ios.primary_category': prompted.primaryCategory,
    'ios.secondary_category': prompted.secondaryCategory,
    'ios.price_tier': prompted.priceTier,
    'ios.submit_for_review': prompted.submitForReview,
    'ios.automatic_release': prompted.automaticRelease,
    'android.track': prompted.track,
    'android.rollout_fraction': prompted.rolloutFraction,
    'android.in_app_update_priority': prompted.inAppUpdatePriority,
    'web.domain': prompted.domain,
    'web.cloudflare_project_name': prompted.cfProjectName,
    'web.tagline': prompted.tagline,
    'web.primary_color': prompted.primaryColor,
    'web.secondary_color': prompted.secondaryColor,
    'web.company_name': prompted.companyName,
    'web.contact_email': prompted.contactEmail,
    'web.support_email': prompted.supportEmail,
    'web.jurisdiction': prompted.jurisdiction,
  };
}

function printNextSteps(prompted) {
  const missing = [];

  if (isPlaceholder(prompted.bundleId)) {
    missing.push('Set bundle ID in ci.config.yaml');
  }
  if (isPlaceholder(prompted.keyId)) {
    missing.push('Add App Store Connect credentials (key_id, issuer_id, AuthKey.p8)');
  }
  if (!existsSync(join(process.cwd(), 'creds', 'play-service-account.json'))) {
    missing.push('Add creds/play-service-account.json for Google Play');
  }
  if (isPlaceholder(prompted.matchGitUrl)) {
    missing.push('Configure Match code signing (match_git_url, deploy key)');
  }

  console.log('');
  if (missing.length === 0) {
    console.log('All configuration complete! Start Claude Code.');
  } else {
    console.log('Next steps:');
    for (let i = 0; i < missing.length; i++) {
      console.log(`  ${i + 1}. ${missing[i]}`);
    }
    console.log(`  ${missing.length + 1}. Start Claude Code`);
  }
}

export async function runInstall(scope, isPostinstall = false, cliTokens = {}) {
  checkClaudeCli();

  console.log('Installing/updating Daemux Store Automator...');

  const isGitHubActions = Boolean(cliTokens.githubActions);
  const nonInteractive = Boolean(process.env.npm_config_yes) || process.argv.includes('--postinstall');
  const projectDir = process.cwd();
  const oldVersion = readMarketplaceVersion();
  const packageDir = getPackageDir();

  // 1. Copy plugin files + register marketplace
  copyPluginFiles(packageDir);
  clearCache();
  registerMarketplace();
  runClaudeInstall(scope);

  const newVersion = readMarketplaceVersion('unknown');

  // 2. Install CI templates (creates ci.config.yaml if missing)
  installCiTemplates(projectDir, packageDir);
  installFirebaseTemplates(projectDir, packageDir);

  // 3. Read current ci.config.yaml values
  const currentConfig = readCiConfig(projectDir);

  // 4. Run interactive prompts (or use CLI flags / skip in non-interactive)
  let prompted;
  if (isGitHubActions) {
    prompted = {
      bundleId: cliTokens.bundleId ?? '',
      matchDeployKeyPath: cliTokens.matchDeployKey,
      matchGitUrl: cliTokens.matchGitUrl,
    };
  } else if (nonInteractive) {
    prompted = { ...cliTokens };
  } else {
    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      prompted = await promptAll(rl, cliTokens, currentConfig, projectDir);
    } finally {
      rl.close();
    }
  }

  // 5. Write all prompted values to ci.config.yaml
  const ciFields = mapPromptsToCiFields(prompted);
  const wrote = writeCiFields(projectDir, ciFields);
  if (wrote) console.log('Configuration written to ci.config.yaml');

  if (prompted.matchDeployKeyPath || prompted.matchGitUrl) {
    const wroteMatch = writeMatchConfig(projectDir, {
      deployKeyPath: prompted.matchDeployKeyPath,
      gitUrl: prompted.matchGitUrl,
    });
    if (wroteMatch) console.log('Match credentials written to ci.config.yaml');
  }

  // 6. Handle languages separately
  if (prompted.languages) {
    const langStr = Array.isArray(prompted.languages)
      ? prompted.languages.join(',')
      : prompted.languages;
    if (writeCiLanguages(projectDir, langStr)) {
      console.log('Languages updated in ci.config.yaml');
    }
  }

  // 7. Configure MCP, CLAUDE.md, settings
  if (!isGitHubActions) {
    const servers = getMcpServers(prompted);
    writeMcpJson(projectDir, servers);
  }

  const baseDir = scope === 'user'
    ? join(homedir(), '.claude')
    : join(process.cwd(), '.claude');

  ensureDir(baseDir);

  installClaudeMd(join(baseDir, 'CLAUDE.md'), packageDir, prompted.appName);

  installGitHubActionsPath(projectDir, packageDir, prompted);

  const scopeLabel = scope === 'user' ? 'global' : 'project';
  console.log(`Configuring ${scopeLabel} settings...`);
  const settingsPath = join(baseDir, 'settings.json');
  injectEnvVars(settingsPath);
  injectStatusLine(settingsPath);

  // 8. Run post-install guides (interactive only)
  if (!isGitHubActions && !nonInteractive) {
    const { createInterface } = await import('node:readline');
    const guideRl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const { runPostInstallGuides } = await import('./prompts/store-settings.mjs');
      await runPostInstallGuides(guideRl, currentConfig);
    } finally {
      guideRl.close();
    }
  }

  // 9. Summary + dynamic next steps
  printSummary(scope, oldVersion, newVersion);
  printNextSteps(prompted);
}
