import mongoose, { Schema, type Model } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import {
  DEFAULT_SHOP_SALES,
  SHOP_LAYOUT_VERSION,
  SHOP_TIERS,
  type ShopSalesConfig,
} from '@/lib/skins/shopSales';
import type { Rarity } from '@/lib/skins/catalog';

export interface ShopSalesConfigDoc extends ShopSalesConfig {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SHOP_SALES_CONFIG_ID = 'shop-sales';

const LEGACY_FIELDS = [
  'slots',
  'affordableSlots',
  'commonWeightPercent',
  'rareSlots',
  'epicSlots',
  'wishlistDealChancePercent',
  'discountedSlots',
  'weekendDay',
  'weekendDiscountedSlots',
  'weekendDiscountPercent',
  'rarityDiscountPercent',
  'raritySaleDaysPercent',
  'maxDiscountPercent',
  'plusRerolls',
] as const;

const ShopSalesConfigSchema = new Schema<ShopSalesConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    layoutVersion: { type: Number, default: SHOP_LAYOUT_VERSION },
    refreshHour: { type: Number, default: DEFAULT_SHOP_SALES.refreshHour },
    freeSlots: { type: Number, default: DEFAULT_SHOP_SALES.freeSlots },
    plusSlots: { type: Number, default: DEFAULT_SHOP_SALES.plusSlots },
    specialEpicPercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.specialEpicPercent,
    },
    plusEpicPercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.plusEpicPercent,
    },
    everydayRarities: {
      type: [String],
      default: () => [...DEFAULT_SHOP_SALES.everydayRarities],
    },
    everydayRarePercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.everydayRarePercent,
    },
    wishlistSlot: { type: Boolean, default: DEFAULT_SHOP_SALES.wishlistSlot },
    saleDiscountPercent: {
      type: Number,
      default: DEFAULT_SHOP_SALES.saleDiscountPercent,
    },
    freeRerolls: { type: Number, default: DEFAULT_SHOP_SALES.freeRerolls },
    plusRefreshes: { type: Number, default: DEFAULT_SHOP_SALES.plusRefreshes },
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

function rarityList(value: unknown, fallback: Rarity[]): Rarity[] {
  if (!Array.isArray(value)) return [...fallback];
  return SHOP_TIERS.filter((rarity) => value.includes(rarity));
}

export function sanitizeShopSales(
  raw: Partial<ShopSalesConfig> | null | undefined,
): ShopSalesConfig {
  const source = raw ?? {};
  return {
    layoutVersion: SHOP_LAYOUT_VERSION,
    refreshHour: num(source.refreshHour, DEFAULT_SHOP_SALES.refreshHour, 0, 23),
    freeSlots: num(source.freeSlots, DEFAULT_SHOP_SALES.freeSlots, 1, 12),
    plusSlots: num(source.plusSlots, DEFAULT_SHOP_SALES.plusSlots, 0, 12),
    specialEpicPercent: num(
      source.specialEpicPercent,
      DEFAULT_SHOP_SALES.specialEpicPercent,
      0,
      100,
    ),
    plusEpicPercent: num(
      source.plusEpicPercent,
      DEFAULT_SHOP_SALES.plusEpicPercent,
      0,
      100,
    ),
    everydayRarities: rarityList(
      source.everydayRarities,
      DEFAULT_SHOP_SALES.everydayRarities,
    ),
    everydayRarePercent: num(
      source.everydayRarePercent,
      DEFAULT_SHOP_SALES.everydayRarePercent,
      0,
      100,
    ),
    wishlistSlot:
      typeof source.wishlistSlot === 'boolean'
        ? source.wishlistSlot
        : DEFAULT_SHOP_SALES.wishlistSlot,
    saleDiscountPercent: num(
      source.saleDiscountPercent,
      DEFAULT_SHOP_SALES.saleDiscountPercent,
      0,
      90,
    ),
    freeRerolls: num(source.freeRerolls, DEFAULT_SHOP_SALES.freeRerolls, 0, 10),
    plusRefreshes: num(source.plusRefreshes, DEFAULT_SHOP_SALES.plusRefreshes, 0, 10),
    adRerolls: num(source.adRerolls, DEFAULT_SHOP_SALES.adRerolls, 0, 10),
  };
}

export async function ensureShopSalesConfig(): Promise<ShopSalesConfig> {
  await connectMongo();
  const existing = (await ShopSalesConfigModel.findOne({
    configId: SHOP_SALES_CONFIG_ID,
  }).lean()) as Partial<ShopSalesConfig> | null;

  const outdated = (existing?.layoutVersion ?? 0) < SHOP_LAYOUT_VERSION;
  const resolved = sanitizeShopSales(
    outdated
      ? {
          refreshHour: existing?.refreshHour,
          wishlistSlot: existing?.wishlistSlot,
          freeRerolls: existing?.freeRerolls,
          plusRefreshes: existing?.plusRefreshes,
          adRerolls: existing?.adRerolls,
        }
      : existing,
  );

  if (!existing || outdated) {
    await ShopSalesConfigModel.updateOne(
      { configId: SHOP_SALES_CONFIG_ID },
      {
        $set: { configId: SHOP_SALES_CONFIG_ID, ...resolved },
        ...(existing
          ? { $unset: Object.fromEntries(LEGACY_FIELDS.map((field) => [field, 1])) }
          : {}),
      },
      { upsert: true, strict: false },
    ).catch(() => {});
  }

  return resolved;
}

export default ShopSalesConfigModel;
