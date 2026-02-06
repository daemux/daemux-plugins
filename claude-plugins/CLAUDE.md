# Daemux Claude Plugins - Development Guide

## Version Management (CRITICAL)

**Always bump the version number when making any changes to plugin content.**

The plugin system uses version-based caching:
1. Claude Code checks if `version` in marketplace matches installed version
2. If same version exists in cache, it skips the update (even if git content changed)
3. Files are only re-copied when version number increases

**Files to update when releasing changes:**
- `.claude-plugin/marketplace.json` - `metadata.version` and `plugins[].version`
- `plugins/daemux-dev-toolkit/.claude-plugin/plugin.json` - `version`

Use semantic versioning: `MAJOR.MINOR.PATCH` (e.g., `1.0.0` → `1.0.1` for fixes, `1.1.0` for features)

## Plugin Structure

Agents are defined in `plugins/daemux-dev-toolkit/agents/` as markdown files with YAML frontmatter.

**Required manifests:**
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
```

## Publishing Updates

1. Make your changes to agents
2. Bump version in both manifest files
3. Commit and push to GitHub

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
| Update doesn't apply | Version not bumped | Increment version in both manifests |
| Agent shows `inherit` model | YAML parsing failed | Quote the description field |
| "Not installed at scope" | Missing from installed_plugins.json | Reinstall or add entry manually |

##  Verify changes are GENERAL
   - No project-specific paths, filenames, or references
   - No credentials, API keys, passwords, IPs
   - No hardcoded values that vary between projects

## Resources

- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Marketplace Guide](https://code.claude.com/docs/en/plugin-marketplaces)
- [Official Plugins](https://github.com/anthropics/claude-plugins-official)
