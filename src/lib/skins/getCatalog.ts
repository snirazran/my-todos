import { CATALOG, type ItemDef } from './catalog';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';

/** Seed the DB with all static catalog items if DB is empty */
async function seedIfEmpty() {
  const count = await CatalogItemModel.countDocuments();
  if (count > 0) return;

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
}

/** Returns the full catalog from DB (auto-seeds from static on first call) */
export async function getFullCatalog(): Promise<ItemDef[]> {
  await connectMongo();
  await seedIfEmpty();

  const dbItems = await CatalogItemModel.find({ hidden: { $ne: true } }).lean();

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

/** Build a byId lookup from a catalog array */
export function buildById(catalog: ItemDef[]): Record<string, ItemDef> {
  return Object.fromEntries(catalog.map((i) => [i.id, i]));
}
