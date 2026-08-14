import type { QuestRewards } from '@/lib/quests/types';

/**
 * Three options, one per step up the session ladder. Choice overload is
 * contested in general (the jam study largely fails to replicate) but
 * reproduces reliably under Chernev's moderators — high preference
 * uncertainty, multi-attribute options, a committed choice, an
 * effort-minimising goal — all of which describe this screen exactly.
 * "Write my own" carries anyone who wants something else.
 */
export const PRIMARY_OPTIONS = 3;
export const MAX_OPTIONS = 3;

export const PACT_MAX_SESSIONS = 7;

/** Where the day toggles start on the confirm step, before the user moves them. */
export const DEFAULT_PACT_START_TIME = '19:00';

/**
 * A starting spread for N sessions, chosen to leave rest days between them
 * rather than stacking a week at the front. It is only ever a default — the
 * confirm step is where the user says which days are actually theirs, and
 * that choice is the part of a commitment the evidence says does the work.
 */
const SESSION_DAY_SPREAD: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function daysForSessions(sessions: number): number[] {
  const n = Math.min(PACT_MAX_SESSIONS, Math.max(1, Math.round(sessions)));
  return [...(SESSION_DAY_SPREAD[n] ?? SESSION_DAY_SPREAD[3])];
}

/** Sessions an idea asks for, recovering the count from a legacy schedule. */
export function suggestionSessions(suggestion: {
  sessions?: number;
  days?: number[];
}): number {
  const authored = Number(suggestion.sessions);
  if (Number.isFinite(authored) && authored >= 1) {
    return Math.min(PACT_MAX_SESSIONS, Math.round(authored));
  }
  const legacy = new Set(suggestion.days ?? []).size;
  return legacy >= 1 ? Math.min(PACT_MAX_SESSIONS, legacy) : 3;
}

export type PactSuggestion = {
  id: string;
  categoryId: string;
  text: string;
  /** How many times a week this asks for — the only thing an idea commits to. */
  sessions: number;
  /**
   * Legacy. Ideas used to ship a fixed schedule, which meant a good commitment
   * could be turned down over an admin's choice of Tuesday. The user picks
   * days and times on the confirm step now; these are only read to recover a
   * session count from an idea authored before the change.
   */
  days?: number[];
  startTime?: string;
  minutes?: number;
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
  comebackBonusFlies: number;
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
  /** A starting spread the user rearranges on the confirm step. */
  days: number[];
  startTime: string;
  /** Sessions a week — what the option asks for, and what it is priced on. */
  sessions: number;
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

export type PactUserTag = {
  id: string;
  name: string;
  color: string;
  /** Focus area this tag is already connected to, if any. */
  linkedCategoryId?: string;
  linkedAreaName?: string;
};

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
  /** What the whole week is worth if every session lands. */
  rewardFlies: number;
  /** Flies each session pays the moment it is ticked. */
  sessionFlies: number;
  /** Flies still waiting on the last session. */
  weekBonusFlies: number;
  /** Flies this pact has already banked — sessions kept, plus any comeback. */
  earnedFlies: number;
  daysLeft: number;
  shieldUsed: boolean;
  nextTaskLabel: string | null;
  /** A session is scheduled today and is still open. */
  openToday: boolean;
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
  active: ActivePactView | null;
  areas: PactAreaChoice[];
  streak: PactStreakView;
  isPremium: boolean;
  canWriteOwn: boolean;
  swapTokens: number;
  introSeen: boolean;
  needsAreas: boolean;
  weekStartsOn: number;
  flyRates: { perTask: number; weekBonus: number; comeback: number };
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
