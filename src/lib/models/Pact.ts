import mongoose, { Schema, type Model } from 'mongoose';
import type { PactStatus } from '@/lib/pact/types';

export interface PactDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  pactId: string;
  weekKey: string;
  categoryId: string;
  status: PactStatus;
  commitmentText: string;
  suggestionId?: string;
  days: number[];
  startTime: string;
  target: number;
  progress: number;
  taskIds: string[];
  /** Sessions already paid for. The ledger the per-session grant reconciles against. */
  paidSessions: number;
  /** The comeback bonus is once a week, so it needs its own latch. */
  comebackPaid: boolean;
  /**
   * Sessions kept on tasks that no longer exist. Deleting a task you already
   * ticked must never un-do the work — the count moves here so the ledger,
   * which can only read live tasks, still sees it.
   */
  bankedProgress: number;
  /** The area tag stamped on this pact's tasks. */
  tagId?: string;
  source: 'library' | 'generated' | 'repeat' | 'custom';
  shieldUsed: boolean;
  /** This pact's position in the streak, written when the week settles. */
  streakWeek?: number;
  areaWeek?: number;
  swappedFrom?: string;
  completedAt?: Date | null;
  claimedAt?: Date | null;
  settledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PactSchema = new Schema<PactDoc>(
  {
    userId: { type: String, required: true, index: true },
    pactId: { type: String, required: true },
    weekKey: { type: String, required: true },
    categoryId: { type: String, required: true },
    status: { type: String, default: 'active' },
    commitmentText: { type: String, required: true },
    suggestionId: { type: String, default: undefined },
    days: { type: [Number], default: [] },
    startTime: { type: String, default: '' },
    target: { type: Number, default: 1 },
    progress: { type: Number, default: 0 },
    taskIds: { type: [String], default: [] },
    paidSessions: { type: Number, default: 0 },
    comebackPaid: { type: Boolean, default: false },
    bankedProgress: { type: Number, default: 0 },
    tagId: { type: String },
    source: { type: String, default: 'library' },
    shieldUsed: { type: Boolean, default: false },
    streakWeek: { type: Number, default: undefined },
    areaWeek: { type: Number, default: undefined },
    swappedFrom: { type: String, default: undefined },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },
  },
  {
    collection: 'pacts',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

PactSchema.index({ userId: 1, weekKey: 1 }, { unique: true });
PactSchema.index({ userId: 1, categoryId: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Pact;
}

const PactModel: Model<PactDoc> =
  (mongoose.models.Pact as Model<PactDoc>) ||
  mongoose.model<PactDoc>('Pact', PactSchema);

export default PactModel;
