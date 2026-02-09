#!/usr/bin/env node
/**
 * Fastlane MCP Server
 * Hybrid MCP server: Fastlane CLI for native actions +
 * App Store Connect REST API for IAP, subscriptions, and status queries.
 * Provides 19 tools for full App Store Connect lifecycle management.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveProxyConfig } from './exec/proxy.js';
import { registerAuthTools } from './tools/auth-tools.js';
import { registerAppManagementTools } from './tools/app-management.js';
import { registerMetadataTools } from './tools/metadata.js';
import { registerPrivacyTools } from './tools/privacy.js';
import { registerScreenshotTools } from './tools/screenshots.js';
import { registerIapTools } from './tools/iap.js';
import { registerSubscriptionTools } from './tools/subscriptions.js';
import { registerPricingTools } from './tools/pricing.js';
import { registerPublishingTools } from './tools/publishing.js';
import { registerStatusTools } from './tools/status.js';
import type { FastlaneRunnerConfig } from './exec/fastlane-runner.js';
import type { AscClientConfig } from './exec/asc-client.js';

const proxy = resolveProxyConfig();

const fastlaneConfig: FastlaneRunnerConfig = { proxy };
const ascConfig: AscClientConfig = { proxy };

const server = new McpServer({
  name: 'fastlane',
  version: '0.1.0',
});

registerAuthTools(server);
registerAppManagementTools(server, fastlaneConfig);
registerMetadataTools(server, fastlaneConfig);
registerPrivacyTools(server, fastlaneConfig);
registerScreenshotTools(server, fastlaneConfig);
registerIapTools(server, ascConfig);
registerSubscriptionTools(server, ascConfig);
registerPricingTools(server, fastlaneConfig, ascConfig);
registerPublishingTools(server, fastlaneConfig);
registerStatusTools(server, ascConfig);

const transport = new StdioServerTransport();
await server.connect(transport);
