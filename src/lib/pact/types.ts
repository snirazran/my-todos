import type { QuestReward, QuestRewards } from '@/lib/quests/types';

export type PactRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** One Lily Pad, from the shared shield pool. */
export type PactShieldReward = { type: 'SHIELD'; amount?: number };

/**
 * A guaranteed rarity, drawn identity. The tier is certain and only which item
 * lands is rolled — the same contract trade-ups run on, so it steers by the
 * wishlist and favours items the user does not already own.
 */
export type PactRarityItemReward = {
  type: 'RARITY_ITEM';
  rarity: PactRarity;
  amount?: number;
};

/** What milestones and prestige may pay, over and above a week's own gift. */
export type PactBonusReward =
  | QuestReward
  | PactShieldReward
  | PactRarityItemReward;
export type PactBonusRewards = PactBonusReward[];

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

/** The schedule the pick sheet opens on, and the week the cards price. */
export const PACT_DEFAULT_DAYS = [1, 3, 5];

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
  /** `near_miss` kept the streak on ≥ the configured share of the sessions. */
  outcome: 'kept' | 'rescued' | 'near_miss' | 'missed';
  progress: number;
  target: number;
  streakBefore: number;
  streakAfter: number;
  /** The week finished a cycle: it prestiged, and the climb resets. */
  lapCompleted?: boolean;
  /** Milestone rung this week reached for the first time, if any. */
  milestoneWeeks?: number;
  /** Label of the set piece a prestige awarded, if any. */
  prestigeLabel?: string;
  /** Base multiplier the prestige raised the floor to. */
  prestigeBase?: number;
  /** Flies granted at settlement, for a week finished but never claimed. */
  fliesGranted: number;
  /** Items handed over at settlement — milestone and prestige payouts. */
  grantedItemIds?: string[];
  shieldsLeft: number;
};

/** What a kept week pays at, once the streak reaches `weeks`. */
export type PactStreakMultiplier = {
  weeks: number;
  multiplier: number;
  /** Paid ONCE, the first time a streak reaches this rung. */
  rewards?: PactBonusRewards;
};

/** The gift a completed week hands over, by how many sessions it asked for. */
export type PactCompletionGiftTier = {
  minSessions: number;
  rewards: QuestRewards;
};

/** One turn of the twelve-week ladder, and the set piece finishing it awards. */
export type PactPrestigeCycle = {
  label?: string;
  rewards: PactBonusRewards;
};

