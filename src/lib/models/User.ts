// lib/models/User.ts
import mongoose, { Schema, type Model } from 'mongoose';
import type { UserDoc } from '@/lib/types/UserDoc';

export type { UserDoc };

const UserSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    frogName: { type: String, default: 'Cookie' },
    birthday: { type: String },
    ageRange: { type: String },
    aboutGender: { type: String },
    usedBefore: { type: String },
    onboardingResponses: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    email: { type: String, required: false, lowercase: true, index: true, sparse: true },
    passwordHash: { type: String, required: false },
    phoneNumber: { type: String, required: false, index: true, sparse: true },
    isGuest: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    wardrobe: {
      type: Schema.Types.Mixed,
      default: () => ({
        equipped: {},
        inventory: {},
        unseenItems: [],
        flies: 0,
        hunger: 86400000, // Start full (24h)
        lastHungerUpdate: new Date(),
        stolenFlies: 0,
      }),
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
    tags: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          color: { type: String, required: true },
        },
      ],
      default: [],
    },
    premiumUntil: { type: Date },
    focusProfile: {
      type: Schema.Types.Mixed,
      default: () => ({
        selectedCategoryIds: [],
        categoryTagMap: [],
        unlockedAnimationIds: [],
      }),
    },
    quests: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    dailyRewards: {
      lastClaimDate: { type: Date },
      claimedDays: { type: [Number], default: [] },
      month: { type: String }, // Format YYYY-MM
      streak: { type: Number, default: 0 },
    },
    missedReview: {
      lastShownDate: { type: String, default: '' },
    },
    notificationPrefs: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    calendarSyncEnabled: { type: Boolean, default: false },
    calendarAccessToken: { type: String },
    cosmeticOverrides: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    activeFrogodoroTimer: {
      type: Schema.Types.Mixed,
      default: null,
    },
    lastRecapWeek: { type: String, default: '' },
    onboardingCompleted: { type: Boolean, default: false },
  },
  { collection: 'users' },
);

// FIX: Delete the model if it exists to force a recompile with new fields
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const UserModel: Model<UserDoc> = mongoose.model<UserDoc>('User', UserSchema);

export default UserModel;
