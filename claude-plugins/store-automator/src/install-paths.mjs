import { installGitHubActionsTemplates, installMatchfile } from './templates.mjs';
import { writeMatchConfig } from './ci-config.mjs';

export function installGitHubActionsPath(projectDir, packageDir, cliTokens) {
  console.log('Configuring GitHub Actions mode...');
  installGitHubActionsTemplates(projectDir, packageDir);

  installMatchfile(projectDir, packageDir, {
    matchGitUrl: cliTokens.matchGitUrl,
    bundleId: cliTokens.bundleId,
  });

  const wrote = writeMatchConfig(projectDir, {
    deployKeyPath: cliTokens.matchDeployKey,
    gitUrl: cliTokens.matchGitUrl,
  });
  if (wrote) console.log('Match credentials written to ci.config.yaml');
}
