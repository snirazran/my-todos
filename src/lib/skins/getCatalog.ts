import { CATALOG, type ItemDef } from './catalog';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel, { type CatalogItemDoc } from '@/lib/models/CatalogItem';

const iso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function toItemDef(doc: Pick<
  CatalogItemDoc,
  'id' | 'name' | 'slot' | 'rarity' | 'riveIndex' | 'icon' | 'priceFlies' | 'sellFlies' | 'availableFrom' | 'availableUntil'
>): ItemDef {
  return {
    id: doc.id,
    name: doc.name,
    slot: doc.slot as ItemDef['slot'],
    rarity: (doc.rarity as ItemDef['rarity']) || 'common',
    riveIndex: doc.riveIndex,
    icon: doc.icon || '',
    priceFlies: doc.priceFlies ?? 0,
    sellFlies: typeof doc.sellFlies === 'number' ? doc.sellFlies : null,
    availableFrom: iso(doc.availableFrom),
    availableUntil: iso(doc.availableUntil),
  };
}

/** Returns the full catalog from DB (auto-seeds from static on first call) */
export async function getFullCatalog(): Promise<ItemDef[]> {
  await connectMongo();

  const dbItems = await CatalogItemModel.find({ hidden: { $ne: true } }).lean();

  // Seed if empty (first call only)
  if (dbItems.length === 0) {
    const docs = CATALOG.map((item) => ({
      id: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      riveIndex: item.riveIndex,
      icon: item.icon || '',
      priceFlies: item.priceFlies ?? 0,
      hidden: false,
    }));

    await CatalogItemModel.insertMany(docs, { ordered: false }).catch(() => {
      // ignore duplicate key errors during race conditions
    });

    // Re-fetch after seeding
    const seeded = await CatalogItemModel.find({ hidden: { $ne: true } }).lean();
    return seeded.map(toItemDef);
  }

  return dbItems.map(toItemDef);
}

let catalogCache: { at: number; items: ItemDef[] } | null = null;
const CATALOG_CACHE_TTL_MS = 5 * 60_000;

export function invalidateCatalogCache() {
  catalogCache = null;
}

/** Like getFullCatalog, but cached in-process for a few minutes. */
export async function getCachedCatalog(): Promise<ItemDef[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_CACHE_TTL_MS) {
    return catalogCache.items;
  }
  const items = await getFullCatalog();
  catalogCache = { at: Date.now(), items };
  return items;
}

/** Build a byId lookup from a catalog array */
export function buildById(catalog: ItemDef[]): Record<string, ItemDef> {
  return Object.fromEntries(catalog.map((i) => [i.id, i]));
}
