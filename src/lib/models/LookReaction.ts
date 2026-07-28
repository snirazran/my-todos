import mongoose, { Schema, type Model } from 'mongoose';
import {
  LOOK_REACTIONS,
  type LookReactionKind,
} from '@/lib/friends/lookReactions';

export type LookReactionDoc = {
  _id: string;
  fromUserId: string;
  toUserId: string;
  kind: LookReactionKind;
  /** Zoned day key (YYYY-MM-DD) of the recipient — one reaction per day. */
  dayKey: string;
  /** The item that was on the frog when reacted to, for "they liked your X". */
  itemId?: string | null;
  itemName?: string | null;
  seen: boolean;
  createdAt: Date;
};

const LookReactionSchema = new Schema<LookReactionDoc>(
  {
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: LOOK_REACTIONS,
      default: 'fire',
    },
    dayKey: { type: String, required: true },
    itemId: { type: String, default: null },
    itemName: { type: String, default: null },
    seen: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'lookreactions' },
);

// One reaction per sender, per recipient, per day — a friend cannot spam.
LookReactionSchema.index(
  { fromUserId: 1, toUserId: 1, dayKey: 1 },
  { unique: true },
);
LookReactionSchema.index({ toUserId: 1, seen: 1, createdAt: -1 });

if (mongoose.models.LookReaction) {
  delete mongoose.models.LookReaction;
}

const LookReactionModel: Model<LookReactionDoc> =
  mongoose.model<LookReactionDoc>('LookReaction', LookReactionSchema);

export default LookReactionModel;
