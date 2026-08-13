import type { QuestRewards } from '@/lib/quests/types';

export type PactSizeTier = 'starter' | 'steady' | 'strong';

export const PACT_SIZE_TIERS: PactSizeTier[] = ['starter', 'steady', 'strong'];

/**
 * Three options, one per effort tier. Choice overload is contested in general
 * (the jam study largely fails to replicate) but reproduces reliably under
 * Chernev's moderators — high preference uncertainty, multi-attribute options,
 * a committed choice, an effort-minimising goal — all of which describe this
 * screen exactly. "Write my own" carries anyone who wants something else.
 */
export const PRIMARY_OPTIONS = 3;
export const MAX_OPTIONS = 3;

export const PACT_SIZE_LABEL: Record<PactSizeTier, string> = {
  starter: 'Easy',
  steady: 'Steady',
  strong: 'Push',
};

export type PactSuggestion = {
  id: string;
  categoryId: string;
  text: string;
  days: number[];
  startTime: string;
  minutes?: number;
  tier: PactSizeTier;
  isActive: boolean;
  generated?: boolean;
  picked: number;
  kept: number;
};

export type PactStreakTier = {
  weeks: number;
  rewards: QuestRewards;
};

export type PactAreaMasteryTier = {
  weeks: number;
  rewards: QuestRewards;
  plusRewards?: QuestRewards;
};

export type PactConfigView = {
  isActive: boolean;
  pickHour: number;
  fliesPerCompletion: number;
  weekBonusFlies: number;
  bigCommitmentBonusFlies: number;
  completionRewards: QuestRewards;
  milestoneEveryWeeks: number;
  milestoneRewards: QuestRewards;
  streakTiers: PactStreakTier[];
  masteryTiers: PactAreaMasteryTier[];
  shieldCapFree: number;
  shieldCapPlus: number;
  shieldEarnEveryWeeks: number;
  shieldPriceFlies: number;
  shieldAdsRequired: number;
  shieldAdMinStreak: number;
  plusSwapTokensPerMonth: number;
  minOptionsPerArea: number;
  autoGenerate: boolean;
  suggestions: PactSuggestion[];
};

export type PactOption = {
  id: string;
  text: string;
  days: number[];
  startTime: string;
  minutes?: number;
  tier: PactSizeTier;
  tierLabel: string;
  taskCount: number;
  rewardFlies: number;
  scheduleLabel: string;
  source: 'library' | 'generated' | 'repeat';
};

export type PactAreaChoice = {
  categoryId: string;
  name: string;
  shortLabel: string;
  accent?: string;
  coverImageUrl?: string;
  backgroundFrom?: string;
  backgroundTo?: string;
  quietDays: number | null;
  streakWeeks: number;
  weeksKept: number;
  recommended: boolean;
  hasTag: boolean;
  /** The tag this area's tasks will carry. Absent = one gets created. */
  tagId?: string;
  tagName?: string;
  tagColor?: string;
};

export type PactUserTag = { id: string; name: string; color: string };

export type ActivePactView = {
  id: string;
  weekKey: string;
  categoryId: string;
  categoryName: string;
  accent?: string;
  coverImageUrl?: string;
  backgroundFrom?: string;
  backgroundTo?: string;
  commitmentText: string;
  scheduleLabel: string;
  days: number[];
  startTime: string;
  progress: number;
  target: number;
  status: PactStatus;
  claimable: boolean;
  claimed: boolean;
  rewardFlies: number;
  daysLeft: number;
  shieldUsed: boolean;
  nextTaskLabel: string | null;
  /** Area tag on this pact's tasks, for hint targeting. */
  tagId?: string;
};

export type PactStatus = 'active' | 'kept' | 'missed' | 'skipped';

/**
 * The one rung the user is climbing toward. Goal-gradient: motivation rises
 * near a goal, so the card shows the next near-end rather than the whole
 * 2/4/8/12 ladder — there is always another one to accelerate toward.
 */
export type PactMilestone = {
  kind: 'streak' | 'mastery';
  weeks: number;
  weeksDone: number;
  rewards: QuestRewards;
  areaName?: string;
};

export type PactStreakView = {
  weeks: number;
  best: number;
  shields: number;
  /** Most shields that can be held at once. Small on purpose. */
  shieldCap: number;
  shieldPriceFlies: number;
  /** Ads needed for one shield right now; rises with the streak. */
  shieldAdsRequired: number;
  canBuyShield: boolean;
  canEarnShieldWithAd: boolean;
  /** A rescued week cannot be followed by another rescued week. */
  rescueOnCooldown: boolean;
  atRisk: boolean;
};

export type PactView = {
  enabled: boolean;
  weekKey: string;
  weekLabel: string;
  pickOpen: boolean;
  daysLeftInWeek: number;
  active: ActivePactView | null;
  areas: PactAreaChoice[];
  streak: PactStreakView;
  isPremium: boolean;
  canWriteOwn: boolean;
  swapTokens: number;
  introSeen: boolean;
  needsAreas: boolean;
  weekStartsOn: number;
  flyRates: { perTask: number; weekBonus: number; pushBonus: number };
  /** What finishing this week grants on top of flies (usually a gift box). */
  completionRewards: QuestRewards;
  rewardCatalog: Record<string, unknown>;
  /** Flies Plus would have added to past claims. Claimable once premium. */
  forgoneFlies: number;
  nextMilestone: PactMilestone | null;
  /** Every tag the user owns, so a pact can be pointed at their own. */
  userTags: PactUserTag[];
  /** Current fly balance, so purchase sheets need no second fetch. */
  flyBalance: number;
};
