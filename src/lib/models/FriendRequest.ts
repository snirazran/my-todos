import mongoose, { Schema, type Model } from 'mongoose';

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export type FriendRequestSource = 'code' | 'qr' | 'link';

export type FriendRequestDoc = {
  _id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  source: FriendRequestSource;
  createdAt: Date;
  respondedAt?: Date | null;
};

const FriendRequestSchema = new Schema<FriendRequestDoc>(
  {
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['code', 'qr', 'link'],
      default: 'code',
    },
    createdAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
  },
  { collection: 'friendrequests' },
);

FriendRequestSchema.index(
  { fromUserId: 1, toUserId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

if (mongoose.models.FriendRequest) {
  delete mongoose.models.FriendRequest;
}

const FriendRequestModel: Model<FriendRequestDoc> =
  mongoose.model<FriendRequestDoc>('FriendRequest', FriendRequestSchema);

export default FriendRequestModel;
