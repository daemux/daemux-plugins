# Architecture: Codemagic Setup Automation Script

## Patterns and Conventions Found

| Pattern | Source | Detail |
|---------|--------|--------|
| ESM modules (`type: "module"`) | `/Users/gas/store-automator/package.json` | All `.mjs` extensions, `import`/`export` syntax |
| CLI arg parsing via `switch` | `/Users/gas/store-automator/bin/cli.mjs` | Manual `process.argv.slice(2)` parsing, no arg library |
| Dynamic imports for code splitting | `/Users/gas/store-automator/bin/cli.mjs:62-67` | `await import('../src/...')` for lazy-loading action modules |
| Shared utils in `src/utils.mjs` | `/Users/gas/store-automator/src/utils.mjs` | `readJson`, `writeJson`, `ensureDir`, `exec`, `getPackageDir` |
| YAML config via `ci.config.yaml` | `/Users/gas/store-automator/ci.config.yaml` | Central config for app identity, credentials, platform settings |
| Scripts in `/scripts/` are build-time | `/Users/gas/store-automator/scripts/` | Shell/Python scripts used during CI builds (not Node.js) |
| Source modules in `/src/` | `/Users/gas/store-automator/src/` | Node.js ESM modules with single exported function per concern |
| No external dependencies besides `update-notifier` | `/Users/gas/store-automator/package.json` | Must use Node.js built-in `fetch` (available Node 18+) |
| Console logging, not a logger library | All `src/*.mjs` files | Direct `console.log`/`console.error` |
| Error handling: try/catch with `process.exit(1)` | `/Users/gas/store-automator/bin/cli.mjs:60-77` | Postinstall silently exits 0; manual run exits 1 |

## Library Research

| Library | Version | Key Findings |
|---------|---------|--------------|
| Node.js built-in `fetch` | 18+ (stable in 21+) | Available without flags in Node 18+. `engines` field requires `>=18`. No `node-fetch` needed. |
| `node:fs` | built-in | `readFileSync` used throughout for sync config reads |
| `node:readline` | built-in | Used in `prompt.mjs` for interactive TTY prompts |

### Warnings
- Node 18 `fetch` does not throw on HTTP 4xx/5xx -- must check `response.ok` manually
- YAML parsing: the existing `generate.sh` uses `yq` (external tool). For the Node.js script, must parse YAML without adding a dependency. The `ci.config.yaml` structure is simple enough for a minimal line-based parser, or can delegate to `yq` as a subprocess (matching existing pattern)

---

## Architecture Options

### Option A: Single-File Script
All logic in `scripts/codemagic-setup.mjs`. Self-contained, reads config, calls API, reports status.

- Trade-offs: Fast to implement, all logic in one place, but duplicates YAML-parsing logic and cannot share HTTP helpers if future API scripts are added
- Effort: Low
- Files touched: 2 (new script + CLI integration)

### Option B: Modular with Shared API Client (Recommended)
New `src/codemagic-api.mjs` module with reusable API client functions. `scripts/codemagic-setup.mjs` is a thin orchestrator. CLI integration via new case in `bin/cli.mjs`.

- Trade-offs: Slightly more files, but follows existing `src/` module pattern. API client is reusable for future Codemagic operations (cancel build, list builds, etc.)
- Effort: Medium
- Files touched: 3 (new API module, new script, CLI modification)

### Option C: Full Service Layer with Config Abstraction
Adds a `src/config-reader.mjs` to abstract YAML parsing, `src/codemagic-api.mjs` for the API client, `src/codemagic-setup.mjs` for orchestration, and a generic `src/http.mjs` wrapper.

- Trade-offs: Most extensible, but over-engineered for current needs. 4+ new files for a single feature.
- Effort: High
- Files touched: 5+

### Recommendation: Option B
**Rationale:** Matches the existing codebase pattern where `src/` holds reusable modules and `scripts/` or `bin/` provides entry points. The API client in `src/codemagic-api.mjs` can be imported by any future script or CLI command that needs Codemagic interaction. The `ci.config.yaml` parsing can use `yq` as a subprocess (matching `generate.sh` pattern) or a minimal built-in parser, keeping it dependency-free.

---

## Component Design

### File: `/Users/gas/store-automator/src/codemagic-api.mjs`
**Responsibility:** Reusable HTTP client for Codemagic REST API

```
Exports:
  - createClient(apiToken) -> { listApps, addApp, startBuild, getBuildStatus }
  - Each method returns parsed JSON or throws with descriptive error

Internal:
  - cmFetch(token, method, path, body?) -> JSON
  - Handles auth header, content-type, response.ok checks, error extraction
```

