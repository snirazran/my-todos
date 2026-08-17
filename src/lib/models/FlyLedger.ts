import mongoose, { Schema, type Model } from 'mongoose';

export type FlyLedgerMovement = {
  at: Date;
  delta: number;
  balanceAfter?: number;
};

export interface FlyLedgerDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  source: string;
  /** Stable identity of the thing being paid for, unique within its source. */
  occurrenceKey: string;
  /** Net flies this occurrence has paid so far — signed; spends are negative. */
  amount: number;
  /** User-local day the flies actually moved, which is what caps count. */
  dayKey: string;
  meta?: Record<string, unknown>;
  movements: FlyLedgerMovement[];
  createdAt: Date;
  updatedAt: Date;
}

const FlyLedgerSchema = new Schema<FlyLedgerDoc>(
  {
    userId: { type: String, required: true },
    source: { type: String, required: true },
    occurrenceKey: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 },
    dayKey: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
    movements: {
      type: [
        new Schema<FlyLedgerMovement>(
          {
            at: { type: Date, required: true },
            delta: { type: Number, required: true },
            balanceAfter: { type: Number },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  {
    collection: 'flyLedger',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

FlyLedgerSchema.index(
  { userId: 1, source: 1, occurrenceKey: 1 },
  { unique: true },
);
FlyLedgerSchema.index({ userId: 1, dayKey: 1 });
FlyLedgerSchema.index({ createdAt: -1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.FlyLedger;
}

const FlyLedgerModel: Model<FlyLedgerDoc> =
  (mongoose.models.FlyLedger as Model<FlyLedgerDoc>) ||
  mongoose.model<FlyLedgerDoc>('FlyLedger', FlyLedgerSchema);

export default FlyLedgerModel;
