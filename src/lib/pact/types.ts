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

/**
 * A gap only reads as neglect after about a week: shorter than that and
 * "quiet" describes an ordinary few days off, which is the kind of claim that
 * pushes a user into acting out of guilt rather than interest. Below this the
 * card states the gap plainly instead.
 */
export const PACT_QUIET_NUDGE_DAYS = 7;

/** Where the day toggles start on the confirm step, before the user moves them. */
export const DEFAULT_PACT_START_TIME = '19:00';

export type PactSuggestion = {
  id: string;
  categoryId: string;
  /** The whole idea: one sitting, described. How often is the user's answer. */
  text: string;
  /**
   * Legacy, still on old docs. Ideas used to ship a session count and even a
   * fixed schedule, which made the week's ambition an admin's choice and got
   * good commitments turned down over someone else's Tuesday. Nothing reads
   * these any more — the confirm step is where how-often and when are decided.
   */
  sessions?: number;
  days?: number[];
  startTime?: string;
  minutes?: number;
  isActive: boolean;
  generated?: boolean;
  picked: number;
  kept: number;
};

/**
 * What happened to the week that just ended, held until the user has been
 * shown it once. Settlement is lazy — it runs on the next page load after the
 * week rolls over — so without a record the entire outcome (a broken streak, a
 * shield spent, rewards auto-granted) happened while nobody was looking.
 */
export type PactWeekResult = {
  weekKey: string;
  categoryName: string;
  outcome: 'kept' | 'rescued' | 'missed';
  progress: number;
  target: number;
  streakBefore: number;
  streakAfter: number;
  /** Flies granted at settlement, for a week finished but never claimed. */
  fliesGranted: number;
  shieldsLeft: number;
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
  /** Scheduled days already gone by with nothing ticked on them. */
  missedSessions: number;
  /** False once too few days remain for every session to land. */
  canStillFinish: boolean;
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
  /** Last week's outcome, until it has been shown once. */
  weekResult: PactWeekResult | null;
};
