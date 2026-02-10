# daemux-plugins

Monorepo of daemux runtime plugins published to npm under the `@daemux` scope.

## Structure

```
packages/plugin-sdk/              → @daemux/plugin-sdk (shared types + helpers)
llm-providers/anthropic-provider/ → @daemux/anthropic-provider
channels/telegram-adapter/        → @daemux/telegram-adapter
features/human-behavior/          → @daemux/human-behavior
features/transcription/           → @daemux/transcription
claude-plugins/                   → @daemux/claude-plugin (npm package, has its own CLAUDE.md)
```

## Build

```bash
bun install          # required — workspace:* protocol needs bun for dependency resolution
npm run build        # SDK first, then all plugins (npm works for compilation)
npm run typecheck    # type-check all workspaces
```

## ESM Requirement

All plugins use `"type": "module"`. Relative imports in `.ts` source files **must** include the `.js` extension:

```typescript
import { Foo } from './bar.js';       // correct
import { Foo } from './bar';          // wrong — will fail at runtime
```

## Adding a New Plugin

1. Create directory under the appropriate category (`llm-providers/`, `channels/`, `features/`)
2. Add `package.json` with `name: "@daemux/<name>"`, `type: "module"`, `publishConfig: { "access": "public" }`, `files: ["dist", ".claude-plugin"]`
3. Add `tsconfig.json` (copy from an existing plugin)
4. Add `.claude-plugin/plugin.json` with `name`, `version`, `description`
5. Implement `activate(api)` / `deactivate()` exports
6. Register the workspace in root `package.json` `workspaces` array if the category directory is new
7. Add the workspace to `build:plugins` script in root `package.json`

## Adding an MCP Server

Place MCP server configs in a plugin's `.claude-plugin/` directory or as standalone packages under `mcp-servers/`.

**MCP Development Resources:**
- https://modelcontextprotocol.io — full spec, guides, examples
- https://modelcontextprotocol.io/docs/sdk — official SDKs (TypeScript, Python, Go, etc.)
- https://modelcontextprotocol.io/docs/tools/inspector — MCP Inspector for interactive testing

## Publishing

### Local publish (recommended for quick releases)

```bash
npm run publish      # runs scripts/publish.sh
```

Requires `NPM_TOKEN` in a local `.env` file (gitignored). The script resolves `workspace:*` to the actual SDK version, publishes all packages, then restores `workspace:*` locally.

### CI publish (tag-based)

1. Bump version in the plugin's `package.json` **and** `.claude-plugin/plugin.json`
2. Commit, then tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`
3. Push: `git push origin main --follow-tags`

CI resolves `workspace:*` → actual SDK version at publish time.

## Version Management

When releasing a plugin, bump the version in **both** files:
- `<plugin>/package.json` — the `version` field
- `<plugin>/.claude-plugin/plugin.json` — the `version` field

## Dependencies

All plugins depend on `@daemux/plugin-sdk` via `"workspace:*"` (resolved to `^{version}` at publish time).
