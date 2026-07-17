import mongoose, { Schema, type Model } from 'mongoose';

export type FlyGameRunDoc = {
  _id: string;
  tokenHash: string;
  seed: number;
  ownerUserId?: string;
  playerName: string;
  score?: number;
  catches?: number;
  misses?: number;
  goldHits?: number;
  timeHits?: number;
  trapHits?: number;
  maxCombo?: number;
  durationMs?: number;
  verified: boolean;
  personalBest?: boolean;
  submittedAt?: Date;
  claimedBy?: string;
  claimedAt?: Date;
  rewardAmount?: number;
  expiresAt?: Date;
  createdAt: Date;
};

const FlyGameRunSchema = new Schema<FlyGameRunDoc>(
  {
    _id: { type: String, required: true },
    tokenHash: { type: String, required: true, select: false },
    seed: { type: Number, required: true, select: false },
    ownerUserId: { type: String, index: true, sparse: true },
    playerName: { type: String, default: 'Tiny Frog' },
    score: { type: Number, min: 0 },
    catches: { type: Number, min: 0 },
    misses: { type: Number, min: 0 },
    goldHits: { type: Number, min: 0 },
    timeHits: { type: Number, min: 0 },
    trapHits: { type: Number, min: 0 },
    maxCombo: { type: Number, min: 0 },
    durationMs: { type: Number, min: 0 },
    verified: { type: Boolean, default: false, index: true },
    personalBest: { type: Boolean, default: false },
    submittedAt: { type: Date, index: true },
    claimedBy: { type: String, index: true, sparse: true },
    claimedAt: Date,
    rewardAmount: { type: Number, min: 0 },
    expiresAt: { type: Date, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'flyGameRuns' },
);

FlyGameRunSchema.index({ verified: 1, score: -1, maxCombo: -1, submittedAt: 1 });

const FlyGameRunModel: Model<FlyGameRunDoc> =
  (mongoose.models.FlyGameRun as Model<FlyGameRunDoc> | undefined) ??
  mongoose.model<FlyGameRunDoc>('FlyGameRun', FlyGameRunSchema);

export default FlyGameRunModel;
