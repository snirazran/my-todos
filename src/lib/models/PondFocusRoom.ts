import mongoose, { Schema, type Model } from 'mongoose';

export type PondFocusMember = { userId: string; sessionId: string; joinedAt: Date; leftAt?: Date | null };
export type PondFocusRoomDoc = {
  id: string;
  hostId: string;
  duration: number;
  startedAt: Date;
  endsAt: Date;
  members: PondFocusMember[];
};

const schema = new Schema<PondFocusRoomDoc>({
  id: { type: String, required: true, unique: true },
  hostId: { type: String, required: true, index: true },
  duration: { type: Number, required: true },
  startedAt: { type: Date, required: true },
  endsAt: { type: Date, required: true, index: true },
  members: { type: [{ _id: false, userId: { type: String, required: true }, sessionId: { type: String, required: true }, joinedAt: { type: Date, required: true }, leftAt: { type: Date, default: null } }], default: [] },
}, { collection: 'pondfocusrooms' });
schema.index({ 'members.userId': 1, endsAt: -1 });

const PondFocusRoomModel: Model<PondFocusRoomDoc> =
  (mongoose.models.PondFocusRoom as Model<PondFocusRoomDoc>) || mongoose.model<PondFocusRoomDoc>('PondFocusRoom', schema);
export default PondFocusRoomModel;
