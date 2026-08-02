import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import connectMongo from '@/lib/mongoose';
import ApiTokenModel from '@/lib/models/ApiToken';
import OAuthRevocationModel from '@/lib/models/OAuthRevocation';
import { verifyAccessJwt } from '@/lib/oauth/keys';

export const SCOPES = ['tasks:read', 'tasks:write', 'progress:read'] as const;
export type Scope = (typeof SCOPES)[number];

export const DEFAULT_SCOPES: Scope[] = [
  'tasks:read',
  'tasks:write',
  'progress:read',
];

const PAT_PREFIX = 'frg_';

export type BearerIdentity = {
  userId: string;
  scopes: string[];
  clientId: string;
  kind: 'pat' | 'oauth';
};

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

export function normalizeScopes(input: unknown): Scope[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\s,]+/)
      : [];
  const out: Scope[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (isScope(trimmed) && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

export function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

/** Generates a personal access token. The raw value is shown to the user once. */
export function generatePat() {
  const raw = `${PAT_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

export function generateOpaqueToken(prefix: string) {
  const raw = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

function constantTimeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Resolves a bearer token to an identity. Personal access tokens are opaque and
 * looked up by hash; OAuth access tokens are self-contained JWTs verified
 * against the local signing key.
 */
export async function verifyBearerToken(
  token: string,
): Promise<BearerIdentity | null> {
  if (!token) return null;

  if (token.startsWith(PAT_PREFIX)) {
    await connectMongo();
    const hash = hashToken(token);
    const doc = await ApiTokenModel.findOne({ tokenHash: hash, kind: 'pat' })
      .select('userId scopes tokenHash revokedAt expiresAt')
      .lean();
    if (!doc) return null;
    if (!constantTimeEqual(doc.tokenHash, hash)) return null;
    if (doc.revokedAt) return null;
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) return null;

    void ApiTokenModel.updateOne(
      { tokenHash: hash },
      { $set: { lastUsedAt: new Date() } },
    ).catch(() => null);

    return {
      userId: doc.userId,
      scopes: doc.scopes ?? [],
      clientId: 'pat',
      kind: 'pat',
    };
  }

  const claims = await verifyAccessJwt(token);
  if (!claims) return null;

  // Access tokens are self-contained, so a disconnect only takes effect
  // immediately if we check it here.
  await connectMongo();
  const revocation = await OAuthRevocationModel.findOne({
    userId: claims.sub,
    clientId: claims.clientId,
  })
    .select('revokedAt')
    .lean();
  if (revocation && revocation.revokedAt.getTime() > claims.issuedAt * 1000) {
    return null;
  }

  return {
    userId: claims.sub,
    scopes: claims.scopes,
    clientId: claims.clientId,
    kind: 'oauth',
  };
}
