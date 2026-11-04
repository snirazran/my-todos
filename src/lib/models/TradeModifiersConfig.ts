import mongoose, { Schema, type Model } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import {
  DEFAULT_TRADE_MODIFIERS,
  DEFAULT_TRADE_RECIPES,
  TRADE_LADDER_VERSION,
  type TradeModifiers,
  type TradeRecipe,
} from '@/lib/skins/tradeModifiers';

export interface TradeModifiersConfigDoc extends TradeModifiers {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  ladderVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TRADE_MODIFIERS_CONFIG_ID = 'trade-modifiers';

const TradeModifiersConfigSchema = new Schema<TradeModifiersConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    ladderVersion: { type: Number, default: TRADE_LADDER_VERSION },
    recipes: { type: [Schema.Types.Mixed], default: DEFAULT_TRADE_RECIPES } as any,
    goldenTradeChancePercent: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.goldenTradeChancePercent,
    },
    goldenTradeRewardCount: {
      type: Number,
      default: DEFAULT_TRADE_MODIFIERS.goldenTradeRewardCount,
    },
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

export const clampTradeInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

export function sanitizeRecipes(raw: unknown): TradeRecipe[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TRADE_RECIPES;
  return DEFAULT_TRADE_RECIPES.map((fallback) => {
    const sent = (raw as any[]).find((entry) => entry?.from === fallback.from);
    return {
      from: fallback.from,
      to: fallback.to,
      itemCount: clampTradeInt(sent?.itemCount, 2, 12, fallback.itemCount),
    };
  });
}

export async function ensureTradeModifiersConfig(): Promise<TradeModifiers> {
  await connectMongo();
  const existing = await TradeModifiersConfigModel.findOne({
    configId: TRADE_MODIFIERS_CONFIG_ID,
  }).lean();

  const current = (existing?.ladderVersion ?? 1) >= TRADE_LADDER_VERSION;
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const resolved: TradeModifiers = {
    recipes: current ? sanitizeRecipes(existing?.recipes) : DEFAULT_TRADE_RECIPES,
    goldenTradeChancePercent: num(
      existing?.goldenTradeChancePercent,
      DEFAULT_TRADE_MODIFIERS.goldenTradeChancePercent,
    ),
    goldenTradeRewardCount: num(
      existing?.goldenTradeRewardCount,
      DEFAULT_TRADE_MODIFIERS.goldenTradeRewardCount,
    ),
    wishlistRedirectPercent: current
      ? num(
          existing?.wishlistRedirectPercent,
          DEFAULT_TRADE_MODIFIERS.wishlistRedirectPercent,
        )
      : DEFAULT_TRADE_MODIFIERS.wishlistRedirectPercent,
    wishlistSlotsFree: num(
      existing?.wishlistSlotsFree,
      DEFAULT_TRADE_MODIFIERS.wishlistSlotsFree,
    ),
    wishlistSlotsPlus: num(
      existing?.wishlistSlotsPlus,
      DEFAULT_TRADE_MODIFIERS.wishlistSlotsPlus,
    ),
  };

  if (!existing || !current) {
    await TradeModifiersConfigModel.collection
      .updateOne(
        { configId: TRADE_MODIFIERS_CONFIG_ID },
        {
          $set: {
            configId: TRADE_MODIFIERS_CONFIG_ID,
            ladderVersion: TRADE_LADDER_VERSION,
            ...resolved,
          },
          $unset: {
            allSparesFuelWaived: '',
            allSparesNewFirstWeight: '',
            plusFuelWaived: '',
            maxFuelWaived: '',
            aimPlusDiscountPercent: '',
            newFirstWeight: '',
          },
        },
        { upsert: true },
      )
      .catch(() => {});
  }

  return resolved;
}

export default TradeModifiersConfigModel;
