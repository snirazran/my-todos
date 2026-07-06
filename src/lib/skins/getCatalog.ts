import { CATALOG, type ItemDef } from './catalog';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';

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
    return seeded.map((d) => ({
      id: d.id,
      name: d.name,
      slot: d.slot as ItemDef['slot'],
      rarity: (d.rarity as ItemDef['rarity']) || 'common',
      riveIndex: d.riveIndex,
      icon: d.icon || '',
      priceFlies: d.priceFlies ?? 0,
    }));
  }

  return dbItems.map((d) => ({
    id: d.id,
    name: d.name,
    slot: d.slot as ItemDef['slot'],
    rarity: (d.rarity as ItemDef['rarity']) || 'common',
    riveIndex: d.riveIndex,
    icon: d.icon || '',
    priceFlies: d.priceFlies ?? 0,
  }));
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
