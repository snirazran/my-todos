import CatalogItemModel from '@/lib/models/CatalogItem';
import GiftDropConfigModel from '@/lib/models/GiftDropConfig';
import connectMongo from '@/lib/mongoose';
import { CATALOG, type ItemDef } from './catalog';
import { getFullCatalog, buildById } from './getCatalog';

export type GiftDropEntry = {
  itemId: string;
  chance: number;
};

export type GiftDropView = GiftDropEntry & {
  item?: ItemDef;
};

export type GiftConfigView = {
  gift: ItemDef;
  drops: GiftDropView[];
};

const DEFAULT_RARITY_DROPS: Record<string, Partial<Record<ItemDef['rarity'], number>>> = {
  common: {
    common: 0.9,
    uncommon: 0.095,
    rare: 0.0049,
    epic: 0.0001,
    legendary: 0.000002,
  },
  rare: {
    common: 0.45,
    uncommon: 0.35,
    rare: 0.15,
    epic: 0.049,
    legendary: 0.001,
  },
  legendary: {
    common: 0.05,
    uncommon: 0.15,
    rare: 0.35,
    epic: 0.35,
    legendary: 0.1,
  },
};

function itemToDef(item: {
  id: string;
  name: string;
  slot: ItemDef['slot'];
  rarity: ItemDef['rarity'];
  riveIndex: number;
  icon?: string;
  priceFlies?: number;
}): ItemDef {
  return {
    id: item.id,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    riveIndex: item.riveIndex,
    icon: item.icon || '',
    priceFlies: item.priceFlies ?? 0,
  };
}

async function seedCatalogIfEmpty() {
  const count = await CatalogItemModel.countDocuments();
  if (count > 0) return;
  await CatalogItemModel.insertMany(
    CATALOG.map((item) => ({
      id: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      riveIndex: item.riveIndex,
      icon: item.icon || '',
      priceFlies: item.priceFlies ?? 0,
      hidden: false,
    })),
    { ordered: false },
  ).catch(() => {});
}

function buildDefaultDrops(gift: ItemDef, catalog: ItemDef[]) {
  const weights = DEFAULT_RARITY_DROPS[gift.rarity] ?? DEFAULT_RARITY_DROPS.common;
  const prizeItems = catalog.filter((item) => item.slot !== 'container');
  const drops: GiftDropEntry[] = [];

  Object.entries(weights).forEach(([rarity, chance]) => {
    if (!chance || chance <= 0) return;
    const items = prizeItems.filter((item) => item.rarity === rarity);
    if (items.length === 0) return;
    const chancePerItem = chance / items.length;
    items.forEach((item) => drops.push({ itemId: item.id, chance: chancePerItem }));
  });

  return drops;
}

export async function ensureGiftDropConfigs() {
  await connectMongo();
  await seedCatalogIfEmpty();

  const catalog = await getFullCatalog();
  const gifts = catalog.filter((item) => item.slot === 'container');

  await Promise.all(
    gifts.map(async (gift) => {
      const existing = await GiftDropConfigModel.exists({ giftId: gift.id });
      if (existing) return;
      await GiftDropConfigModel.create({
        giftId: gift.id,
        drops: buildDefaultDrops(gift, catalog),
      });
    }),
  );
}

export async function getGiftConfigs(includeHidden = false): Promise<GiftConfigView[]> {
  await connectMongo();
  await ensureGiftDropConfigs();

  const catalogDocs = await CatalogItemModel.find(
    includeHidden ? {} : { hidden: { $ne: true } },
  ).lean();
  const catalog = catalogDocs.map((item) =>
    itemToDef({
      id: item.id,
      name: item.name,
      slot: item.slot as ItemDef['slot'],
      rarity: item.rarity as ItemDef['rarity'],
      riveIndex: item.riveIndex,
      icon: item.icon,
      priceFlies: item.priceFlies,
    }),
  );
  const byId = buildById(catalog);
  const configs = await GiftDropConfigModel.find({}).lean();
  const configMap = new Map(configs.map((config) => [config.giftId, config]));

  return catalog
    .filter((item) => item.slot === 'container')
    .sort((a, b) => a.riveIndex - b.riveIndex || a.name.localeCompare(b.name))
    .map((gift) => ({
      gift,
      drops: (configMap.get(gift.id)?.drops ?? []).map((drop) => ({
        itemId: drop.itemId,
        chance: drop.chance,
        item: byId[drop.itemId],
      })),
    }));
}

export async function getGiftConfig(giftId: string): Promise<GiftConfigView | null> {
  const configs = await getGiftConfigs(false);
  return configs.find((config) => config.gift.id === giftId) ?? null;
}

export function pickGiftDrop(config: GiftConfigView): ItemDef | null {
  const validDrops = config.drops.filter(
    (drop): drop is GiftDropView & { item: ItemDef } =>
      !!drop.item && drop.chance > 0 && drop.item.slot !== 'container',
  );
  if (validDrops.length === 0) return null;

  const total = validDrops.reduce((sum, drop) => sum + drop.chance, 0);
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const drop of validDrops) {
    roll -= drop.chance;
    if (roll <= 0) return drop.item;
  }
  return validDrops[validDrops.length - 1].item;
}
