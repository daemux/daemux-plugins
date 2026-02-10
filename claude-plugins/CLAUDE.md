# Daemux Claude Plugins - Development Guide

## Version Management (CRITICAL)

**Always bump the version number when making any changes to plugin content.**

The plugin system uses version-based caching:
1. Claude Code checks if `version` in marketplace matches installed version
2. If same version exists in cache, it skips the update (even if git content changed)
3. Files are only re-copied when version number increases

**Files to update when releasing changes (all 3 must match):**
- `package.json` - `version`
- `.claude-plugin/marketplace.json` - `metadata.version` and `plugins[].version`
- `plugins/daemux-dev-toolkit/.claude-plugin/plugin.json` - `version`

CI runs `scripts/check-version.mjs` to verify all 3 are in sync before publishing.

Use semantic versioning: `MAJOR.MINOR.PATCH` (e.g., `1.0.0` -> `1.0.1` for fixes, `1.1.0` for features)

## Plugin Structure

Agents are defined in `plugins/daemux-dev-toolkit/agents/` as markdown files with YAML frontmatter.

**Required manifests:**
- `package.json` - npm package metadata and bin entry
- `.claude-plugin/marketplace.json` - Marketplace metadata and plugin list
- `plugins/daemux-dev-toolkit/.claude-plugin/plugin.json` - Plugin metadata

## Agent Definition Format

Agents use markdown with YAML frontmatter:

```markdown
---
name: agent-name
description: "Quote descriptions containing colons or special characters"
model: opus
---

Agent instructions here...
```

**Valid model values:** `opus`, `sonnet`, `haiku`, or omit for `inherit`

**YAML Gotcha:** Always quote `description` if it contains colons (`:`), commas, or special characters to prevent parsing errors.

## Testing Locally

```bash
# Test plugin without installing
claude --plugin-dir ./plugins/daemux-dev-toolkit

# Validate plugin syntax
claude plugin validate ./plugins/daemux-dev-toolkit

# Test the installer locally (from claude-plugins/ directory)
node bin/cli.mjs              # project install
node bin/cli.mjs --global     # global install
node bin/cli.mjs --uninstall  # project uninstall
node bin/cli.mjs -g -u        # global uninstall
```

## Publishing Updates

Distribution is via npm (`@daemux/claude-plugin`). The old `install.sh` / curl-based install is no longer used.

### Automatic (CI)

Push to `main` with changes in `claude-plugins/` triggers `.github/workflows/publish-claude-plugin.yml`:
1. Checks version sync across all 3 files
2. Skips if version is already published on npm
3. Publishes to npm with `--access public`

Requires `NPM_TOKEN` secret in GitHub repo settings.

### Manual

```bash
cd claude-plugins
npm publish --access public
```

### Release Checklist

1. Make your changes to agents/code
2. Bump version in all 3 files (`package.json`, `marketplace.json`, `plugin.json`)
3. Run `node ../scripts/check-version.mjs` to verify sync
4. Commit and push to main

## Marketplace Configuration

The `extraKnownMarketplaces` in project `.claude/settings.json` auto-prompts team members:

```json
{
  "extraKnownMarketplaces": {
    "daemux-claude-plugins": {
      "source": {
        "source": "github",
        "repo": "daemux/daemux-plugins"
      }
    }
  },
  "enabledPlugins": {
    "daemux-dev-toolkit@daemux-claude-plugins": true
  }
}
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Update doesn't apply | Version not bumped | Increment version in all 3 files |
| Agent shows `inherit` model | YAML parsing failed | Quote the description field |
| "Not installed at scope" | Missing from installed_plugins.json | Reinstall or add entry manually |
| CI publish skipped | Version already published | Bump version before pushing |
| Version mismatch error | 3 version files out of sync | Run `node scripts/check-version.mjs` and fix |

## Verify changes are GENERAL
   - No project-specific paths, filenames, or references
   - No credentials, API keys, passwords, IPs
   - No hardcoded values that vary between projects

## Resources

- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Marketplace Guide](https://code.claude.com/docs/en/plugin-marketplaces)
- [Official Plugins](https://github.com/anthropics/claude-plugins-official)
