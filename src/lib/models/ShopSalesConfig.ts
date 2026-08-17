import mongoose, { Schema, type Model } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import {
  DEFAULT_SHOP_SALES,
  type ShopSalesConfig,
} from '@/lib/skins/shopSales';
import { RARITY_ORDER, type Rarity } from '@/lib/skins/catalog';

export interface ShopSalesConfigDoc extends ShopSalesConfig {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SHOP_SALES_CONFIG_ID = 'shop-sales';

const ShopSalesConfigSchema = new Schema<ShopSalesConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    slots: { type: Number, default: DEFAULT_SHOP_SALES.slots },
    refreshHour: { type: Number, default: DEFAULT_SHOP_SALES.refreshHour },
    affordableSlots: {
      type: Number,
      default: DEFAULT_SHOP_SALES.affordableSlots,
    },
    commonWeightPercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.commonWeightPercent,
    },
    rareSlots: { type: Number, default: DEFAULT_SHOP_SALES.rareSlots },
    epicSlots: { type: Number, default: DEFAULT_SHOP_SALES.epicSlots },
    wishlistSlot: { type: Boolean, default: DEFAULT_SHOP_SALES.wishlistSlot },
    wishlistDealChancePercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.wishlistDealChancePercent,
    },
    discountedSlots: {
      type: Number,
      default: DEFAULT_SHOP_SALES.discountedSlots,
    },
    weekendDay: { type: Number, default: DEFAULT_SHOP_SALES.weekendDay },
    weekendDiscountedSlots: {
      type: Number,
      default: DEFAULT_SHOP_SALES.weekendDiscountedSlots,
    },
    weekendDiscountPercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.weekendDiscountPercent,
    },
    rarityDiscountPercent: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_SHOP_SALES.rarityDiscountPercent }),
    } as any,
    raritySaleDaysPercent: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_SHOP_SALES.raritySaleDaysPercent }),
    } as any,
    maxDiscountPercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.maxDiscountPercent,
    },
    plusRerolls: { type: Number, default: DEFAULT_SHOP_SALES.plusRerolls },
    adRerolls: { type: Number, default: DEFAULT_SHOP_SALES.adRerolls },
  },
  {
    collection: 'shopSalesConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ShopSalesConfig;
}

const ShopSalesConfigModel: Model<ShopSalesConfigDoc> =
  (mongoose.models.ShopSalesConfig as Model<ShopSalesConfigDoc>) ||
  mongoose.model<ShopSalesConfigDoc>('ShopSalesConfig', ShopSalesConfigSchema);

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeRarityMap(
  raw: unknown,
  fallback: Record<Rarity, number>,
): Record<Rarity, number> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<Rarity, number>;
  for (const rarity of RARITY_ORDER) {
    out[rarity] = num(source[rarity], fallback[rarity], 0, 100);
  }
  return out;
}

export function sanitizeShopSales(raw: Partial<ShopSalesConfig> | null | undefined) {
  const source = raw ?? {};
  return {
    slots: num(source.slots, DEFAULT_SHOP_SALES.slots, 1, 12),
    refreshHour: num(source.refreshHour, DEFAULT_SHOP_SALES.refreshHour, 0, 23),
    affordableSlots: num(
      source.affordableSlots,
      DEFAULT_SHOP_SALES.affordableSlots,
      0,
      12,
    ),
    commonWeightPercent: num(
      source.commonWeightPercent,
      DEFAULT_SHOP_SALES.commonWeightPercent,
      0,
      100,
    ),
    rareSlots: num(source.rareSlots, DEFAULT_SHOP_SALES.rareSlots, 0, 12),
    epicSlots: num(source.epicSlots, DEFAULT_SHOP_SALES.epicSlots, 0, 12),
    wishlistSlot:
      typeof source.wishlistSlot === 'boolean'
        ? source.wishlistSlot
        : DEFAULT_SHOP_SALES.wishlistSlot,
    wishlistDealChancePercent: num(
      source.wishlistDealChancePercent,
      DEFAULT_SHOP_SALES.wishlistDealChancePercent,
      0,
      100,
    ),
    discountedSlots: num(
      source.discountedSlots,
      DEFAULT_SHOP_SALES.discountedSlots,
      0,
      12,
    ),
    weekendDay: num(source.weekendDay, DEFAULT_SHOP_SALES.weekendDay, 0, 6),
    weekendDiscountedSlots: num(
      source.weekendDiscountedSlots,
      DEFAULT_SHOP_SALES.weekendDiscountedSlots,
      0,
      12,
    ),
    weekendDiscountPercent: num(
      source.weekendDiscountPercent,
      DEFAULT_SHOP_SALES.weekendDiscountPercent,
      0,
      90,
    ),
    rarityDiscountPercent: sanitizeRarityMap(
      source.rarityDiscountPercent,
      DEFAULT_SHOP_SALES.rarityDiscountPercent,
    ),
    raritySaleDaysPercent: sanitizeRarityMap(
      source.raritySaleDaysPercent,
      DEFAULT_SHOP_SALES.raritySaleDaysPercent,
    ),
    maxDiscountPercent: num(
      source.maxDiscountPercent,
      DEFAULT_SHOP_SALES.maxDiscountPercent,
      0,
      90,
    ),
    plusRerolls: num(source.plusRerolls, DEFAULT_SHOP_SALES.plusRerolls, 0, 10),
    adRerolls: num(source.adRerolls, DEFAULT_SHOP_SALES.adRerolls, 0, 10),
  } satisfies ShopSalesConfig;
}

/**
 * Mongoose defaults only fire for new documents, so a config saved before a
 * field existed comes back with it undefined — backfill on read.
 */
export async function ensureShopSalesConfig(): Promise<ShopSalesConfig> {
  await connectMongo();
  const existing = (await ShopSalesConfigModel.findOne({
    configId: SHOP_SALES_CONFIG_ID,
  }).lean()) as Partial<ShopSalesConfig> | null;

  const resolved = sanitizeShopSales(existing);

  if (!existing) {
    await ShopSalesConfigModel.updateOne(
      { configId: SHOP_SALES_CONFIG_ID },
      { $set: { configId: SHOP_SALES_CONFIG_ID, ...resolved } },
      { upsert: true },
    ).catch(() => {});
  }

  return resolved;
}

export default ShopSalesConfigModel;
