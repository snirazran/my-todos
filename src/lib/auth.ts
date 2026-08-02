import { cookies, headers } from 'next/headers';
import { getAdminAuth } from '@/lib/firebaseAdmin';
import { verifyBearerToken } from '@/lib/apiTokens';
import { authOverrideStore } from '@/lib/authContext';

export type AuthContext = {
  uid: string;
  email?: string;
  /** Bearer identities come from API clients and never carry admin rights. */
  authMethod: 'cookie' | 'bearer';
  scopes?: string[];
  clientId?: string;
  [key: string]: unknown;
};

async function bearerFromHeader() {
  const headerStore = await headers();
  const raw =
    headerStore.get('authorization') ?? headerStore.get('Authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() || null;
}

export async function requireAuth(): Promise<AuthContext> {
  const override = authOverrideStore.getStore();
  if (override) return override;

  const bearer = await bearerFromHeader();
  if (bearer) {
    const identity = await verifyBearerToken(bearer);
    if (!identity) {
      throw new Error('Unauthenticated - Invalid bearer token');
    }
    return {
      uid: identity.userId,
      authMethod: 'bearer',
      scopes: identity.scopes,
      clientId: identity.clientId,
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Unauthenticated - No token cookie found');
  }

  const adminAuth = getAdminAuth();

  try {
    const decoded = await adminAuth.verifySessionCookie(token);
    return { ...decoded, authMethod: 'cookie' } as AuthContext;
  } catch {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return { ...decoded, authMethod: 'cookie' } as AuthContext;
    } catch (error) {
      console.error('Error verifying Firebase token:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unknown token verification error';
      throw new Error(`Unauthenticated - Invalid token - ${message}`);
    }
  }
}

export async function requireUserId() {
  const decoded = await requireAuth();
  return decoded.uid;
}

/** Throws unless the caller signed in interactively (not via an API token). */
export async function requireSessionAuth(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.authMethod !== 'cookie') {
    throw new Error('Forbidden - Session authentication required');
  }
  return ctx;
}