Estimated size: ~90 lines

### File: `/Users/gas/store-automator/src/codemagic-setup.mjs`
**Responsibility:** Orchestration logic for the setup flow

```
Exports:
  - runCodemagicSetup(options) -> void

Flow:
  1. Resolve API token (env var or CLI arg)
  2. Parse ci.config.yaml to extract repo URL (from package.json repository or a new field)
  3. Call listApps, search by repo URL
  4. If not found, call addApp
  5. Optionally call startBuild on main branch
  6. Poll getBuildStatus if --wait flag provided
  7. Print summary
```

Estimated size: ~120 lines

### File: `/Users/gas/store-automator/bin/cli.mjs` (modification)
**Responsibility:** Add `--codemagic-setup` flag handling

```
Changes:
  - New case in the switch: '--codemagic-setup'
  - Sets action = 'codemagic-setup'
  - New branch in try/catch: dynamic import of '../src/codemagic-setup.mjs'
  - Pass parsed args (token, branch, flags) to runCodemagicSetup
```

Estimated size: ~15 lines added

### File: `/Users/gas/store-automator/scripts/codemagic-setup.mjs` (standalone entry)
**Responsibility:** Standalone runner (no npx required)

```
- Thin wrapper: parses argv, calls runCodemagicSetup from src/
- Allows: node scripts/codemagic-setup.mjs [--token=xxx] [--trigger] [--branch=main] [--wait]
```

Estimated size: ~40 lines

---

## Implementation Map

### 1. Create `/Users/gas/store-automator/src/codemagic-api.mjs`

```javascript
// Constants
const BASE_URL = 'https://api.codemagic.io';

// Internal: authenticated fetch wrapper
async function cmFetch(token, method, path, body)
  // Sets x-auth-token header, Content-Type: application/json
  // Checks response.ok, extracts error message from JSON body on failure
  // Returns parsed JSON on success

// List all applications
export async function listApps(token)
  // GET /apps
  // Returns { applications: [...] }

// Find app by repository URL match
export async function findAppByRepo(token, repoUrl)
  // Calls listApps, filters by repository.url matching repoUrl
  // Returns app object or null

// Add a new application
export async function addApp(token, repoUrl, teamId)
  // POST /apps with { repositoryUrl, teamId? }
  // Returns { _id, appName }

// Start a build
export async function startBuild(token, appId, workflowId, branch)
  // POST /builds with { appId, workflowId, branch }
  // Returns { buildId }

// Get build status
export async function getBuildStatus(token, buildId)
  // GET /builds/{buildId}
  // Returns build object with status field
```

### 2. Create `/Users/gas/store-automator/src/codemagic-setup.mjs`

```javascript
import { existsSync, readFileSync } from 'node:fs';
import { findAppByRepo, addApp, startBuild, getBuildStatus } from './codemagic-api.mjs';
import { exec } from './utils.mjs';

// Parse ci.config.yaml using yq subprocess (matches generate.sh pattern)
function readConfigValue(configPath, yamlPath)

// Resolve the GitHub repo URL from git remote or config
function resolveRepoUrl(configPath)

// Main orchestration
export async function runCodemagicSetup(options)
  // options: { token, configPath, trigger, branch, wait, workflowId }
```

### 3. Modify `/Users/gas/store-automator/bin/cli.mjs`

Add to the switch statement:
```javascript
case '--codemagic-setup':
  action = 'codemagic-setup';
  break;
case '--trigger':
  // flag for triggering build
  break;
case '--wait':
  // flag for waiting on build status
  break;
```

Add to the try/catch block:
```javascript
if (action === 'codemagic-setup') {
  const { runCodemagicSetup } = await import('../src/codemagic-setup.mjs');
  await runCodemagicSetup({ /* parsed options */ });
}
```

### 4. Create `/Users/gas/store-automator/scripts/codemagic-setup.mjs`

```javascript
#!/usr/bin/env node
// Standalone entry point
// Parses process.argv for --token, --trigger, --branch, --wait, --workflow
// Imports and calls runCodemagicSetup from ../src/codemagic-setup.mjs
```

---

## Data Flow

