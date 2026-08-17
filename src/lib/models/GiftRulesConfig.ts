import mongoose, { Schema, type Model } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import {
  DEFAULT_GIFT_RULES,
  clampGiftRules,
  type GiftRules,
} from '@/lib/skins/giftRules';

export interface GiftRulesConfigDoc extends GiftRules {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GIFT_RULES_CONFIG_ID = 'gift-rules';

const GiftRulesConfigSchema = new Schema<GiftRulesConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    softPityLuck: { type: Number, default: DEFAULT_GIFT_RULES.softPityLuck },
    softPityBonusPoints: {
      type: Number,
      default: DEFAULT_GIFT_RULES.softPityBonusPoints,
    },
    hardPityLuck: { type: Number, default: DEFAULT_GIFT_RULES.hardPityLuck },
    epicPityLuck: { type: Number, default: DEFAULT_GIFT_RULES.epicPityLuck },
    backgroundSharePercent: {
      type: Number,
      default: DEFAULT_GIFT_RULES.backgroundSharePercent,
    },
    newFirstWeight: { type: Number, default: DEFAULT_GIFT_RULES.newFirstWeight },
    wishlistRedirectPercent: {
      type: Number,
      default: DEFAULT_GIFT_RULES.wishlistRedirectPercent,
    },
    tierBumpEnabled: {
      type: Boolean,
      default: DEFAULT_GIFT_RULES.tierBumpEnabled,
    },
  },
  {
    collection: 'giftRulesConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.GiftRulesConfig;
}

const GiftRulesConfigModel: Model<GiftRulesConfigDoc> =
  (mongoose.models.GiftRulesConfig as Model<GiftRulesConfigDoc>) ||
  mongoose.model<GiftRulesConfigDoc>('GiftRulesConfig', GiftRulesConfigSchema);

/**
 * Mongoose defaults only fire for new documents, so a config saved before a
 * field existed comes back with it undefined — clamping backfills on read.
 */
export async function ensureGiftRulesConfig(): Promise<GiftRules> {
  await connectMongo();
  const existing = await GiftRulesConfigModel.findOne({
    configId: GIFT_RULES_CONFIG_ID,
  }).lean();

  const resolved = clampGiftRules(existing ?? {});

  if (!existing) {
    await GiftRulesConfigModel.updateOne(
      { configId: GIFT_RULES_CONFIG_ID },
      { $set: { configId: GIFT_RULES_CONFIG_ID, ...resolved } },
      { upsert: true },
    ).catch(() => {});
  }

  return resolved;
}

export default GiftRulesConfigModel;
