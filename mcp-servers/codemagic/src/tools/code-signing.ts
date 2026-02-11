/**
 * Codemagic Code Signing helper tools (V3 API).
 * Creates pre-configured variable groups for Apple code signing.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { V3Client } from '../api/v3-client.js';
import { handleToolCall, resolveTeamId } from '../api/errors.js';
import type { CmVariableGroup } from '../types/api-types.js';

async function createSecureVariableGroup(
  v3: V3Client,
  teamId: string,
  groupName: string,
  variables: Array<{ name: string; value: string }>,
): Promise<CmVariableGroup> {
  const group = await v3.post<CmVariableGroup>(
    `/teams/${encodeURIComponent(teamId)}/variable-groups`,
    { name: groupName, advanced_security: true },
  );

  await v3.post(
    `/variable-groups/${encodeURIComponent(group.id)}/variables`,
    { secure: true, variables },
  );

  return v3.get<CmVariableGroup>(
    `/variable-groups/${encodeURIComponent(group.id)}`,
  );
}

export function registerCodeSigningTools(server: McpServer, v3: V3Client, defaultTeamId?: string): void {
  server.tool(
    'setup_asc_credentials',
    'Create a variable group with App Store Connect API key credentials',
    {
      teamId: z.string().optional().describe('Team ID (uses default if omitted)'),
      groupName: z.string().optional().describe('Variable group name (default: "ASC Credentials")'),
      keyIdentifier: z.string().describe('App Store Connect Key Identifier'),
      issuerId: z.string().describe('App Store Connect Issuer ID'),
      privateKey: z.string().describe('App Store Connect private key content (.p8)'),
    },
    ({ teamId, groupName, keyIdentifier, issuerId, privateKey }) =>
      handleToolCall(() => {
        const resolved = resolveTeamId(teamId, defaultTeamId);
        return createSecureVariableGroup(v3, resolved, groupName ?? 'ASC Credentials', [
          { name: 'APP_STORE_CONNECT_KEY_IDENTIFIER', value: keyIdentifier },
          { name: 'APP_STORE_CONNECT_ISSUER_ID', value: issuerId },
          { name: 'APP_STORE_CONNECT_PRIVATE_KEY', value: privateKey },
        ]);
      }),
  );

  server.tool(
    'setup_code_signing',
    'Create a variable group with iOS code signing certificate and provisioning profile',
    {
      teamId: z.string().optional().describe('Team ID (uses default if omitted)'),
      groupName: z.string().optional().describe('Variable group name (default: "Code Signing")'),
      certificate: z.string().describe('Base64-encoded .p12 certificate'),
      certificatePassword: z.string().describe('Certificate password'),
      provisioningProfile: z.string().describe('Base64-encoded provisioning profile'),
    },
    ({ teamId, groupName, certificate, certificatePassword, provisioningProfile }) =>
      handleToolCall(() => {
        const resolved = resolveTeamId(teamId, defaultTeamId);
        return createSecureVariableGroup(v3, resolved, groupName ?? 'Code Signing', [
          { name: 'CM_CERTIFICATE', value: certificate },
          { name: 'CM_CERTIFICATE_PASSWORD', value: certificatePassword },
          { name: 'CM_PROVISIONING_PROFILE', value: provisioningProfile },
        ]);
      }),
  );
}
