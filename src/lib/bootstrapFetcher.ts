import type { BootstrapSlice } from '@/app/api/bootstrap/route';

type BootstrapResponse = Record<string, BootstrapSlice>;

const clientTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

function sliceForUrl(url: string): string | null {
  const tz = encodeURIComponent(clientTimezone());
  switch (url) {
    case '/api/user':
      return 'user';
    case '/api/admin/me':
      return 'adminMe';
    case `/api/quests?view=home&timezone=${tz}`:
      return 'questsHome';
    case `/api/friends?tz=${tz}`:
      return 'friends';
    case '/api/friends/request':
      return 'friendRequests';
    case '/api/buddy/invite':
      return 'buddyInvites';
    case '/api/skins/inventory?view=summary':
      return 'inventorySummary';
    case '/api/backgrounds':
      return 'backgrounds';
    case '/api/buddy/state':
      return 'buddyState';
    default:
      return null;
  }
}

const BOOTSTRAP_MAX_AGE_MS = 10_000;

let bootstrapPromise: Promise<BootstrapResponse | null> | null = null;
let bootstrapResolvedAt = 0;
const servedSlices = new Set<string>();

export function resetBootstrapCache() {
  bootstrapPromise = null;
  bootstrapResolvedAt = 0;
  servedSlices.clear();
}

async function loadBootstrap(): Promise<BootstrapResponse | null> {
  try {
    const res = await fetch(
      `/api/bootstrap?timezone=${encodeURIComponent(clientTimezone())}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as BootstrapResponse;
  } catch {
    return null;
  } finally {
    bootstrapResolvedAt = Date.now();
  }
}

/**
 * SWR fetcher: the first request for each layout-level endpoint is served
 * from a single shared /api/bootstrap call; every later request (mutations,
 * revalidations) goes straight to the individual endpoint. The shared payload
 * is a snapshot, so it only answers slices requested within
 * BOOTSTRAP_MAX_AGE_MS of it resolving — anything later reads live.
 */
export async function bootstrapFetcher<T = unknown>(url: string): Promise<T> {
  const direct = () => {
    const directUrl =
      typeof window !== 'undefined' && url.startsWith('/api/skins/inventory')
        ? `${url}${url.includes('?') ? '&' : '?'}timezone=${encodeURIComponent(clientTimezone())}`
        : url;
    return fetch(directUrl, { cache: 'no-store' }).then(
      (res) => res.json() as Promise<T>,
    );
  };
  if (typeof window === 'undefined') return direct();

  const slice = sliceForUrl(url);
  if (!slice || servedSlices.has(slice)) return direct();
  servedSlices.add(slice);

  bootstrapPromise ??= loadBootstrap();
  const bootstrap = await bootstrapPromise;
  const entry = bootstrap?.[slice];
  if (!entry?.ok) return direct();
  if (Date.now() - bootstrapResolvedAt > BOOTSTRAP_MAX_AGE_MS) return direct();
  return entry.data as T;
}
