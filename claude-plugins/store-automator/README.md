# @daemux/store-automator

Full App Store & Google Play automation for Flutter apps with Claude Code agents.

## What It Does

This package installs three Claude Code agents and a complete CI/CD template suite that automates the entire app store publishing workflow:

- **appstore-reviewer** -- Reviews metadata, screenshots, and tests compliance with Apple App Store and Google Play guidelines
- **appstore-meta-creator** -- Creates all store metadata texts (names, descriptions, keywords) for all available languages
- **app-designer** -- Designs complete app UI, creates ASO-optimized store screenshots, and designs marketing web pages -- all in Stitch MCP

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

The postinstall script runs an interactive setup with five sections:

1. **App Identity** -- App name, bundle ID, package name, SKU, Apple ID
2. **Credentials** -- Guided steps for App Store Connect API key, Google Play service account, Android keystore, and Match code signing
3. **Store Settings** -- iOS categories/pricing, Android track/rollout, metadata languages
4. **Web Settings** -- Domain, colors, company info, legal jurisdiction
5. **MCP Tokens** -- Stitch and Cloudflare API keys (optional, press Enter to skip)

All values are written to `ci.config.yaml`. The installer also:

- Configures `.mcp.json` with MCP servers (Playwright, mobile-mcp, Stitch, Cloudflare)
- Installs `.claude/CLAUDE.md` with your app name and agent configurations
- Copies CI/CD templates (Fastlane, scripts, web pages, GitHub Actions)
- Configures `.claude/settings.json` with required env vars
- Runs post-install guides for GitHub repo setup, secrets, and Firebase

Re-running the installer reads existing `ci.config.yaml` values as defaults, so you can update individual fields without re-entering everything.

## After Installation

1. Add any credential files not configured during the guided setup:
   - `creds/AuthKey.p8` -- Apple App Store Connect API key
   - `creds/play-service-account.json` -- Google Play service account
   - `creds/upload-keystore.jks` -- Android upload keystore
2. Verify `ci.config.yaml` has all required values filled in
3. Start Claude Code and use the agents

## Manual Setup

If postinstall was skipped (CI environment), run manually:

```bash
npx store-automator
```

## CLI Reference

### General Options

| Flag | Description |
|------|-------------|
| `-g`, `--global` | Install globally (~/.claude) instead of project scope |
| `-u`, `--uninstall` | Uninstall plugin and remove files |
| `--postinstall` | Run as postinstall hook (auto-detected) |
| `-v`, `--version` | Show version number |
| `-h`, `--help` | Show help |

### App Identity

| Flag | Description |
|------|-------------|
| `--app-name=NAME` | App display name |
| `--bundle-id=ID` | Bundle ID / Package Name (e.g., com.company.app) |
| `--sku=SKU` | App Store Connect SKU |
| `--apple-id=EMAIL` | Apple Developer Account email |

### Credentials

| Flag | Description |
|------|-------------|
| `--key-id=ID` | App Store Connect Key ID |
| `--issuer-id=ID` | App Store Connect Issuer ID |
| `--keystore-password=PASS` | Android keystore password |
| `--match-deploy-key-path=PATH` | Path to Match deploy key |
| `--match-git-url=URL` | Match certificates Git URL (SSH) |

### iOS Store Settings

| Flag | Description |
|------|-------------|
| `--primary-category=CAT` | Primary category (e.g., UTILITIES) |
| `--secondary-category=CAT` | Secondary category (e.g., PRODUCTIVITY) |
| `--price-tier=N` | Price tier (0 = free) |
| `--submit-for-review=BOOL` | Auto-submit for review (true/false) |
| `--automatic-release=BOOL` | Auto-release after approval (true/false) |

### Android Store Settings

| Flag | Description |
|------|-------------|
| `--track=TRACK` | Release track (internal/alpha/beta/production) |
| `--rollout-fraction=N` | Rollout fraction (0.0-1.0) |
| `--in-app-update-priority=N` | In-app update priority (0-5) |

### Web Settings