```
User invokes either:
  npx store-automator --codemagic-setup [--trigger] [--branch=main] [--wait]
  node scripts/codemagic-setup.mjs [--token=xxx] [--trigger] [--branch=main]

    |
    v
bin/cli.mjs OR scripts/codemagic-setup.mjs
  - Parse CLI args
  - Resolve CM_API_TOKEN from: --token arg > process.env.CM_API_TOKEN
    |
    v
src/codemagic-setup.mjs :: runCodemagicSetup(options)
  |
  +-> Read ci.config.yaml via yq subprocess (or git remote -v fallback)
  |     -> Extract: repo URL, app name
  |
  +-> src/codemagic-api.mjs :: findAppByRepo(token, repoUrl)
  |     -> GET https://api.codemagic.io/apps
  |     -> Filter by repository URL match
  |     -> Returns existing app or null
  |
  +-> [If not found] src/codemagic-api.mjs :: addApp(token, repoUrl)
  |     -> POST https://api.codemagic.io/apps
  |     -> Returns { _id, appName }
  |
  +-> [If --trigger] src/codemagic-api.mjs :: startBuild(token, appId, workflowId, branch)
  |     -> POST https://api.codemagic.io/builds
  |     -> Returns { buildId }
  |
  +-> [If --wait] Poll src/codemagic-api.mjs :: getBuildStatus(token, buildId)
  |     -> GET https://api.codemagic.io/builds/{buildId}
  |     -> Poll every 30s until status is 'finished', 'failed', or 'canceled'
  |
  +-> Print summary to stdout
```

---

## Error Handling Strategy

| Scenario | Handling | Exit Code |
|----------|----------|-----------|
| Missing `CM_API_TOKEN` | Print: "Codemagic API token required. Set CM_API_TOKEN env var or pass --token=..." | 1 |
| `ci.config.yaml` not found | Print: "ci.config.yaml not found. Run from project root or specify --config=path" | 1 |
| `yq` not installed (YAML parsing) | Fallback to `git remote get-url origin` for repo URL. Print warning if needed. | Continue |
| API returns 401 Unauthorized | Print: "Authentication failed. Check your CM_API_TOKEN." | 1 |
| API returns 403 Forbidden | Print: "Permission denied. Check API token permissions." | 1 |
| API returns 404 (build status) | Print: "Build not found: {buildId}" | 1 |
| API returns 5xx | Print: "Codemagic API error ({status}). Try again later." | 1 |
| Network error (fetch throws) | Print: "Network error: {message}. Check your connection." | 1 |
| App already exists | Print: "App already registered (id: {_id}). Skipping add." | 0 (continue) |
| Build poll timeout (15 min) | Print: "Build still running after 15 minutes. Check Codemagic dashboard." | 0 (advisory) |

### Error message pattern (matching codebase convention):
```javascript
console.error(`Error: ${message}`);
process.exit(1);
```

---

## CLI Integration Approach

### Entry Point 1: Via `npx store-automator`

```
npx store-automator --codemagic-setup
npx store-automator --codemagic-setup --trigger
npx store-automator --codemagic-setup --trigger --branch=develop
npx store-automator --codemagic-setup --trigger --wait
npx store-automator --codemagic-setup --trigger --workflow=ios-release
```

### Entry Point 2: Standalone

```
CM_API_TOKEN=xxx node scripts/codemagic-setup.mjs
node scripts/codemagic-setup.mjs --token=xxx --trigger --branch=main --wait
```

### CLI Flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--codemagic-setup` | none | Activate Codemagic setup mode | (required for CLI) |
| `--token=VALUE` | none | Codemagic API token (overrides env) | `$CM_API_TOKEN` |
| `--trigger` | none | Also trigger a build after setup | false |
| `--branch=NAME` | none | Branch to build | `main` |
| `--wait` | none | Poll and wait for build to complete | false |
| `--workflow=ID` | none | Specific workflow ID to trigger | (first available) |
| `--config=PATH` | none | Path to ci.config.yaml | `./ci.config.yaml` |

---

## Repo URL Resolution Strategy

The script needs a GitHub repository URL to register with Codemagic. Resolution order:

1. **git remote**: `git remote get-url origin` -- most reliable, always available in a git repo
2. **ci.config.yaml**: Could add a `ci.repo_url` field, but currently not in schema
3. **package.json `repository.url`**: Available in store-automator itself but not in user projects

**Recommendation:** Use `git remote get-url origin` as primary source. This requires no config changes and works for any git repository. Convert SSH URLs (`git@github.com:org/repo.git`) to HTTPS (`https://github.com/org/repo.git`) for consistency, since Codemagic accepts both but matching on list requires a canonical form.

---

## Build Status Polling Design

```
Poll interval: 30 seconds
Max poll time: 15 minutes (30 iterations)
Terminal states: 'finished', 'failed', 'canceled', 'error'

Output during poll:
  [00:00] Build queued...
  [00:30] Building...
  [01:00] Building...
  [05:30] Build finished successfully.
```

