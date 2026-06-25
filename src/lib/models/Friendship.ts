import mongoose, { Schema, type Model } from 'mongoose';

export type FriendshipSource = 'invite' | 'code' | 'qr';

export type FriendshipDoc = {
  _id: string;
  userA: string;
  userB: string;
  source: FriendshipSource;
  createdAt: Date;
};

const FriendshipSchema = new Schema<FriendshipDoc>(
  {
    userA: { type: String, required: true, index: true },
    userB: { type: String, required: true, index: true },
    source: {
      type: String,
      required: true,
      enum: ['invite', 'code', 'qr'],
      default: 'code',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'friendships' },
);

FriendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

if (mongoose.models.Friendship) {
  delete mongoose.models.Friendship;
}

const FriendshipModel: Model<FriendshipDoc> = mongoose.model<FriendshipDoc>(
  'Friendship',
  FriendshipSchema,
);

export default FriendshipModel;
