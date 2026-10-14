import mongoose, { Schema, type Model } from 'mongoose';
import type { LeapMarkId, LeapWeekOutcome } from '@/lib/leap/types';

export interface LeapWeekDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  weekKey: string;
  multiplier: number;
  league?: number;
  hopKeys: string[];
  hopsPaidByDay: Record<string, number>;
  luckyByDay: Record<string, number>;
  comebacksByDay: Record<string, number>;
  marks: LeapMarkId[];
  scheduledCap?: number;
  fliesGranted: number;
  grantedItemIds: string[];
  scheduled?: number;
  hops?: number;
  activeDays?: number;
  outcome?: LeapWeekOutcome;
  leagueAfter?: number;
  settledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LeapWeekSchema = new Schema<LeapWeekDoc>(
  {
    userId: { type: String, required: true, index: true },
    weekKey: { type: String, required: true },
    multiplier: { type: Number, default: 1 },
    league: { type: Number },
    hopKeys: { type: [String], default: [] },
    hopsPaidByDay: { type: Schema.Types.Mixed, default: () => ({}) },
    luckyByDay: { type: Schema.Types.Mixed, default: () => ({}) },
    comebacksByDay: { type: Schema.Types.Mixed, default: () => ({}) },
    marks: { type: [String], default: [] },
    scheduledCap: { type: Number },
    fliesGranted: { type: Number, default: 0 },
    grantedItemIds: { type: [String], default: [] },
    scheduled: { type: Number },
    hops: { type: Number },
    activeDays: { type: Number },
    outcome: { type: String },
    leagueAfter: { type: Number },
    settledAt: { type: Date, default: null },
  },
  {
    collection: 'leapWeeks',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

LeapWeekSchema.index({ userId: 1, weekKey: 1 }, { unique: true });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.LeapWeek;
}

const LeapWeekModel: Model<LeapWeekDoc> =
  (mongoose.models.LeapWeek as Model<LeapWeekDoc>) ||
  mongoose.model<LeapWeekDoc>('LeapWeek', LeapWeekSchema);

export default LeapWeekModel;
