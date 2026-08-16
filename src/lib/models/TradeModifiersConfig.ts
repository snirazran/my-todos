import mongoose, { Schema, type Model } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import {
  DEFAULT_TRADE_MODIFIERS,
  DEFAULT_TRADE_RECIPES,
  type TradeModifiers,
  type TradeRecipe,
} from '@/lib/skins/tradeModifiers';
import { RARITY_ORDER, type Rarity } from '@/lib/skins/catalog';

export interface TradeModifiersConfigDoc extends TradeModifiers {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const TRADE_MODIFIERS_CONFIG_ID = 'trade-modifiers';

const TradeModifiersConfigSchema = new Schema<TradeModifiersConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    recipes: { type: [Schema.Types.Mixed], default: DEFAULT_TRADE_RECIPES } as any,
    allSparesFuelWaived: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.allSparesFuelWaived,
    },
    allSparesNewFirstWeight: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.allSparesNewFirstWeight,
    },
    plusFuelWaived: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.plusFuelWaived,
    },
    maxFuelWaived: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.maxFuelWaived,
    },
    aimPlusDiscountPercent: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.aimPlusDiscountPercent,
    },
    goldenTradeChancePercent: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.goldenTradeChancePercent,
    },
    goldenTradeRewardCount: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.goldenTradeRewardCount,
    },
    newFirstWeight: { type: Number, default: DEFAULT_TRADE_MODIFIERS.newFirstWeight },
    wishlistRedirectPercent: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.wishlistRedirectPercent,
    },
    wishlistSlotsFree: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.wishlistSlotsFree,
    },
    wishlistSlotsPlus: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.wishlistSlotsPlus,
    },
  },
  {
    collection: 'tradeModifiersConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.TradeModifiersConfig;
}

const TradeModifiersConfigModel: Model<TradeModifiersConfigDoc> =
  (mongoose.models.TradeModifiersConfig as Model<TradeModifiersConfigDoc>) ||
  mongoose.model<TradeModifiersConfigDoc>(
    'TradeModifiersConfig',
    TradeModifiersConfigSchema,
  );

/**
 * Fuel has to come from below the recipe's own tier, or a trade could ask for
 * inputs that cost more than the thing it hands back.
 */
export function sanitizeFuelRarity(
  raw: unknown,
  from: Rarity,
  fallback: Rarity | null,
): Rarity | null {
  if (raw === null || raw === '' || raw === undefined) return null;
  const value = String(raw) as Rarity;
  const index = RARITY_ORDER.indexOf(value);
  if (index < 0 || index >= RARITY_ORDER.indexOf(from)) return fallback;
  return value;
}

function sanitizeRecipes(raw: unknown): TradeRecipe[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TRADE_RECIPES;
  // A fee-era row carries no aim price. Its item counts were balanced against a
  // fly fee that no longer exists, so the whole set is re-seeded rather than
  // half-migrated into a ladder that undercuts the shop.
  const legacy = (raw as any[]).some(
    (entry) => entry && entry.aimPriceFlies === undefined,
  );
  if (legacy) return DEFAULT_TRADE_RECIPES;
  const byFrom = new Map<string, TradeRecipe>();
  for (const entry of raw as any[]) {
    const fallback = DEFAULT_TRADE_RECIPES.find((r) => r.from === entry?.from);
    if (!fallback) continue;
    const int = (value: unknown, min: number, max: number, fallbackValue: number) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallbackValue;
      return Math.min(max, Math.max(min, Math.floor(n)));
    };
    const fuelRarity = sanitizeFuelRarity(
      entry?.fuelRarity,
      fallback.from,
      fallback.fuelRarity,
    );
    byFrom.set(fallback.from, {
      from: fallback.from,
      to: fallback.to,
      itemCount: int(entry?.itemCount, 2, 12, fallback.itemCount),
      fuelRarity,
      fuelCount: fuelRarity ? int(entry?.fuelCount, 0, 12, fallback.fuelCount) : 0,
      aimPriceFlies: int(entry?.aimPriceFlies, 0, 100000, fallback.aimPriceFlies),
    });
  }
  return DEFAULT_TRADE_RECIPES.map((fallback) => byFrom.get(fallback.from) ?? fallback);
}

/**
 * Mongoose defaults only fire for new documents, so a config saved before a
 * field existed comes back with it undefined — backfill on read.
 */
export async function ensureTradeModifiersConfig(): Promise<TradeModifiers> {
  await connectMongo();
  const existing = await TradeModifiersConfigModel.findOne({
    configId: TRADE_MODIFIERS_CONFIG_ID,
  }).lean();

  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const resolved: TradeModifiers = {
    recipes: sanitizeRecipes(existing?.recipes),
    allSparesFuelWaived: num(
      existing?.allSparesFuelWaived,
      DEFAULT_TRADE_MODIFIERS.allSparesFuelWaived,
    ),
    allSparesNewFirstWeight: num(
      existing?.allSparesNewFirstWeight,
      DEFAULT_TRADE_MODIFIERS.allSparesNewFirstWeight,
    ),
    plusFuelWaived: num(
      existing?.plusFuelWaived,
      DEFAULT_TRADE_MODIFIERS.plusFuelWaived,
    ),
    maxFuelWaived: num(
      existing?.maxFuelWaived,
      DEFAULT_TRADE_MODIFIERS.maxFuelWaived,
    ),
    aimPlusDiscountPercent: num(
      existing?.aimPlusDiscountPercent,
      DEFAULT_TRADE_MODIFIERS.aimPlusDiscountPercent,
    ),
    goldenTradeChancePercent: num(
      existing?.goldenTradeChancePercent,
      DEFAULT_TRADE_MODIFIERS.goldenTradeChancePercent,
    ),
    goldenTradeRewardCount: num(
      existing?.goldenTradeRewardCount,
      DEFAULT_TRADE_MODIFIERS.goldenTradeRewardCount,
    ),
    newFirstWeight: num(existing?.newFirstWeight, DEFAULT_TRADE_MODIFIERS.newFirstWeight),
    wishlistRedirectPercent: num(
      existing?.wishlistRedirectPercent,
      DEFAULT_TRADE_MODIFIERS.wishlistRedirectPercent,
    ),
    wishlistSlotsFree: num(
      existing?.wishlistSlotsFree,
      DEFAULT_TRADE_MODIFIERS.wishlistSlotsFree,
    ),
    wishlistSlotsPlus: num(
      existing?.wishlistSlotsPlus,
      DEFAULT_TRADE_MODIFIERS.wishlistSlotsPlus,
    ),
  };

  if (!existing) {
    await TradeModifiersConfigModel.updateOne(
      { configId: TRADE_MODIFIERS_CONFIG_ID },
      { $set: { configId: TRADE_MODIFIERS_CONFIG_ID, ...resolved } },
      { upsert: true },
    ).catch(() => {});
  }

  return resolved;
}

export default TradeModifiersConfigModel;
