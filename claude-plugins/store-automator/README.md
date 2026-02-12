# @daemux/store-automator

Full App Store & Google Play automation for Flutter apps with Claude Code agents.

## What It Does

This package installs three Claude Code agents and a complete CI/CD template suite that automates the entire app store publishing workflow:

- **appstore-reviewer** -- Reviews metadata, screenshots, and tests compliance with Apple App Store and Google Play guidelines
- **appstore-meta-creator** -- Creates all store metadata texts (names, descriptions, keywords) for all available languages
- **app-designer** -- Designs complete app UI, creates ASO-optimized store screenshots, and designs marketing web pages — all in Stitch MCP

Plus CI/CD templates for GitHub Actions, Fastlane, web pages, and scripts.

## Requirements

- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code/overview) installed
- Node.js >= 18
- Flutter project

## Installation

```bash
cd your-flutter-project
npm install @daemux/store-automator@latest
```

The postinstall script will:

1. Prompt for bundle ID and MCP server tokens (Stitch, Cloudflare)
2. Configure `.mcp.json` with MCP servers (Playwright, mobile-mcp, Stitch, Cloudflare)
3. Install the plugin marketplace and register agents
4. Copy `CLAUDE.md` template to `.claude/CLAUDE.md`
5. Copy CI/CD templates (Fastlane, scripts, web pages, ci.config.yaml)
6. Configure `.claude/settings.json` with required env vars

## After Installation

1. Fill `ci.config.yaml` with your app details (bundle ID, credentials paths, etc.)
2. Add credential files:
   - `creds/AuthKey.p8` -- Apple App Store Connect API key
   - `creds/play-service-account.json` -- Google Play service account
3. Start Claude Code and use the agents

## Manual Setup

If postinstall was skipped (CI environment), run manually:

```bash
npx store-automator
```

## Usage

### Global Install

```bash
npx @daemux/store-automator -g
```

### Uninstall

```bash
npx @daemux/store-automator -u         # project scope
npx @daemux/store-automator -g -u      # global scope
```

## Agents

### appstore-meta-creator

Creates all metadata texts for both Apple App Store and Google Play in all configured languages. Outputs to `fastlane/metadata/ios/` and `fastlane/metadata/android/`.

### app-designer

Designs complete app UI screens, creates ASO-optimized store screenshots for all required device sizes, and designs the marketing web page. All work done in a single Stitch MCP project. Researches competitors for ASO optimization. Outputs screenshots to `fastlane/screenshots/`.

### appstore-reviewer

Reviews all metadata, screenshots, privacy policy, and IAP configuration against Apple and Google guidelines. Returns APPROVED or REJECTED with specific issues.

## CI/CD Templates

The package installs these templates to your project:

| File | Purpose |
|------|---------|
| `ci.config.yaml` | Per-project configuration (credentials, app identity, settings) |
| `scripts/check_changed.sh` | Git-based change detection for conditional uploads |
| `scripts/manage_version_ios.py` | Automatic iOS version management |
| `fastlane/` | iOS and Android Fastlane configurations |
| `web/` | Marketing, privacy, terms, and support page templates |
| `Gemfile` | Ruby gems for Fastlane |

## Workflow

1. Install the package
2. Fill `ci.config.yaml`
3. Use `app-designer` to design app UI + create screenshots + design web page
4. Use `appstore-meta-creator` to generate metadata
5. Use `appstore-reviewer` to verify compliance
6. Push to GitHub -- GitHub Actions builds and publishes automatically

## MCP Servers

The package configures these MCP servers in `.mcp.json`:

| Server | Purpose | Required Token |
|--------|---------|---------------|
| playwright | Browser automation for testing web pages | None |
| mobile-mcp | Mobile device automation | None |
| stitch | AI design tool for screenshot generation | `STITCH_API_KEY` |
| cloudflare | Cloudflare Pages deployment | `CLOUDFLARE_API_TOKEN` + Account ID |

## Non-interactive Install

For CI/CD environments or scripted setups, pass tokens as CLI flags to skip interactive prompts:

```bash
npx @daemux/store-automator \
  --bundle-id=com.company.app \
  --stitch-key=YOUR_STITCH_KEY \
  --cloudflare-token=YOUR_CF_TOKEN \
  --cloudflare-account-id=YOUR_CF_ACCOUNT_ID
```

Any tokens provided via flags will skip the corresponding interactive prompt. If all three tokens are provided, the entire interactive session is skipped. The bundle ID, if provided, is automatically written to `bundle_id` and `package_name` in `ci.config.yaml`.

## CLI Options

```
Usage: npx @daemux/store-automator [options]

Options:
  -g, --global                   Install globally (~/.claude) instead of project scope
  -u, --uninstall                Uninstall plugin and remove files
  --postinstall                  Run as postinstall hook (auto-detected)
  -v, --version                  Show version number
  -h, --help                     Show help

App Configuration:
  --bundle-id=ID                 Bundle ID / Package Name (e.g., com.company.app)

MCP Token Flags (skip interactive prompts):
  --stitch-key=KEY               Stitch MCP API key
  --cloudflare-token=TOKEN       Cloudflare API token
  --cloudflare-account-id=ID     Cloudflare account ID
```

## License

MIT
