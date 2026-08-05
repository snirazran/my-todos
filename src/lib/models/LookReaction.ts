import mongoose, { Schema, type Model } from 'mongoose';
import {
  LOOK_REACTIONS,
  type LookItem,
  type LookReactionKind,
} from '@/lib/friends/lookReactions';
import type { FrogIndices } from '@/lib/friends/indices';

export type LookReactionDoc = {
  _id: string;
  fromUserId: string;
  toUserId: string;
  kind: LookReactionKind;
  /** Zoned day key (YYYY-MM-DD) of the sender — one reaction per day. */
  dayKey: string;
  /** Signature of the whole outfit that was on the frog when reacted to. */
  lookKey?: string | null;
  /** Rive indices of that outfit, so the look can be re-rendered later. */
  lookIndices?: FrogIndices | null;
  /** Catalog names of every worn piece, for "wearing X · Y · Z". */
  lookItems?: LookItem[];
  seen: boolean;
  createdAt: Date;
};

const LookItemSchema = new Schema<LookItem>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    rarity: { type: String, required: true },
  },
  { _id: false },
);

const LookIndicesSchema = new Schema<FrogIndices>(
  {
    skin: { type: Number, default: 0 },
    hat: { type: Number, default: 0 },
    body: { type: Number, default: 0 },
    hand_item: { type: Number, default: 0 },
  },
  { _id: false },
);

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
    lookKey: { type: String, default: null },
    lookIndices: { type: LookIndicesSchema, default: null },
    lookItems: { type: [LookItemSchema], default: [] },
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
