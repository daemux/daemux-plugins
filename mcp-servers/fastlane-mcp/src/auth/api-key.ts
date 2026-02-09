/**
 * App Store Connect API key management.
 * Parses P8 filename for key_id/issuer_id, generates JWT via jose,
 * caches JWT for 15 minutes, and writes temp api_key.json for Fastlane CLI.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SignJWT, importPKCS8 } from 'jose';
import { AuthError } from '../exec/errors.js';

const FILENAME_REGEX = /key_id_([A-Z0-9]+)_issuer_([a-f0-9-]+)/;
const JWT_CACHE_MS = 15 * 60 * 1000;
const JWT_EXPIRY_MINUTES = 20;

export interface AuthState {
  keyId: string;
  issuerId: string;
  privateKey: string;
  inHouse: boolean;
  vendorId?: string;
  cachedJwt: string | null;
  cachedJwtExpires: number;
  apiKeyJsonPath: string | null;
}

let authState: AuthState | null = null;

export function getAuthState(): AuthState {
  if (!authState) {
    throw new AuthError(
      'API key not configured. Call configure_api_key first.',
    );
  }
  return authState;
}

export function isAuthConfigured(): boolean {
  return authState !== null;
}

/** Parse key_id and issuer_id from a P8 filename. */
export function parseP8Filename(
  filepath: string,
): { keyId: string; issuerId: string; vendorId?: string } | null {
  const match = filepath.match(FILENAME_REGEX);
  if (!match) return null;

  const vendorMatch = filepath.match(/vendor_id_(\w+)/);
  return {
    keyId: match[1],
    issuerId: match[2],
    vendorId: vendorMatch?.[1],
  };
}

/** Configure API key from a P8 file path. */
export async function configureApiKey(params: {
  keyFilepath: string;
  keyId?: string;
  issuerId?: string;
  inHouse?: boolean;
}): Promise<{ keyId: string; issuerId: string }> {
  const privateKey = await readFile(params.keyFilepath, 'utf-8');
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new AuthError(
      'Invalid P8 file: missing PRIVATE KEY header',
    );
  }

  const parsed = parseP8Filename(params.keyFilepath);
  const keyId = params.keyId || parsed?.keyId;
  const issuerId = params.issuerId || parsed?.issuerId;

  if (!keyId) {
    throw new AuthError(
      'key_id not provided and could not be parsed from filename',
    );
  }
  if (!issuerId) {
    throw new AuthError(
      'issuer_id not provided and could not be parsed from filename',
    );
  }

  const apiKeyJsonPath = await writeApiKeyJson(
    keyId,
    issuerId,
    params.keyFilepath,
    params.inHouse ?? false,
  );

  authState = {
    keyId,
    issuerId,
    privateKey,
    inHouse: params.inHouse ?? false,
    vendorId: parsed?.vendorId,
    cachedJwt: null,
    cachedJwtExpires: 0,
    apiKeyJsonPath,
  };

  return { keyId, issuerId };
}

/** Generate a JWT for the ASC API, using cache when valid. */
export async function generateJwt(): Promise<string> {
  const state = getAuthState();
  const now = Date.now();

  if (state.cachedJwt && now < state.cachedJwtExpires) {
    return state.cachedJwt;
  }

  const pk = await importPKCS8(state.privateKey, 'ES256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: state.keyId })
    .setIssuer(state.issuerId)
    .setAudience('appstoreconnect-v1')
    .setExpirationTime(`${JWT_EXPIRY_MINUTES}m`)
    .setIssuedAt()
    .sign(pk);

  state.cachedJwt = jwt;
  state.cachedJwtExpires = now + JWT_CACHE_MS;
  return jwt;
}

/** Write a temp api_key.json file for Fastlane CLI usage. */
async function writeApiKeyJson(
  keyId: string,
  issuerId: string,
  keyFilepath: string,
  inHouse: boolean,
): Promise<string> {
  const dir = join(tmpdir(), 'fastlane-mcp');
  await mkdir(dir, { recursive: true });

  const apiKeyData = {
    key_id: keyId,
    issuer_id: issuerId,
    key_filepath: keyFilepath,
    in_house: inHouse,
  };

  const outPath = join(dir, 'api_key.json');
  await writeFile(outPath, JSON.stringify(apiKeyData, null, 2), { mode: 0o600 });
  return outPath;
}