export type PactConfigView = {
  isActive: boolean;
  pickHour: number;
  fliesPerCompletion: number;
  weekValuePerSession: number;
  weekValueBaseSessions: number;
  comebackBonusFlies: number;
  completionRewards: QuestRewards;
  completionGiftTiers: PactCompletionGiftTier[];
  streakMultipliers: PactStreakMultiplier[];
  prestigeWeeks: number;
  prestigeBaseStep: number;
  maxEffectiveMultiplier: number;
  prestigeRewards: PactBonusRewards;
  prestigeCycles: PactPrestigeCycle[];
  postSetPrestigeRewards: PactBonusRewards;
  nearMissPercent: number;
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
  /**
   * The settled pact this row repeats, when its tasks are still on the board.
   * Committing with it carries those same tasks into the new week — the board
   * row and its calendar event are edited, not replaced.
   */
  continuePactId?: string;
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

/**
 * One scheduled session of the running week, as the client sees it. Carried so
 * a delete can state its own consequence before it happens — which session is
 * about to go, and whether its day is still ahead.
 */
export type PactSessionView = {
  taskId: string;
  dayOfWeek: number;
  dateKey: string;
  /** `open` is today or later and still tickable; `missed` is a day gone by. */
  state: 'done' | 'open' | 'missed';
  /** Siblings deleted together by "stop repeating". */
  repeatGroupId?: string;
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
  /** The week's sessions, one per task, so a delete can price its own damage. */
  sessions: PactSessionView[];
  /** The gift this week's session count pays at completion. */
  completionRewards: QuestRewards;
  /** Sessions that keep the streak alive without finishing the week. */
  nearMissTarget: number;
  /**
   * Near-miss protection is still reachable. False once even that is out of
   * range, which is the only point at which the week is truly over.
   */
  canHoldStreak: boolean;
};

export type PactStatus = 'active' | 'kept' | 'missed' | 'skipped';

/**
 * The one rung the user is climbing toward. Goal-gradient: motivation rises
 * near a goal, so the card shows the next near-end rather than the whole
 * 2/4/8/12 ladder — there is always another one to accelerate toward.
 */
export type PactLadderRung = {
  /** 0 is the base rung — the rate a week pays with no streak behind it. */
  weeks: number;
  /** The rung's own step, before the prestige base is applied. */
  multiplier: number;
  /** What a week here actually pays at: base × step, capped. */
  effective: number;
  /** The one-time payout for reaching this rung. Empty on the base rung. */
  rewards: PactBonusRewards;
  reached: boolean;
  /** Already collected in this cycle. */
  paid: boolean;
};

/**
 * One ladder, one unit. Every extra payout track — lump tiers at 2/4/8/12
 * weeks, area mastery, a gift every other week — was a separate reward on a
 * separate clock, and four clocks is what made the week impossible to price.
 * The streak now does exactly one thing: it multiplies what a kept week pays,
 * so the ladder's effect shows up in the number already on the card.
 */
export type PactLadderView = {
  rungs: PactLadderRung[];
  /** What the week in progress pays at, including the streak it will reach. */
  multiplier: number;
  /** The permanent floor prestige has bought. Never lost to a broken streak. */
  baseMultiplier: number;
  /** Hard ceiling on base × streak. Plus doubling sits outside it. */
  cap: number;
  /** Which turn of the ladder this is, 1-based. */
  cycle: number;
  /** Weeks that complete a cycle and prestige. */
  prestigeWeeks: number;
  /** What finishing the cycle pays, this cycle's set piece included. */
  prestigeRewards: PactBonusRewards;
  /** Name of the piece this cycle awards, when it awards one. */
  prestigeLabel?: string;
  /** Pieces in the set, and how many are already held. */
  setSize: number;
  setOwned: number;
  /** The base the next prestige raises the floor to. */
  nextBaseMultiplier: number;
};

/**
 * What one session count is worth this week, already multiplied. The client
 * never recomputes the formula: a preview that derives its own number drifts
 * from the one settlement pays the moment either side is tuned.
 */
export type PactWeekPreview = {
  sessions: number;
  /** The whole week if every session lands. */
  flies: number;
  /** What one session pays the moment it is ticked. */
  sessionFlies: number;
  /** What is held back for finishing. */
  bonusFlies: number;
  /** The gift at completion for this many sessions. */
  rewards: QuestRewards;
};

export type PactStreakView = {
  weeks: number;
  best: number;
  /** Full climbs completed. The ladder resets at the top, so this is the tally. */
  laps: number;
  /** The shared shield pool, mirrored here so the pact card needs no second fetch. */
  shields: number;
  /** Most shields that can be held at once. Small on purpose. */
  shieldCap: number;
  /** A rescued week cannot be followed by another, and the pool has its own window. */
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
  flyRates: { perTask: number; comeback: number };
  /** Every session count the pick sheet can offer, priced and gifted. */
  weekPreview: PactWeekPreview[];
  /** The gift a week below the first tier pays. */
  completionRewards: QuestRewards;
  rewardCatalog: Record<string, unknown>;
  /** Flies Plus would have added to past claims. Claimable once premium. */
  forgoneFlies: number;
  ladder: PactLadderView;
  /** Every tag the user owns, so a pact can be pointed at their own. */
  userTags: PactUserTag[];
  /** Current fly balance, so purchase sheets need no second fetch. */
  flyBalance: number;
  /** Last week's outcome, until it has been shown once. */
  weekResult: PactWeekResult | null;
};
