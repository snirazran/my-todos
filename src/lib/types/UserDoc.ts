import type { WardrobeSlot } from '@/lib/skins/catalog';

export type DailyFlyProgress = {
  date: string;
  earned: number;
  taskIds?: string[];
  limitNotified?: boolean;
};

// --- UPDATED STATISTICS TYPES ---
export type DailyStats = {
  date: string;
  dailyTasksCount: number;
  dailyMilestoneGifts: number;
  completedTaskIds: string[];
  // [NEW] Tracks the task count when the last gift was claimed
  taskCountAtLastGift: number;
};

export type UserStatistics = {
  daily: DailyStats;
};
// ---------------------------

export type UserTag = {
  id: string;
  name: string;
  color: string;
};

export type UserWardrobe = {
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  inventory: Record<string, number>;
  unseenItems?: string[];
  flies: number;
  flyDaily?: DailyFlyProgress;

  // Hunger System
  hunger?: number; // Time remaining in ms (Max 24h = 86400000)
  lastHungerUpdate?: Date; // Timestamp of last calculation
  stolenFlies?: number; // Flies eaten by frog since last acknowledgement
};

export type UserSkins = {
  equippedId: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export type UserDoc = {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  wardrobe?: UserWardrobe;
  skins?: UserSkins;
  statistics?: UserStatistics;
  tags?: UserTag[];
  premiumUntil?: Date;
  dailyRewards?: DailyRewardProgress;
  notificationPrefs?: NotificationPrefs;
};

export type NotificationPrefs = {
  fcmTokens: string[]; // Device FCM tokens (one per device)
  enabled: boolean; // User opt-in for push notifications
  activityHours: number[]; // Rolling log of active hours (last 50)
  lastNotifiedAt?: Date; // Prevent duplicate sends
  timezone: string; // User's IANA timezone
  morningSlot: number; // Best morning notification hour (0-23), default 9
  eveningSlot: number; // Best evening notification hour (0-23), default 18
};

export type DailyRewardProgress = {
  lastClaimDate: Date | null; // Date of last claim
  claimedDays: number[]; // Array of day numbers (1-31) claimed this month
  month: string; // YYYY-MM to track which month we are tracking
  streak: number; // Current streak (optional usage for now)
};
