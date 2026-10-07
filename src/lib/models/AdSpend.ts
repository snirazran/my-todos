import mongoose, { Schema, type Model } from 'mongoose';
import type { SpendLevel } from '@/lib/attribution/spendImport';

export interface AdSpendDoc {
  batchId: string;
  channel: string;
  level: SpendLevel;
  date: string;
  campaign: string;
  adGroup?: string;
  keyword?: string;
  campaignKey: string;
  adGroupKey?: string;
  keywordKey?: string;
  spend: number;
  impressions: number;
  taps: number;
  installs: number;
  spread: boolean;
  importedAt: Date;
}

const AdSpendSchema = new Schema<AdSpendDoc>(
  {
    batchId: { type: String, required: true, index: true },
    channel: { type: String, required: true },
    level: { type: String, required: true },
    date: { type: String, required: true },
    campaign: { type: String, required: true },
    adGroup: { type: String, default: undefined },
    keyword: { type: String, default: undefined },
    campaignKey: { type: String, required: true },
    adGroupKey: { type: String, default: undefined },
    keywordKey: { type: String, default: undefined },
    spend: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    taps: { type: Number, default: 0 },
    installs: { type: Number, default: 0 },
    spread: { type: Boolean, default: false },
    importedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'adSpend' },
);

AdSpendSchema.index({ channel: 1, level: 1, date: 1 });

const AdSpendModel: Model<AdSpendDoc> =
  (mongoose.models.AdSpend as Model<AdSpendDoc>) ||
  mongoose.model<AdSpendDoc>('AdSpend', AdSpendSchema);

export default AdSpendModel;
