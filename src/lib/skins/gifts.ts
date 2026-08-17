import CatalogItemModel from '@/lib/models/CatalogItem';
import GiftDropConfigModel from '@/lib/models/GiftDropConfig';
import BackgroundModel from '@/lib/models/Background';
import connectMongo from '@/lib/mongoose';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';
import { CATALOG, type ItemDef, type Rarity } from './catalog';
import { filterAvailable, isAvailableAt } from './availability';
import { getFullCatalog } from './getCatalog';
import {
  advanceGiftLuck,
  applyTierBump,
  luckPerReveal,
  pickGiftIdentity,
  rollGiftRarity,
  RECOMMENDED_RARITY_TABLES,
  type BandCandidate,
  type GiftLuckState,
  type GiftRules,
  type PityKind,
} from './giftRules';

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
  /** Luck this gift's reveal adds to the shared pity counter. */
  luckPerReveal: number;
};

function itemToDef(item: {
  id: string;
  name: string;
  slot: ItemDef['slot'];
  rarity: ItemDef['rarity'];
  riveIndex: number;
  icon?: string;
  priceFlies?: number;
  availableFrom?: Date | string | null;
  availableUntil?: Date | string | null;
}): ItemDef {
  const iso = (value: Date | string | null | undefined) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  return {
    id: item.id,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    riveIndex: item.riveIndex,
    icon: item.icon || '',
    priceFlies: item.priceFlies ?? 0,
    availableFrom: iso(item.availableFrom),
    availableUntil: iso(item.availableUntil),
  };
}

export async function loadBackgroundPrizes(): Promise<GiftPrize[]> {
  // The default scene is granted to everyone, so it must never be a prize —
  // winning something you already own by definition is a dud drop. This also
  // keeps it out of trade-up rewards, which draw from the same pool.
  const bgs = await BackgroundModel.find({
    hidden: { $ne: true },
    id: { $ne: DEFAULT_BACKGROUND_ID },
  }).lean();
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

/**
 * What a gift or trade-up may actually award right now: the prize pool minus
 * anything outside its availability window. Use `getPrizePool` instead when
 * resolving items a player already owns.
 */
export async function getRewardPool(now: Date = new Date()): Promise<GiftPrize[]> {
  return filterAvailable(await getPrizePool(), now);
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

/**
 * A new gift starts on the published ladder for its own tier, in rarity mode —
 * the bands are what the odds sheet quotes and what pity keys off, so a
 * hand-authored per-item table is the exception now, not the default.
 */
export function recommendedRarityDrops(giftRarity: Rarity): GiftRarityDrop[] {
  const table =
    RECOMMENDED_RARITY_TABLES[giftRarity] ?? RECOMMENDED_RARITY_TABLES.common;
  return GIFT_RARITIES.filter((rarity) => (table[rarity] ?? 0) > 0).map(
    (rarity) => ({ rarity, chance: table[rarity] }),
  );
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
        dropMode: 'rarity',
        drops: [],
        rarityDrops: recommendedRarityDrops(gift.rarity),
        luckPerReveal: luckPerReveal(undefined, gift.rarity),
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
      availableFrom: item.availableFrom,
      availableUntil: item.availableUntil,
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
        luckPerReveal: luckPerReveal(config?.luckPerReveal, gift.rarity),
      };
    });
}

export async function getGiftConfig(giftId: string): Promise<GiftConfigView | null> {
  const configs = await getGiftConfigs(false);
  return configs.find((config) => config.gift.id === giftId) ?? null;
}

/**
 * Split what a gift can award into rarity bands, plus the band weights the
 * rarity roll runs on.
 *
 * Both drop modes collapse to the same shape, which is what lets pity and the
 * duplicate rules apply to a hand-authored table too: in 'rarity' mode every
 * prize of a band is an equal candidate and the admin's rarity weights are the
 * band weights; in 'item' mode each configured prize keeps its own weight and
 * the band weight is their sum.
 */
