# Daemux Claude Plugins

A marketplace for Claude Code plugins used across Daemux projects.

## Install / Update

### Method 1: Ask AI (Recommended)

Copy-paste one of these prompts into Claude Code:

**For current project only:**
```
Install daemux-claude-plugins for this project only: clone https://github.com/daemux/daemux-plugins to /tmp/daemux-plugins and run claude-plugins/install.sh
```

**For all projects (global):**
```
Install daemux-claude-plugins globally for all projects: clone https://github.com/daemux/daemux-plugins to /tmp/daemux-plugins and run claude-plugins/install.sh --global
```

### Method 2: Command Line

**Project-specific (default):** Run from your project directory:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/daemux/daemux-plugins/main/claude-plugins/install.sh)
```

**Global (all projects):** Install once for all projects:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/daemux/daemux-plugins/main/claude-plugins/install.sh) --global
```

**For private repo access**, clone first then run:
```bash
git clone git@github.com:daemux/daemux-plugins.git /tmp/daemux-plugins && bash /tmp/daemux-plugins/claude-plugins/install.sh
```

Works for both fresh install and updates. Run the same command anytime.

The script will:
- Clone/update the marketplace
- Install MCP dependencies
- Install/update the plugin
- Add required env vars to `.claude/settings.json` (preserves existing values)

**Prerequisites:** Chrome browser, Node.js

## Included Plugins

### daemux-dev-toolkit

Complete development toolkit with:

**11 Agents:**
- `architect` - Designs architecture before development
- `api-verifier` - API verification
- `deployer` - Deployment, logs, server status (uses deploy MCP)
- `designer` - UI/UX design specs before frontend development
- `developer` - Code implementation (backend/frontend)
- `docs-researcher` - External library research
- `infra-ops` - Infrastructure operations
- `product-manager` - Pre/post-dev validation
- `reviewer` - Code review after changes
- `simplifier` - Code simplification
- `tester` - Testing (backend/frontend)

**1 Skill:**
- `/nano-banana` - Image generation with Gemini

**3 MCP Servers (bundled):**
- `chrome-devtools` - Browser automation, debugging, screenshots, console inspection
- `tailwindcss` - TailwindCSS utilities, docs, CSS-to-Tailwind conversion
- `deploy` - Deployment, logs, status, migrations

## Configuration

After install, edit `.claude/settings.json` to configure:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TASKS": "true",
    "GEMINI_API_KEY": "your-api-key",
    "DEPLOY_SERVER_USER": "ubuntu",
    "DEPLOY_SERVER_IP": "your-server-ip",
    "DEPLOY_PROJECT_NAME": "your-project",
    "DEPLOY_REMOTE_PATH": "/var/www/your-project",
    "DEPLOY_SERVICES": "api worker"
  }
}
```

All env vars are added automatically with empty defaults. Just fill in your values.
