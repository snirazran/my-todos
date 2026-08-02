import connectMongo from '@/lib/mongoose';
import OAuthClientModel, {
  type OAuthClientDoc,
} from '@/lib/models/OAuthClient';

const CIMD_MAX_BYTES = 32 * 1024;
const CIMD_CACHE_MS = 24 * 60 * 60 * 1000;
const CIMD_TIMEOUT_MS = 5000;

export type ResolvedClient = Pick<
  OAuthClientDoc,
  'clientId' | 'clientName' | 'redirectUris' | 'source' | 'logoUri' | 'clientUri'
>;

export function isCimdClientId(clientId: string) {
  if (!clientId.startsWith('https://')) return false;
  try {
    const url = new URL(clientId);
    return !url.hash && url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Loopback redirects are how native and desktop MCP clients receive the code.
 * The port is chosen at runtime, so it cannot be matched exactly.
 */
function isLoopbackRedirect(uri: string) {
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

export function redirectUriAllowed(client: ResolvedClient, redirectUri: string) {
  if (client.redirectUris.includes(redirectUri)) return true;
  if (!isLoopbackRedirect(redirectUri)) return false;
  return client.redirectUris.some((allowed) => {
    if (!isLoopbackRedirect(allowed)) return false;
    try {
      const a = new URL(allowed);
      const b = new URL(redirectUri);
      return a.hostname === b.hostname && a.pathname === b.pathname;
    } catch {
      return false;
    }
  });
}

async function fetchCimd(clientId: string): Promise<ResolvedClient | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIMD_TIMEOUT_MS);
  try {
    const res = await fetch(clientId, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;

    const body = await res.text();
    if (body.length > CIMD_MAX_BYTES) return null;

    const doc = JSON.parse(body);
    // The document must claim the exact URL it was served from, otherwise any
    // host could publish metadata on another's behalf.
    if (doc?.client_id !== clientId) return null;

    const redirectUris = Array.isArray(doc.redirect_uris)
      ? doc.redirect_uris.filter((u: unknown) => typeof u === 'string')
      : [];
    if (redirectUris.length === 0) return null;

    return {
      clientId,
      clientName:
        typeof doc.client_name === 'string' ? doc.client_name.slice(0, 120) : clientId,
      redirectUris,
      source: 'cimd',
      logoUri: typeof doc.logo_uri === 'string' ? doc.logo_uri : undefined,
      clientUri: typeof doc.client_uri === 'string' ? doc.client_uri : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveClient(
  clientId: string,
): Promise<ResolvedClient | null> {
  await connectMongo();

  const cached = await OAuthClientModel.findOne({ clientId }).lean();
  if (cached) {
    const fresh =
      cached.source === 'dcr' ||
      Date.now() - new Date(cached.refreshedAt).getTime() < CIMD_CACHE_MS;
    if (fresh) return cached as ResolvedClient;
  }

  if (!isCimdClientId(clientId)) return (cached as ResolvedClient) ?? null;

  const fetched = await fetchCimd(clientId);
  if (!fetched) return (cached as ResolvedClient) ?? null;

  await OAuthClientModel.updateOne(
    { clientId },
    {
      $set: {
        ...fetched,
        refreshedAt: new Date(),
        expiresAt: new Date(Date.now() + CIMD_CACHE_MS * 7),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );

  return fetched;
}
