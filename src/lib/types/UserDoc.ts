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
};

export type UserSkins = {
  equippedId: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export type UserDoc = {
  _id: any;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  wardrobe?: UserWardrobe;
  skins?: UserSkins;
  statistics?: UserStatistics;
  tags?: UserTag[];
};
