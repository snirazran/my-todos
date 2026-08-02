import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  type CryptoKey,
} from 'jose';

const ALG = 'ES256';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export function oauthIssuer() {
  return (process.env.OAUTH_ISSUER ?? '').replace(/\/$/, '');
}

export function mcpResourceUrl() {
  return process.env.MCP_RESOURCE_URL ?? `${oauthIssuer()}/api/mcp`;
}

/** Coolify (and most dashboards) store PEMs with escaped newlines. */
function normalizePem(raw: string | undefined) {
  if (!raw) return undefined;
  const pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  return pem.trim() ? pem.trim() : undefined;
}

let privateKeyPromise: Promise<CryptoKey> | null = null;
let publicKeyPromise: Promise<CryptoKey> | null = null;

function getPrivateKey() {
  const pem = normalizePem(process.env.MCP_JWT_PRIVATE_KEY);
  if (!pem) return null;
  privateKeyPromise ??= importPKCS8(pem, ALG);
  return privateKeyPromise;
}

function getPublicKey() {
  const pem = normalizePem(process.env.MCP_JWT_PUBLIC_KEY);
  if (!pem) return null;
  publicKeyPromise ??= importSPKI(pem, ALG);
  return publicKeyPromise;
}

export function oauthConfigured() {
  return Boolean(
    normalizePem(process.env.MCP_JWT_PRIVATE_KEY) &&
      normalizePem(process.env.MCP_JWT_PUBLIC_KEY) &&
      oauthIssuer(),
  );
}

export type AccessClaims = {
  sub: string;
  scopes: string[];
  clientId: string;
};

export async function signAccessJwt(params: {
  userId: string;
  scopes: string[];
  clientId: string;
  resource: string;
}) {
  const key = getPrivateKey();
  if (!key) throw new Error('MCP_JWT_PRIVATE_KEY is not configured');
  return new SignJWT({
    scope: params.scopes.join(' '),
    client_id: params.clientId,
  })
    .setProtectedHeader({ alg: ALG, typ: 'at+jwt' })
    .setSubject(params.userId)
    .setIssuer(oauthIssuer())
    .setAudience(params.resource)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(await key);
}

/**
 * Verifies an access token. The audience check is the RFC 8707 protection that
 * stops a token minted for another resource being replayed against this one.
 */
export async function verifyAccessJwt(
  token: string,
): Promise<AccessClaims | null> {
  const key = getPublicKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, await key, {
      issuer: oauthIssuer(),
      audience: mcpResourceUrl(),
      algorithms: [ALG],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    const scope = typeof payload.scope === 'string' ? payload.scope : '';
    return {
      sub: payload.sub,
      scopes: scope.split(' ').filter(Boolean),
      clientId:
        typeof payload.client_id === 'string' ? payload.client_id : 'unknown',
    };
  } catch {
    return null;
  }
}