function buildGiftBands(config: GiftConfigView, prizePool: GiftPrize[]) {
  const bands = new Map<Rarity, BandCandidate<GiftPrize>[]>();
  const push = (prize: GiftPrize, weight: number) => {
    const list = bands.get(prize.rarity) ?? [];
    list.push({ prize, weight });
    bands.set(prize.rarity, list);
  };

  if (config.dropMode === 'rarity') {
    prizePool
      .filter((prize) => prize.slot !== 'container' && isAvailableAt(prize))
      .forEach((prize) => push(prize, 1));
    const weights: Partial<Record<Rarity, number>> = {};
    config.rarityDrops.forEach((entry) => {
      if (entry.chance > 0) {
        weights[entry.rarity] = (weights[entry.rarity] ?? 0) + entry.chance;
      }
    });
    return { bands, weights, applyBackgroundShare: true };
  }

  config.drops.forEach((drop) => {
    if (!drop.item || drop.chance <= 0) return;
    if (drop.item.slot === 'container') return;
    if (!isAvailableAt(drop.item)) return;
    push(drop.item, drop.chance);
  });
  const weights: Partial<Record<Rarity, number>> = {};
  bands.forEach((list, rarity) => {
    weights[rarity] = list.reduce((sum, entry) => sum + entry.weight, 0);
  });
  return { bands, weights, applyBackgroundShare: false };
}

export type GiftRollResult = {
  prize: GiftPrize;
  /** Band the table landed on, before a tier bump. */
  rolledRarity: Rarity;
  /** Band the prize actually came from. */
  rarity: Rarity;
  pity: PityKind;
  bonusPoints: number;
  tierBumped: boolean;
  viaWishlist: boolean;
  /** The player already owned a copy — a spare, i.e. trade fuel. */
  duplicate: boolean;
  /** Counter state to persist after this reveal. */
  luck: GiftLuckState;
};

/**
 * One reveal, start to finish: roll a band under the shared Luck counter, bump
 * a completed low band one tier, then draw the identity under the wishlist,
 * background-share and new-first rules. Always returns a cosmetic — there is no
 * empty box and no fly consolation.
 */
export function rollGiftPrize({
  config,
  prizePool,
  rules,
  luck,
  owns,
  wishlistKeys,
}: {
  config: GiftConfigView;
  prizePool: GiftPrize[];
  rules: GiftRules;
  luck: GiftLuckState;
  owns: (prize: GiftPrize) => boolean;
  wishlistKeys: Set<string>;
}): GiftRollResult | null {
  const { bands, weights, applyBackgroundShare } = buildGiftBands(
    config,
    prizePool,
  );
  const hasAny = (rarity: Rarity) => (bands.get(rarity)?.length ?? 0) > 0;
  const hasUnowned = (rarity: Rarity) =>
    (bands.get(rarity) ?? []).some((candidate) => !owns(candidate.prize));

  const roll = rollGiftRarity({ weights, available: hasAny, luck, rules });
  if (!roll) return null;

  const rarity = applyTierBump({
    rarity: roll.rarity,
    rules,
    hasUnowned,
    hasAny,
  });
  const picked = pickGiftIdentity({
    candidates: bands.get(rarity) ?? [],
    owns,
    wishlistKeys,
    rules,
    applyBackgroundShare,
  });
  if (!picked) return null;

  return {
    prize: picked.prize,
    rolledRarity: roll.rarity,
    rarity,
    pity: roll.pity,
    bonusPoints: roll.bonusPoints,
    tierBumped: rarity !== roll.rarity,
    viaWishlist: picked.viaWishlist,
    duplicate: owns(picked.prize),
    luck: advanceGiftLuck({
      luck,
      rules,
      perReveal: config.luckPerReveal,
      resolved: rarity,
    }),
  };
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
  if (config.dropMode !== 'rarity') {
    return config.drops.filter((drop) => !drop.item || isAvailableAt(drop.item));
  }

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