---

## YAML Parsing Strategy (No Dependencies)

Two approaches for reading `ci.config.yaml` without adding a YAML library:

**Approach A (Recommended): Use `yq` via subprocess** -- matches `generate.sh` pattern
```javascript
function readConfigValue(configPath, yamlPath) {
  const result = exec(`yq -r '${yamlPath}' "${configPath}"`);
  if (!result || result === 'null') return null;
  return result;
}
```
Falls back gracefully if `yq` is not installed (the script does not strictly need config values beyond repo URL, which comes from git).

**Approach B: Minimal regex parser** -- only for the simple flat values needed
Not recommended. YAML is complex enough that partial parsing is fragile.

---

## Package.json `files` Array

The `scripts/` directory is NOT in the `files` array in `package.json`. This is correct because:
- `scripts/` contains build-time CI scripts (Python, Shell) used on Codemagic machines
- `scripts/codemagic-setup.mjs` is a standalone entry, not needed when installed as npm package
- The CLI path (`bin/cli.mjs -> src/codemagic-setup.mjs`) works via the published `src/` directory

If standalone usage via `npx` is required from the npm package, `scripts/` would need to be added to `files`. However, since the main path is `npx store-automator --codemagic-setup`, this is not necessary.

---

## Build Sequence (Phased Checklist)

### Phase 1: API Client
- [ ] Create `/Users/gas/store-automator/src/codemagic-api.mjs`
- [ ] Implement `cmFetch` wrapper with auth headers and error handling
- [ ] Implement `listApps`, `findAppByRepo`, `addApp`, `startBuild`, `getBuildStatus`

### Phase 2: Setup Orchestrator
- [ ] Create `/Users/gas/store-automator/src/codemagic-setup.mjs`
- [ ] Implement repo URL resolution (git remote + URL normalization)
- [ ] Implement config reading (yq with fallback)
- [ ] Implement main orchestration flow: check -> add -> trigger -> poll
- [ ] Implement build status polling loop

### Phase 3: CLI Integration
- [ ] Modify `/Users/gas/store-automator/bin/cli.mjs` -- add `--codemagic-setup`, `--trigger`, `--wait`, `--workflow`, `--branch`, `--token`, `--config` flags
- [ ] Add help text for new flags
- [ ] Wire dynamic import of `src/codemagic-setup.mjs`

### Phase 4: Standalone Entry
- [ ] Create `/Users/gas/store-automator/scripts/codemagic-setup.mjs`
- [ ] Parse standalone args, delegate to `src/codemagic-setup.mjs`

---

## Critical Details

### Security
- API token NEVER logged or printed (even in verbose mode)
- Token resolved from env var first, CLI arg second (env var is more secure)
- No token stored to disk

### State Management
- Stateless: no local state files created
- Idempotent: re-running when app already exists simply skips creation
- Build IDs printed to stdout for reference

### Testing Strategy
- Unit tests: mock `fetch` globally, test each API client method
- Integration test: env-gated test that hits real Codemagic API with a test token
- The API client's `cmFetch` is the single point to mock

### Edge Cases
- SSH vs HTTPS repo URLs: normalize both to compare against Codemagic app list
- Multiple remotes: always use `origin`
- Codemagic app list may use different URL format than local git remote
- Private repos may need SSH key upload (POST /apps/new endpoint) -- deferred, not in scope
- `yq` version differences (yq v3 vs v4 syntax) -- use `-r` which works in both

---

## Codemagic API Reference (Verified)

| Endpoint | Method | Auth Header | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/apps` | GET | `x-auth-token` | none | `{ applications: [{ _id, appName, workflows, ... }] }` |
| `/apps` | POST | `x-auth-token` | `{ repositoryUrl, teamId? }` | `{ _id, appName }` |
| `/builds` | POST | `x-auth-token` | `{ appId, workflowId, branch }` | `{ buildId }` |
| `/builds/{id}` | GET | `x-auth-token` | none | `{ build: { _id, status, ... } }` |
| `/builds/{id}/cancel` | POST | `x-auth-token` | none | 200 or 208 |

Sources:
- [Codemagic Applications API](https://docs.codemagic.io/rest-api/applications/)
- [Codemagic Builds API](https://docs.codemagic.io/rest-api/builds/)
- [Codemagic API Overview](https://docs.codemagic.io/rest-api/codemagic-rest-api/)

### Build Status Values (from API + blog examples)
- `queued` -- build is waiting
- `building` -- build in progress
- `finished` -- build completed successfully
- `failed` -- build failed
- `canceled` -- build was canceled
