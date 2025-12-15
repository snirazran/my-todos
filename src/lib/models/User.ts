// lib/models/User.ts
import mongoose, { Schema, type Model } from 'mongoose';
import type { UserDoc } from '@/lib/types/UserDoc';

export type { UserDoc };

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    wardrobe: {
      type: Schema.Types.Mixed,
      default: () => ({ equipped: {}, inventory: {}, flies: 0 }),
    },
    skins: { type: Schema.Types.Mixed },

    statistics: {
      daily: {
        date: { type: String, default: '' },
        dailyTasksCount: { type: Number, default: 0 },
        dailyMilestoneGifts: { type: Number, default: 0 },
        completedTaskIds: { type: [String], default: [] },
        // This is the new field that was missing
        taskCountAtLastGift: { type: Number, default: 0 },
      },
    },
  },
  { collection: 'users' }
);

// FIX: Delete the model if it exists to force a recompile with new fields
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const UserModel: Model<UserDoc> = mongoose.model<UserDoc>('User', UserSchema);

export default UserModel;
