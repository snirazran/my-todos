import mongoose, { Schema, type Model } from 'mongoose';

export interface ShieldConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  priceFlies: number;
  twoPackPriceFlies: number;
  capFree: number;
  capPlus: number;
  plusMonthlyGrant: number;
  rescueCooldownDays: number;
  offerCooldownDays: number;
  offerMinStreak: number;
  earnEveryPactWeeks: number;
  /** Which defaults this doc was written against. Bumping re-seeds a field. */
  configVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export const SHIELD_CONFIG_ID = 'shields';

export const CAP_MIN = 1;
export const CAP_MAX = 5;

/**
 * v2 retires the every-other-kept-week auto-grant. The pact ladder issues Lily
 * Pads at its 7-week milestone and again at every prestige, and against a
 * holding cap of 2 a second faucet only oversupplies — a player who never runs
 * out has nothing to buy and nothing to lose.
 */
export const SHIELD_CONFIG_VERSION = 2;

export const SHIELD_DEFAULTS = {
  isActive: true,
  priceFlies: 350,
  twoPackPriceFlies: 600,
  capFree: 2,
  capPlus: 3,
  plusMonthlyGrant: 1,
  rescueCooldownDays: 14,
  offerCooldownDays: 7,
  offerMinStreak: 3,
  earnEveryPactWeeks: 0,
} as const;

const ShieldConfigSchema = new Schema<ShieldConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: SHIELD_DEFAULTS.isActive },
    priceFlies: { type: Number, default: SHIELD_DEFAULTS.priceFlies },
    twoPackPriceFlies: {
      type: Number,
      default: SHIELD_DEFAULTS.twoPackPriceFlies,
    },
    capFree: { type: Number, default: SHIELD_DEFAULTS.capFree },
    capPlus: { type: Number, default: SHIELD_DEFAULTS.capPlus },
    plusMonthlyGrant: {
      type: Number,
      default: SHIELD_DEFAULTS.plusMonthlyGrant,
    },
    rescueCooldownDays: {
      type: Number,
      default: SHIELD_DEFAULTS.rescueCooldownDays,
    },
    offerCooldownDays: {
      type: Number,
      default: SHIELD_DEFAULTS.offerCooldownDays,
    },
    offerMinStreak: { type: Number, default: SHIELD_DEFAULTS.offerMinStreak },
    earnEveryPactWeeks: {
      type: Number,
      default: SHIELD_DEFAULTS.earnEveryPactWeeks,
    },
    configVersion: { type: Number, default: SHIELD_CONFIG_VERSION },
  },
  {
    collection: 'shieldConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ShieldConfig;
}

const ShieldConfigModel: Model<ShieldConfigDoc> =
  (mongoose.models.ShieldConfig as Model<ShieldConfigDoc>) ||
  mongoose.model<ShieldConfigDoc>('ShieldConfig', ShieldConfigSchema);

export default ShieldConfigModel;
