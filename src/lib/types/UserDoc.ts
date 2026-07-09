import type { WardrobeSlot } from '@/lib/skins/catalog';
import type { FocusProfile } from '@/lib/quests/types';
import type { FrogodoroSettings, PomodoroPhase, SessionStats } from '@/lib/frogodoroStore';

export type DailyFlyProgress = {
  date: string;
  earned: number;
  taskIds?: string[];
  taskFlies?: Record<string, number>;
  limitNotified?: boolean;
};

export type FriendFlyDaily = {
  date: string;
  credited: Record<string, number>;
  lastClaim?: { amount: number; doubled: boolean };
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

export type UserBackgrounds = {
  equipped: string | null;
  inventory: Record<string, number>;
};

export type UserWardrobe = {
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  inventory: Record<string, number>;
  inventoryHistory?: Record<string, string>; // itemId -> ISO date of acquisition
  unseenItems?: string[];
  flies: number;
  flyDaily?: DailyFlyProgress;
  friendFlyDaily?: FriendFlyDaily;
  /** Lifetime flies each friend has contributed to you (by friend userId). */
  friendFlyTotals?: Record<string, number>;

  // Hunger System
  hunger?: number; // Time remaining in ms (Max 24h = 86400000)
  lastHungerUpdate?: Date; // Timestamp of last calculation
  stolenFlies?: number; // Flies eaten by frog since last acknowledgement

  backgrounds?: UserBackgrounds;
};

export type UserSkins = {
  equippedId: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export type UserDoc = {
  _id: string;
  name: string;
  frogName?: string;
  birthday?: string;
  ageRange?: string;
  aboutGender?: string;
  usedBefore?: string;
  onboardingResponses?: Record<string, string[]>;
  email?: string;
  passwordHash?: string;
  phoneNumber?: string;
  isGuest?: boolean;
  friendCode?: string;
  suggestionsDismissed?: string[];
  createdAt: Date;
  wardrobe?: UserWardrobe;
  skins?: UserSkins;
  statistics?: UserStatistics;
  tags?: UserTag[];
  premiumUntil?: Date;
  plusIntroEligible?: boolean;
  plusIntroShownAt?: Date | null;
  adDoubleClaim?: {
    id: string;
    fliesGranted: number;
    grantedItemIds: string[];
    grantedBackgroundIds: string[];
    doubled: boolean;
    createdAt: Date;
  };
  adFlyDaily?: {
    date: string;
    count: number;
  };
  giftDoubleClaim?: {
    id: string;
    giftBoxId: string;
    doubled: boolean;
    createdAt: Date;
  };
  tradeRerollClaim?: {
    id: string;
    rewardId: string;
    rewardKind: 'item' | 'background';
    rarity: string;
    used: boolean;
    createdAt: Date;
  };
  focusProfile?: FocusProfile;
  // First time this user was seen on each platform (web browser vs native app).
  platformsSeen?: { web?: Date | string; native?: Date | string };
  // One-time gift for trying the app on a second platform; `platform` is where
  // it was claimed.
  crossGiftBonus?: {
    platform: 'web' | 'native';
    flies: number;
    claimedAt: Date | string;
  } | null;
  // One-time gift earned in the /try ad-landing funnel, banked at sign-in.
  funnelGift?: { itemId: string; grantedAt: Date | string } | null;
  quests?: unknown;
  dailyRewards?: DailyRewardProgress;
  notificationPrefs?: NotificationPrefs;
  calendarSyncEnabled?: boolean;
  calendarAccessToken?: string;
  googleCalendar?: {
    refreshToken?: string;
    accessToken?: string;
    accessTokenExpiresAt?: Date | string;
    calendarId?: string;
  };
  cosmeticOverrides?: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  activeFrogodoroTimer?: ActiveFrogodoroTimer | null;
  // Monotonic counter bumped on every timer state write (start/pause/resume/
  // stop/done/advance/clear). Every timer response + SSE event carries the seq
  // of the state it represents, so clients can ignore out-of-order/stale events
  // (including nulls) deterministically.
  frogodoroSeq?: number;
  // Highest native Live Activity / notification control sequence accepted for
  // this user. Prevents late Pause/Resume POSTs from overwriting newer taps.
  frogodoroControlSeq?: number;
  liveActivity?: LiveActivityRef | null;
  // Push-to-start token for the iOS Live Activity (iOS 17.2+). Persists across
  // activities, so the server can create the island via APNs while the app is
  // closed. Independent of `liveActivity`, which is the current activity's
  // per-instance update token.
  liveActivityStartToken?: string | null;
  liveActivityStartClockSkewMs?: number | null;
  liveActivityRemoteStart?: { key: string; attemptedAt: string } | null;
  onboardingCompleted?: boolean;
};

export type LiveActivityRef = {
  id: string;
  pushToken: string;
  updatedAt: string;
  clockSkewMs?: number;
};

export type ActiveFrogodoroTimer = {
  taskId: string;
  clientId?: string;
  clientStamp?: number;
  phase: PomodoroPhase;
  status: 'running' | 'paused';
  timeLeft: number;
  endsAt?: string | null;
  settings: FrogodoroSettings;
  sessionStats: SessionStats;
  updatedAt: string;
  rev?: number;
  // A phase just ended into a non-auto-start state and is awaiting Done — the
  // alarm is ringing across devices. Cleared when any surface acknowledges Done.
  finished?: boolean;
};

export type NotificationPrefs = {
  fcmTokens: string[]; // Device FCM tokens (one per device)
  androidFcmTokens?: string[]; // Subset of fcmTokens that are Android (timer control/alarm pushes are Android-only)
  enabled: boolean; // User opt-in for push notifications
  activityHours: number[]; // Rolling log of active hours (last 50)
  lastNotifiedAt?: Date; // Prevent duplicate sends
  reminderIgnoredCount?: number; // Consecutive routine reminders sent with no app activity; mutes nudges at threshold
  timezone: string; // User's IANA timezone
  morningSlot: number; // Best morning notification hour (0-23), default 9
  eveningSlot: number; // Best evening notification hour (0-23), default 21
};

export type DailyRewardProgress = {
  lastClaimDate: Date | null; // Date of last claim
  claimedDays: number[]; // Array of day numbers (1-31) claimed this month
  month: string; // YYYY-MM to track which month we are tracking
  streak: number; // Current streak (optional usage for now)
};
