# Daemux Claude Plugins

A marketplace for Claude Code plugins used across Daemux projects.

## Install / Update

**Project-specific (default):** Run from your project directory:

```bash
npx @daemux/claude-plugin
```

**Global (all projects):** Install once for all projects:

```bash
npx @daemux/claude-plugin --global
```

Works for both fresh install and updates. Run the same command anytime.

The installer will:
- Register the marketplace in `~/.claude/plugins/`
- Install the plugin via `claude plugin install`
- Add required env vars to `.claude/settings.json` (preserves existing values)
- Configure statusLine (preserves existing config)
- Copy `CLAUDE.md` template with development standards

Auto-update notifications are built in via `update-notifier`.

## Uninstall

**Project-specific:** Remove from current project only:

```bash
npx @daemux/claude-plugin --uninstall
```

**Global:** Remove from all projects and clean up marketplace:

```bash
npx @daemux/claude-plugin --global --uninstall
```

## CLI Options

```
npx @daemux/claude-plugin [options]

Options:
  -g, --global     Install/uninstall globally (~/.claude) instead of project scope
  -u, --uninstall  Uninstall the plugin
  -v, --version    Show version number
  -h, --help       Show help message
```

## Included Plugins

### daemux-dev-toolkit

General-purpose development toolkit with:

**8 Agents:**
- `architect` - Designs architecture before development
- `designer` - UI/UX design specs before frontend development
- `developer` - Code implementation (backend/frontend)
- `devops` - DevOps operations (deploy, database, server management)
- `product-manager` - Pre/post-dev validation
- `reviewer` - Code review after changes
- `simplifier` - Code simplification
- `tester` - Testing (backend/frontend/integration)

## Configuration

The plugin is ready to use after installation. Core features are enabled automatically in `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TASKS": "true",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Add additional environment variables as needed for your project.

## Pin a Specific Version

```bash
npx @daemux/claude-plugin@1.25.0
```
