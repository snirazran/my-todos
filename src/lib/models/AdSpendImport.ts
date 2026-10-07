import mongoose, { Schema, type Model } from 'mongoose';
import type { SpendLevel } from '@/lib/attribution/spendImport';

export interface AdSpendImportDoc {
  _id: string;
  channel: string;
  level: SpendLevel;
  start: string;
  end: string;
  rows: number;
  spend: number;
  installs: number;
  taps: number;
  spread: boolean;
  label?: string;
  createdAt: Date;
}

const AdSpendImportSchema = new Schema<AdSpendImportDoc>(
  {
    _id: { type: String, required: true },
    channel: { type: String, required: true },
    level: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    rows: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    installs: { type: Number, default: 0 },
    taps: { type: Number, default: 0 },
    spread: { type: Boolean, default: false },
    label: { type: String, default: undefined },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'adSpendImports' },
);

const AdSpendImportModel: Model<AdSpendImportDoc> =
  (mongoose.models.AdSpendImport as Model<AdSpendImportDoc>) ||
  mongoose.model<AdSpendImportDoc>('AdSpendImport', AdSpendImportSchema);

export default AdSpendImportModel;
