import type { WardrobeSlot } from '@/lib/skins/catalog';
import type { RotationInterval } from '@/lib/skins/styleShuffle';
import type { WishlistPin } from '@/lib/skins/wishlist';
import type { DealReroll } from '@/lib/skins/dailyDeal';
import type { SavedLook } from '@/lib/skins/looks';
import type { FocusProfile } from '@/lib/quests/types';
import type { FrogodoroSettings, PomodoroPhase, SessionStats } from '@/lib/frogodoroStore';
import type { OverflowJar } from '@/lib/economy/overflowJar';

export type DailyFlyProgress = {
  date: string;
  earned: number;
  taskIds?: string[];
  taskFlies?: Record<string, number>;
  /** Belly time (ms) each task actually added, so undo refunds exactly that. */
  taskHunger?: Record<string, number>;
  limitNotified?: boolean;
  /** Completions that have drawn from the paying-completions allowance today. */
  paidCompletions?: number;
  /** Tasks whose completion earned pebbles instead of flies. */
  jarTaskIds?: string[];
};

export type FocusFlyDaily = {
  date: string;
  focusSeconds: number;
  earned: number;
};

export type DeepFocusDaily = {
  date: string;
  earned: number;
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
  /** Flies earned from focus time (1 per 15 focused minutes, daily-capped). */
  focusFlyDaily?: FocusFlyDaily;
  /** Deep-focus pledge bonus flies awarded today (daily-capped). */
  deepFocusDaily?: DeepFocusDaily;
  friendFlyDaily?: FriendFlyDaily;
  /** Lifetime flies each friend has contributed to you (by friend userId). */
  friendFlyTotals?: Record<string, number>;
  /** @deprecated Superseded by `wishlistItems`; still read to migrate old accounts. */
  wishlist?: WishlistPin | null;
  /** Everything this user is saving toward, newest first. */
  wishlistItems?: WishlistPin[];
  /** Daily-deal rerolls spent today (Plus perk). */
  dealReroll?: DealReroll | null;
  /** Outfits the user saved so a good combination isn't lost to a shuffle. */
  looks?: SavedLook[];
  /** Pebbles earned past the day's paying completions, and the gifts they buy. */
  overflowJar?: OverflowJar;

  // Hunger System
  hunger?: number; // Time remaining in ms (max defined by MAX_HUNGER_MS)
  lastHungerUpdate?: Date; // Timestamp of last calculation
  stolenFlies?: number; // Flies eaten by frog since last acknowledgement

  backgrounds?: UserBackgrounds;
};

export type StyleShufflePrefs = {
  interval: RotationInterval;
  lastAutoAt?: Date | string | null;
  /** Last time a shuffle offered an unowned item as a try-on. */
  lastTryOnAt?: Date | string | null;
  /** Slots the shuffle must leave alone. */
  lockedSlots?: WardrobeSlot[];
};

export type UserSkins = {
  equippedId: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export type AdIdentity = {
  fbp?: string;
  fbc?: string;
  ttp?: string;
  ttclid?: string;
  ip?: string;
  userAgent?: string;
  consent?: 'granted' | 'denied';
  updatedAt?: Date;
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
  /** Legacy permanent dismissals — still honoured, no longer written to. */
  suggestionsDismissed?: string[];
  suggestionSnoozes?: { userId: string; until: Date }[];
  createdAt: Date;
  adIdentity?: AdIdentity;
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
  /** One rewarded-view budget shared by every ad placement. */
  adBudget?: {
    date: string;
    views: number;
    lastAt?: Date | string;
    byPlacement?: Record<string, number>;
  };
  /** The timezone the economy trusts, and how often it has been changed. */
  timezoneGuard?: {
    zone?: string;
    windowStartedAt?: Date | string;
    changesInWindow?: number;
  };
  /** Duo Week gifts collected this week, and from which bonds. */
  duoWeekGift?: {
    weekKey?: string;
    count?: number;
    bondIds?: string[];
  };
  /** Streak milestones waiting for a day with a payout left. */
  taskStreakQueue?: {
    key: string;
    groupKey: string;
    taskId: string;
    taskText: string;
    day: number;
    queuedAt: Date | string;
  }[];
  dailyQuestReroll?: {
    date: string;
    count: number;
  };
  giftDoubleClaim?: {
    id: string;
    giftBoxId: string;
    doubled: boolean;
    createdAt: Date;
  };
  /** The one weighted Luck counter every cosmetic reveal feeds. */
  giftLuck?: {
    luck: number;
    epicLuck: number;
    softSteps: number;
    updatedAt?: Date | string;
  };
  tradeRerollClaim?: {
    id: string;
    rewardId: string;
    rewardKind: 'item' | 'background';
    rarity: string;
    aimed?: boolean;
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
  flyGameReward?: {
    runId: string;
    score: number;
    amount: number;
    claimedAt: Date | string;
  };
  quests?: unknown;
  dailyRewards?: DailyRewardProgress;
  notificationPrefs?: NotificationPrefs;
  styleShuffle?: StyleShufflePrefs | null;
  calendarSyncEnabled?: boolean;
  /** 0 = Sunday, 1 = Monday. Drives every week boundary in the app. */
  weekStartsOn?: 0 | 1;
  calendarAccessToken?: string;
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
  // One-time in-app explainers the user has already seen (belly mechanic,
  // frogodoro timer intro). Server-side so they never repeat across devices.
  seenIntros?: {
    bellyFull?: boolean;
    frogodoro?: boolean;
    savedTask?: boolean;
  };
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
  // Seconds of the CURRENT phase already persisted to the task's session
  // (client pause/periodic flushes). The phase-completion save subtracts this
  // so incremental flushes and the final save never double-count.
  savedElapsed?: number;
  // A phase just ended into a non-auto-start state and is awaiting Done — the
  // alarm is ringing across devices. Cleared when any surface acknowledges Done.
  finished?: boolean;
  // When `finished` flipped true, so the ringing state can expire on schedule.
  // Its own field rather than a read of `updatedAt`, which every republish
  // refreshes — that would let a syncing client postpone the expiry forever.
  finishedAt?: string | null;
  // Deep-focus mode: the user pledged to finish this focus phase without
  // pausing. Set at start; `deepFocusBroken` flips true on any mid-phase pause
  // (from any surface). An unbroken deep focus of ≥15 min earns a bonus fly at
  // completion.
  deepFocus?: boolean;
  deepFocusBroken?: boolean;
};

export type NotificationPrefs = {
  fcmTokens: string[]; // Device FCM tokens (one per device)
  androidFcmTokens?: string[]; // Subset of fcmTokens that are Android
  iosFcmTokens?: string[]; // Subset of fcmTokens that are iOS
  webFcmTokens?: string[]; // Subset of fcmTokens that are browsers
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
};