| Flag | Description |
|------|-------------|
| `--domain=DOMAIN` | Web domain (e.g., myapp-pages.workers.dev) |
| `--cf-project-name=NAME` | Cloudflare Pages project name |
| `--tagline=TEXT` | App tagline |
| `--primary-color=HEX` | Primary color (e.g., #2563EB) |
| `--secondary-color=HEX` | Secondary color (e.g., #7C3AED) |
| `--company-name=NAME` | Company name |
| `--contact-email=EMAIL` | Contact email |
| `--support-email=EMAIL` | Support email |
| `--jurisdiction=TEXT` | Legal jurisdiction (e.g., Delaware, USA) |

### Languages

| Flag | Description |
|------|-------------|
| `--languages=LANGS` | Comma-separated language codes (e.g., en-US,de-DE,ja) |

### MCP Tokens

| Flag | Description |
|------|-------------|
| `--stitch-key=KEY` | Stitch MCP API key |
| `--cloudflare-token=TOKEN` | Cloudflare API token |
| `--cloudflare-account-id=ID` | Cloudflare account ID |

### GitHub Actions CI

| Flag | Description |
|------|-------------|
| `--github-actions` | GitHub Actions CI mode (requires --bundle-id, --match-deploy-key, --match-git-url) |
| `--match-deploy-key=PATH` | Path to Match deploy key file |
| `--match-git-url=URL` | Git URL for Match certificates repo (SSH) |

## Full Non-Interactive Example

Pass all flags to skip every interactive prompt:

```bash
npx @daemux/store-automator \
  --app-name="My Amazing App" \
  --bundle-id=com.mycompany.amazingapp \
  --sku=MY_AMAZING_APP \
  --apple-id=developer@mycompany.com \
  --key-id=ABC123DEF4 \
  --issuer-id=12345678-1234-1234-1234-123456789012 \
  --keystore-password=my-secure-password \
  --match-deploy-key-path=creds/match_deploy_key \
  --match-git-url=git@github.com:mycompany/certificates.git \
  --primary-category=UTILITIES \
  --secondary-category=PRODUCTIVITY \
  --price-tier=0 \
  --submit-for-review=true \
  --automatic-release=true \
  --track=internal \
  --rollout-fraction=1.0 \
  --in-app-update-priority=3 \
  --domain=amazingapp-pages.account-subdomain.workers.dev \
  --cf-project-name=amazingapp-pages \
  --tagline="The best utility app ever" \
  --primary-color="#2563EB" \
  --secondary-color="#7C3AED" \
  --company-name="My Company LLC" \
  --contact-email=hello@mycompany.com \
  --support-email=support@mycompany.com \
  --jurisdiction="Delaware, USA" \
  --languages=en-US,de-DE,ja \
  --stitch-key=sk-stitch-xxx \
  --cloudflare-token=cf-token-xxx \
  --cloudflare-account-id=abc123def456
```

## ci.config.yaml Reference

The installer writes all configuration to `ci.config.yaml`. Below is the full structure with the corresponding CLI flag for each field.

```yaml
flutter_root: "."                              # Subdirectory if Flutter project is not at repo root

credentials:
  apple:
    p8_key_path: creds/AuthKey.p8              # Path to AuthKey .p8 file (manual)
    key_id: ""                                 # --key-id
    issuer_id: ""                              # --issuer-id
  google:
    service_account_json_path: creds/play-service-account.json  # Manual
  android:
    keystore_password: ""                      # --keystore-password
  match:
    deploy_key_path: ""                        # --match-deploy-key-path
    git_url: ""                                # --match-git-url

app:
  name: ""                                     # --app-name
  bundle_id: ""                                # --bundle-id
  package_name: ""                             # --bundle-id (same value)
  sku: ""                                      # --sku
  apple_id: ""                                 # --apple-id

ios:
  primary_category: "UTILITIES"                # --primary-category
  secondary_category: "PRODUCTIVITY"           # --secondary-category
  price_tier: 0                                # --price-tier
  submit_for_review: true                      # --submit-for-review
  automatic_release: true                      # --automatic-release

android:
  track: "internal"                            # --track
  rollout_fraction: "1.0"                      # --rollout-fraction
  in_app_update_priority: 3                    # --in-app-update-priority

metadata:
  languages:                                   # --languages (comma-separated)
    - en-US

web:
  domain: ""                                   # --domain
  cloudflare_project_name: ""                  # --cf-project-name
  tagline: ""                                  # --tagline
  primary_color: "#2563EB"                     # --primary-color
  secondary_color: "#7C3AED"                   # --secondary-color
  company_name: ""                             # --company-name
  contact_email: ""                            # --contact-email
  support_email: ""                            # --support-email
  jurisdiction: ""                             # --jurisdiction
  app_store_url: ""                            # Filled after first iOS publish
  google_play_url: ""                          # Filled after first Android publish
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

1. Install the package (interactive setup fills `ci.config.yaml`)
2. Add any remaining credential files
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

## Idempotency

The installer is idempotent. Re-running it reads existing values from `ci.config.yaml` as defaults for each prompt. This means you can:

- Update a single field by re-running and pressing Enter through unchanged fields
- Add credentials you skipped during the first run
- Change store settings without losing other configuration

CLI flags override both the existing config and the interactive prompt for that field.

## License

MIT
