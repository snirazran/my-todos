const RC_V2_BASE = 'https://api.revenuecat.com/v2';
const CACHE_MS = 5 * 60_000;

export const CATALOG_STORES = [
  'app_store',
  'play_store',
  'paddle',
  'paddle_sandbox',
  'other',
] as const;
export type CatalogStore = (typeof CATALOG_STORES)[number];

export const CATALOG_STORE_LABELS: Record<CatalogStore, string> = {
  app_store: 'App Store',
  play_store: 'Google Play',
  paddle: 'Web (Paddle)',
  paddle_sandbox: 'Web sandbox',
  other: 'Other',
};

export type CatalogProduct = {
  store: CatalogStore;
  storeIdentifier: string;
  type: string;
  name: string;
};

export type CatalogPackage = {
  id: string;
  name: string;
  products: CatalogProduct[];
};

export type CatalogOffering = {
  id: string;
  name: string;
  isCurrent: boolean;
  packages: CatalogPackage[];
};

export type RevenueCatCatalog = {
  configured: boolean;
  offerings: CatalogOffering[];
  error?: string;
  fetchedAt: number;
};

let cache: RevenueCatCatalog | null = null;
let inflight: Promise<RevenueCatCatalog> | null = null;

const v2Key = () => process.env.REVENUECAT_V2_SECRET_KEY?.trim() || '';

async function rc<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${RC_V2_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RevenueCat ${path.split('?')[0]} answered ${res.status}`);
  return res.json() as Promise<T>;
}

type RcList<T> = { items?: T[]; next_page?: string | null };
type RcApp = { id: string; type: string; paddle?: { paddle_is_sandbox?: boolean } };
type RcProduct = {
  app_id: string;
  store_identifier: string;
  type: string;
  display_name?: string | null;
  state?: string;
};
type RcPackage = {
  lookup_key: string;
  display_name?: string;
  products?: RcList<{ product: RcProduct }>;
};
type RcOffering = {
  lookup_key: string;
  display_name?: string;
  is_current?: boolean;
  state?: string;
  packages?: RcList<RcPackage>;
};

const storeFor = (app: RcApp | undefined): CatalogStore => {
  if (!app) return 'other';
  if (app.type === 'app_store' || app.type === 'mac_app_store') return 'app_store';
  if (app.type === 'play_store') return 'play_store';
  if (app.type === 'paddle') return app.paddle?.paddle_is_sandbox ? 'paddle_sandbox' : 'paddle';
  return 'other';
};

async function load(): Promise<RevenueCatCatalog> {
  const key = v2Key();
  if (!key) return { configured: false, offerings: [], fetchedAt: Date.now() };

  try {
    const projectId =
      process.env.REVENUECAT_PROJECT_ID?.trim() ||
      (await rc<RcList<{ id: string }>>('/projects', key)).items?.[0]?.id;
    if (!projectId) throw new Error('This key has no RevenueCat project');

    const base = `/projects/${encodeURIComponent(projectId)}`;
    const [apps, offerings] = await Promise.all([
      rc<RcList<RcApp>>(`${base}/apps?limit=100`, key),
      rc<RcList<RcOffering>>(
        `${base}/offerings?limit=100&expand=items.package.product`,
        key,
      ),
    ]);
    const appById = new Map((apps.items ?? []).map((app) => [app.id, app]));

    return {
      configured: true,
      fetchedAt: Date.now(),
      offerings: (offerings.items ?? [])
        .filter((offering) => offering.state !== 'archived')
        .map((offering) => ({
          id: offering.lookup_key,
          name: offering.display_name || offering.lookup_key,
          isCurrent: !!offering.is_current,
          packages: (offering.packages?.items ?? []).map((pkg) => ({
            id: pkg.lookup_key,
            name: pkg.display_name || pkg.lookup_key,
            products: (pkg.products?.items ?? [])
              .map(({ product }) => product)
              .filter((product) => product && product.state !== 'archived')
              .map((product) => ({
                store: storeFor(appById.get(product.app_id)),
                storeIdentifier: product.store_identifier,
                type: product.type,
                name: product.display_name || product.store_identifier,
              })),
          })),
        })),
    };
  } catch (error) {
    return {
      configured: true,
      offerings: [],
      fetchedAt: Date.now(),
      error: error instanceof Error ? error.message : 'RevenueCat could not be reached',
    };
  }
}

export async function getRevenueCatCatalog(fresh = false): Promise<RevenueCatCatalog> {
  if (!fresh && cache && !cache.error && Date.now() - cache.fetchedAt < CACHE_MS) return cache;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  cache = await inflight;
  return cache;
}

export function findPackage(
  catalog: RevenueCatCatalog,
  offeringId: string,
  packageId: string,
): CatalogPackage | null {
  return (
    catalog.offerings
      .find((offering) => offering.id === offeringId)
      ?.packages.find((pkg) => pkg.id === packageId) ?? null
  );
}

export async function packagesForStoreProduct(
  storeIdentifier: string,
): Promise<{ offeringId: string; packageId: string }[]> {
  if (!storeIdentifier) return [];
  const catalog = await getRevenueCatCatalog();
  const found: { offeringId: string; packageId: string }[] = [];
  for (const offering of catalog.offerings) {
    for (const pkg of offering.packages) {
      if (pkg.products.some((product) => product.storeIdentifier === storeIdentifier)) {
        found.push({ offeringId: offering.id, packageId: pkg.id });
      }
    }
  }
  return found;
}
