import CatalogItemModel from '@/lib/models/CatalogItem';
import GiftDropConfigModel from '@/lib/models/GiftDropConfig';
import BackgroundModel from '@/lib/models/Background';
import connectMongo from '@/lib/mongoose';
import { CATALOG, type ItemDef } from './catalog';
import { getFullCatalog } from './getCatalog';

export type GiftDropMode = 'item' | 'rarity';

export type PrizeKind = 'item' | 'background';

/** A unified prize: a catalog item, or a background rendered from an image. */
export type GiftPrize = ItemDef & {
  kind: PrizeKind;
  imageUrl?: string;
};

export const GIFT_RARITIES: ItemDef['rarity'][] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

export type GiftDropEntry = {
  itemId: string;
  chance: number;
  kind?: PrizeKind;
};

export type GiftRarityDrop = {
  rarity: ItemDef['rarity'];
  chance: number;
};

export type GiftDropView = GiftDropEntry & {
  kind: PrizeKind;
  item?: GiftPrize;
};

export type GiftConfigView = {
  gift: ItemDef;
  dropMode: GiftDropMode;
  drops: GiftDropView[];
  rarityDrops: GiftRarityDrop[];
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

export async function loadBackgroundPrizes(): Promise<GiftPrize[]> {
  const bgs = await BackgroundModel.find({ hidden: { $ne: true } }).lean();
  return bgs.map((bg) => ({
    id: bg.id,
    name: bg.name,
    slot: 'skin',
    rarity: bg.rarity as ItemDef['rarity'],
    riveIndex: 0,
    icon: '',
    priceFlies: bg.priceFlies ?? 0,
    kind: 'background' as const,
    imageUrl:
      bg.images?.mobile ||
      bg.images?.tablet ||
      bg.images?.web ||
      bg.images?.webLarge ||
      '',
  }));
}

/**
 * The full pool of things a gift can award: every non-container catalog item
 * plus every (non-hidden) background, each tagged with its `kind`.
 */
export async function getPrizePool(): Promise<GiftPrize[]> {
  const [catalog, backgrounds] = await Promise.all([
    getFullCatalog(),
    loadBackgroundPrizes(),
  ]);
  const items: GiftPrize[] = catalog
    .filter((item) => item.slot !== 'container')
    .map((item) => ({ ...item, kind: 'item' as const }));
  return [...items, ...backgrounds];
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
  const backgrounds = await loadBackgroundPrizes();
  const bgById = Object.fromEntries(backgrounds.map((bg) => [bg.id, bg]));
  const itemPrizes: Record<string, GiftPrize> = Object.fromEntries(
    catalog.map((item) => [item.id, { ...item, kind: 'item' as const }]),
  );
  const configs = await GiftDropConfigModel.find({}).lean();
  const configMap = new Map(configs.map((config) => [config.giftId, config]));

  return catalog
    .filter((item) => item.slot === 'container')
    .sort((a, b) => a.riveIndex - b.riveIndex || a.name.localeCompare(b.name))
    .map((gift) => {
      const config = configMap.get(gift.id);
      return {
        gift,
        dropMode: (config?.dropMode === 'rarity' ? 'rarity' : 'item') as GiftDropMode,
        drops: (config?.drops ?? []).map((drop) => {
          const kind: PrizeKind = drop.kind === 'background' ? 'background' : 'item';
          return {
            itemId: drop.itemId,
            chance: drop.chance,
            kind,
            item: kind === 'background' ? bgById[drop.itemId] : itemPrizes[drop.itemId],
          };
        }),
        rarityDrops: (config?.rarityDrops ?? [])
          .filter((entry): entry is GiftRarityDrop =>
            GIFT_RARITIES.includes(entry.rarity as ItemDef['rarity']),
          )
          .map((entry) => ({
            rarity: entry.rarity as ItemDef['rarity'],
            chance: entry.chance,
          })),
      };
    });
}

export async function getGiftConfig(giftId: string): Promise<GiftConfigView | null> {
  const configs = await getGiftConfigs(false);
  return configs.find((config) => config.gift.id === giftId) ?? null;
}

function weightedPick<T>(entries: { value: T; weight: number }[]): T | null {
  const valid = entries.filter((e) => e.weight > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const e of valid) {
    roll -= e.weight;
    if (roll <= 0) return e.value;
  }
  return valid[valid.length - 1].value;
}

/**
 * Pick a prize for a gift.
 * - 'item' mode: weighted pick across the configured item drops.
 * - 'rarity' mode: weighted pick of a rarity bucket, then a uniformly random
 *   prize item of that rarity. `prizePool` (the catalog) is required for this.
 */
export function pickGiftDrop(
  config: GiftConfigView,
  prizePool?: GiftPrize[],
): GiftPrize | null {
  if (config.dropMode === 'rarity') {
    const pool = (prizePool ?? []).filter((item) => item.slot !== 'container');
    // Only consider rarities that actually have prizes available.
    const candidates = config.rarityDrops
      .filter((entry) => entry.chance > 0 && pool.some((i) => i.rarity === entry.rarity))
      .map((entry) => ({ value: entry.rarity, weight: entry.chance }));
    const rarity = weightedPick(candidates);
    if (!rarity) return null;
    const items = pool.filter((item) => item.rarity === rarity);
    if (items.length === 0) return null;
    return items[Math.floor(Math.random() * items.length)];
  }

  const validDrops = config.drops.filter(
    (drop): drop is GiftDropView & { item: GiftPrize } =>
      !!drop.item && drop.chance > 0 && drop.item.slot !== 'container',
  );
  return weightedPick(validDrops.map((drop) => ({ value: drop.item, weight: drop.chance })));
}

/**
 * Resolve a gift config into a concrete per-item drop list (for display).
 * In 'rarity' mode each rarity weight is split evenly across every catalog
 * item of that rarity, so callers see the true per-item probability.
 */
export function expandGiftDrops(
  config: GiftConfigView,
  prizePool: GiftPrize[],
): GiftDropView[] {
  if (config.dropMode !== 'rarity') return config.drops;

  const pool = prizePool.filter((item) => item.slot !== 'container');
  const usable = config.rarityDrops.filter(
    (entry) => entry.chance > 0 && pool.some((i) => i.rarity === entry.rarity),
  );
  const totalWeight = usable.reduce((sum, entry) => sum + entry.chance, 0);
  if (totalWeight <= 0) return [];

  const result: GiftDropView[] = [];
  usable.forEach((entry) => {
    const items = pool.filter((item) => item.rarity === entry.rarity);
    if (items.length === 0) return;
    const perItem = entry.chance / totalWeight / items.length;
    items.forEach((item) =>
      result.push({ itemId: item.id, chance: perItem, kind: item.kind, item }),
    );
  });
  return result;
}
