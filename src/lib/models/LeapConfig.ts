import mongoose, { Schema, type Model } from 'mongoose';
import type { LeapConfigView } from '@/lib/leap/types';
import { LEAP_CONFIG_VERSION, LEAP_DEFAULTS } from '@/lib/leap/defaults';

export {
  LEAP_CONFIG_ID,
  LEAP_CONFIG_VERSION,
  RETIRED_LEAGUE_LABELS,
  DEFAULT_LEAP_MARKS,
  DEFAULT_LEAP_FIRST_HOP_REWARDS,
  DEFAULT_LEAP_LEAGUES,
  DEFAULT_CHEST_FLIES,
  LEAP_DEFAULTS,
} from '@/lib/leap/defaults';

export interface LeapConfigDoc extends LeapConfigView {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  configVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const mixed = (fallback: unknown) =>
  ({ type: Schema.Types.Mixed, default: () => fallback }) as any;

const LeapConfigSchema = new Schema<LeapConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    configVersion: { type: Number, default: LEAP_CONFIG_VERSION },
    isActive: { type: Boolean, default: LEAP_DEFAULTS.isActive },
    firstHopRewards: mixed(LEAP_DEFAULTS.firstHopRewards),
    marks: mixed(LEAP_DEFAULTS.marks),
    leagues: mixed(LEAP_DEFAULTS.leagues),
  },
  {
    collection: 'leapConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.LeapConfig;
}

const LeapConfigModel: Model<LeapConfigDoc> =
  (mongoose.models.LeapConfig as Model<LeapConfigDoc>) ||
  mongoose.model<LeapConfigDoc>('LeapConfig', LeapConfigSchema);

export default LeapConfigModel;
