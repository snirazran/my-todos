import { v4 as uuid } from 'uuid';
import PactModel, { type PactDoc } from '@/lib/models/Pact';
import PactConfigModel, {
  DEFAULT_PACT_STREAK_MULTIPLIERS,
  PACT_CONFIG_ID,
  PACT_PAYOUT,
  PACT_PAYOUT_VERSION,
  RETIRED_PACT_CONFIG_FIELDS,
  seedSuggestions,
  type PactConfigDoc,
} from '@/lib/models/PactConfig';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import {
  normalizeWeekStart,
  startOfWeekYMD,
  weekOrder,
  type WeekStartDay,
} from '@/lib/weekStart';
import {
  buildRewardCatalog,
  isPremiumUser,
  normalizeFocusProfile,
  hasReachedLeapOnboardingStep,
} from '@/lib/quests/engine';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import {
  applyPactBonusRewards,
  applyPactRewards,
  applyPactSessionFlies,
} from './grant';
import {
  canRescue,
  consumeShield,
  cooldownEndsOn,
  grantShields,
  loadShieldConfig,
  persistShieldState,
  readShieldState,
  setShieldStateOn,
  shieldCapFor,
} from '@/lib/shields/engine';
import type { UserDoc } from '@/lib/types/UserDoc';
import type { QuestRewards } from '@/lib/quests/types';
import {
  DEFAULT_PACT_START_TIME,
  MAX_OPTIONS,
  PACT_MAX_SESSIONS,
  PACT_QUIET_NUDGE_DAYS,
  PRIMARY_OPTIONS,
  type ActivePactView,
  type PactAreaChoice,
  type PactLadderView,
  type PactStreakMultiplier,
  type PactOption,
  type PactSessionView,
  type PactStreakView,
  type PactSuggestion,
  type PactUserTag,
  type PactView,
  type PactWeekPreview,
  type PactWeekResult,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic per-seed shuffle source, so a menu never reshuffles on reopen. */
function createSeededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type PactStreakState = {
  weeks: number;
  best: number;
  /** Cycles completed end to end. Survives the reset, and buys the base rate. */
  laps: number;
  /**
   * Highest milestone rung already collected in THIS cycle. Milestones pay
   * once, and settlement is lazy, so a re-run has to be able to tell a rung it
   * already paid from one the streak has only just reached.
   */
  milestonesPaid: number;
  lastKeptWeek: string;
  /** Week key of the last week a shield rescued, for the back-to-back guard. */
  shieldRescueWeek: string;
  swapTokens: number;
  swapMonth: string;
  introSeen: boolean;
  areaWeeks: Record<string, number>;
  areaLastWeek: Record<string, string>;
  /**
   * Flies a free user left on the table by claiming without Plus. Shown before
   * they buy and grantable the moment they do — the PDF calls the retroactive
   * unlock the highest-converting moment in the system.
   */
  forgoneFlies: number;
  /** Last settled week, held until the user has been shown it once. */
  pendingResult: PactWeekResult | null;
};

const EMPTY_STREAK: PactStreakState = {
  weeks: 0,
  best: 0,
  laps: 0,
  milestonesPaid: 0,
  lastKeptWeek: '',
  shieldRescueWeek: '',
  swapTokens: 0,
  swapMonth: '',
  introSeen: false,
  areaWeeks: {},
  areaLastWeek: {},
  forgoneFlies: 0,
  pendingResult: null,
};

export function normalizePactStreak(user: Partial<UserDoc> | null): PactStreakState {
  const raw = (user as any)?.quests?.pactStreak;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STREAK };
  return {
    weeks: Math.max(0, Number(raw.weeks) || 0),
    best: Math.max(0, Number(raw.best) || 0),
    laps: Math.max(0, Number(raw.laps) || 0),
    // A document written before milestones existed has no record of which
    // rungs a running streak already passed. Seeding it from the streak treats
    // them as collected — the alternative pays every rung at or below the
    // current week again the next time one lands, which is a retroactive
    // windfall nobody did the work for under these rules.
    milestonesPaid:
      raw.milestonesPaid === undefined
        ? Math.max(0, Number(raw.weeks) || 0)
        : Math.max(0, Number(raw.milestonesPaid) || 0),
    lastKeptWeek: typeof raw.lastKeptWeek === 'string' ? raw.lastKeptWeek : '',
    shieldRescueWeek:
      typeof raw.shieldRescueWeek === 'string' ? raw.shieldRescueWeek : '',
    swapTokens: Math.max(0, Number(raw.swapTokens) || 0),
    swapMonth: typeof raw.swapMonth === 'string' ? raw.swapMonth : '',
    introSeen: !!raw.introSeen,
    areaWeeks: raw.areaWeeks && typeof raw.areaWeeks === 'object' ? raw.areaWeeks : {},
    areaLastWeek:
      raw.areaLastWeek && typeof raw.areaLastWeek === 'object' ? raw.areaLastWeek : {},
    forgoneFlies: Math.max(0, Number(raw.forgoneFlies) || 0),
    pendingResult:
      raw.pendingResult && typeof raw.pendingResult === 'object'
        ? (raw.pendingResult as PactWeekResult)
        : null,
  };
}

export function shiftYMD(dateKey: string, deltaDays: number) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export function dowFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function weekKeyFor(dateKey: string, weekStartsOn: WeekStartDay = 0) {
  return startOfWeekYMD(dateKey, weekStartsOn);
}

export function daysBetween(fromKey: string, toKey: string) {
  const a = new Date(`${fromKey}T00:00:00Z`).getTime();
  const b = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

export function previousWeekKey(weekKey: string) {
  return shiftYMD(weekKey, -7);
}

export function weekLabel(weekKey: string) {
  const start = new Date(`${weekKey}T00:00:00Z`);
  const end = new Date(`${shiftYMD(weekKey, 6)}T00:00:00Z`);
  const fmt = (d: Date) =>
    `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export function monthKeyFor(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function scheduleLabel(days: number[], startTime: string) {
  const sorted = Array.from(new Set(days)).sort((a, b) => a - b);
  const time = startTime ? ` at ${startTime}` : '';
  if (sorted.length === 7) return `Every day${time}`;
  if (sorted.length === 5 && sorted.every((d) => d >= 1 && d <= 5)) {
    return `Weekdays${time}`;
  }
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) {
    return `Weekends${time}`;
  }
  return `${sorted.map((d) => DAY_NAMES[d]).join(', ')}${time}`;
}

export async function ensurePactConfig(): Promise<PactConfigDoc> {
  await connectMongo();
  const existing = await PactConfigModel.findOne({
    configId: PACT_CONFIG_ID,
  }).lean<PactConfigDoc>();
  if (!existing) {
    const created = await PactConfigModel.create({
      configId: PACT_CONFIG_ID,
      suggestions: seedSuggestions(),
    });
    return created.toObject() as PactConfigDoc;
  }

  // Mongoose defaults only apply to new documents, so anything the current
  // payout added since this doc was written has to be filled in here or the
  // feature silently runs without it.
  const backfill: Partial<PactConfigDoc> = {};
  if (!existing.suggestions?.length) backfill.suggestions = seedSuggestions();

  // There is one payout model, and a doc either holds it or is seeded to it.
  // Keyed on the SHAPE rather than the version stamp: a stamp is written by one
  // line and its payload by another, so any window where the constant is live
  // and the write is not — a half-applied deploy, a dev server reloading
  // mid-edit — burns the stamp on a doc that never got the numbers, and a
  // stamp-only check then refuses to ever fix it. `weekValuePerSession` is the
  // tell: the payout always writes it, and no admin action can remove it.
  if (typeof existing.weekValuePerSession !== 'number') {
    Object.assign(backfill, PACT_PAYOUT);
  }
  // The rung weeks moved (4/7/10 → 2/5/8) and a live doc keeps whatever it was
  // seeded with, so the ladder has to be re-applied once rather than waiting
  // for someone to retype it in the admin screen. Version-gated, so an admin
  // who tunes the rungs afterwards is never overwritten again. In-flight
  // streaks self-heal: `milestonesPaid` only ever holds the highest rung paid,
  // so the next kept week collects any rung the new spacing put behind them.
  if ((existing.payoutVersion ?? 0) < 6) {
    backfill.streakMultipliers = DEFAULT_PACT_STREAK_MULTIPLIERS;
  }
  if (existing.payoutVersion !== PACT_PAYOUT_VERSION) {
    backfill.payoutVersion = PACT_PAYOUT_VERSION;
  }

  // Earlier payout models left keys behind that nothing reads. Dropped rather
  // than merely ignored, so the database and the code agree about what is paid.
  const unset: Record<string, ''> = {};
  for (const field of RETIRED_PACT_CONFIG_FIELDS) {
    if ((existing as unknown as Record<string, unknown>)[field] !== undefined) {
      unset[field] = '';
    }
  }

  const hasBackfill = Object.keys(backfill).length > 0;
  const hasUnset = Object.keys(unset).length > 0;
  if (!hasBackfill && !hasUnset) return existing;
  await PactConfigModel.updateOne(
    { configId: PACT_CONFIG_ID },
    {
      ...(hasBackfill ? { $set: backfill } : {}),
      ...(hasUnset ? { $unset: unset } : {}),
    },
  );
  return { ...existing, ...backfill };
}

/**
 * Most sessions a week may ask for at this much tenure in the area. The paid
 * gym experiments found the whole effect came from people who weren't already
 * doing the behaviour, and a beginner's menu that opens with five sessions
 * loses exactly those people — so the ladder is earned, not offered up front.
 */
/** Flies one kept session pays, the moment its task is ticked. */
export function pactSessionFlies(config: PactConfigDoc) {
  return Math.max(0, Number(config.fliesPerCompletion ?? 0));
}

/**
 * One formula prices the whole system: a pact is worth
 * `weekValuePerSession × (sessions + weekValueBaseSessions)`. Deliberately
 * blind to how hard an idea claims to be — a difficulty nobody can verify must
 * never move the rate, or the hardest-labelled option becomes strictly
 * dominant. Ambition is priced in sessions, the one unit of effort the app can
 * actually see, and sub-linearly at that: the `+1` means the second session
 * adds a third of what the first one did.
 */
export function pactWeekValueFlies(config: PactConfigDoc, sessions: number) {
  const perSession = Math.max(0, Number(config.weekValuePerSession ?? 20));
  const base = Math.max(0, Number(config.weekValueBaseSessions ?? 1));
  return Math.max(0, Math.round(perSession * (Math.max(0, sessions) + base)));
}

/**
 * Flies held back for finishing the whole week: the remainder of the formula
 * once every session has been paid for. At the defaults that is roughly three
 * quarters of the week's value, back-loaded onto the last session where the
 * goal gradient does the most work.
 */
export function pactWeekBonusFlies(config: PactConfigDoc, sessions: number) {
  return Math.max(
    0,
    pactWeekValueFlies(config, sessions) - pactSessionFlies(config) * sessions,
  );
}

/** Flies for the first session completed after a scheduled one was missed. */
export function pactComebackFlies(config: PactConfigDoc) {
  return Math.max(0, Number(config.comebackBonusFlies ?? 0));
}

/**
 * What a week at this position in the streak pays at. `streakWeeks` is the
 * week's OWN number — the streak it lands on, not the one it started from — so
 * the week that takes a run to four weeks is already paid at the four-week
 * rate. Anything below the first rung pays flat.
 */
function pactRungFor(config: PactConfigDoc, streakWeeks: number) {
  const rungs = [...(config.streakMultipliers ?? [])].sort(
    (a, b) => a.weeks - b.weeks,
  );
  let reached: PactStreakMultiplier | null = null;
  for (const rung of rungs) {
    if (streakWeeks >= rung.weeks) reached = rung;
  }
  return reached;
}

/** The streak's own step, before prestige raises the floor under it. */
export function pactRungMultiplier(
  config: PactConfigDoc,
  streakWeeks: number,
) {
  const rung = pactRungFor(config, streakWeeks);
  return Math.max(1, Number(rung?.multiplier) || 1);
}

/**
 * The permanent floor. Prestige gains are never taken back: breaking a streak
 * costs the streak multiplier, never the base a completed cycle bought.
 */
export function pactPrestigeBase(config: PactConfigDoc, laps: number) {
  const step = Math.max(0, Number(config.prestigeBaseStep ?? 0.15));
  return 1 + step * Math.max(0, Math.floor(laps));
}

export function pactMultiplierCap(config: PactConfigDoc) {
  return Math.max(1, Number(config.maxEffectiveMultiplier ?? 2.5));
}

/**
 * What a week actually pays at: the prestige floor times the streak's step,
 * hard-capped. Without the cap a long-running Plus veteran earns more from this
 * one system than every shop price is written against.
 *
 * The Plus doubling sits OUTSIDE this cap — it is a purchase, not progression.
 */
export function pactMultiplier(
  config: PactConfigDoc,
  streakWeeks: number,
  laps = 0,
) {
  return Math.min(
    pactMultiplierCap(config),
    pactPrestigeBase(config, laps) * pactRungMultiplier(config, streakWeeks),
  );
}

/** Weeks that complete a cycle. 0 = no prestige. */
export function pactPrestigeWeeks(config: PactConfigDoc) {
  return Math.max(0, Math.floor(Number(config.prestigeWeeks ?? 0)));
}

/** Sessions that keep a streak alive without finishing the week. */
export function pactNearMissTarget(config: PactConfigDoc, sessions: number) {
  const percent = Math.max(0, Math.min(100, Number(config.nearMissPercent ?? 0)));
  if (percent <= 0 || sessions <= 0) return sessions;
  return Math.min(sessions, Math.ceil((sessions * percent) / 100));
}

/** The gift at completion for a week of this many sessions. */
export function pactCompletionRewards(
  config: PactConfigDoc,
  sessions: number,
): QuestRewards {
  const tiers = [...(config.completionGiftTiers ?? [])].sort(
    (a, b) => a.minSessions - b.minSessions,
  );
  let reached: QuestRewards | null = null;
  for (const tier of tiers) {
    if (sessions >= tier.minSessions && tier.rewards?.length) {
      reached = tier.rewards;
    }
  }
  return reached ?? config.completionRewards ?? [];
}

/**
 * What a week is worth end to end, for previews only — sessions are paid as
 * they happen and the bonus lands on the last one.
 */
export function optionRewardFlies(
  config: PactConfigDoc,
  days: number[],
  multiplier = 1,
) {
  const sessions = Math.max(1, new Set(days).size);
  return Math.round(
    pactWeekValueFlies(config, sessions) * Math.max(1, multiplier),
  );
}

/**
 * An idea is only a what. How often and when are the user's answer, given on
 * the next step: goal-setting theory's difficulty effects are conditional on
 * the goal being self-endorsed, and an authored session count arrives as an
 * assignment — it buys compliance, not commitment. It also anchored the
 * ambition of the week to whatever an admin happened to type.
 */
function suggestionToOption(
  suggestion: PactSuggestion,
  source: PactOption['source'] = 'library',
): PactOption {
  return {
    id: suggestion.id,
    text: suggestion.text,
    days: [],
    startTime: DEFAULT_PACT_START_TIME,
    sessions: 0,
    taskCount: 0,
    rewardFlies: 0,
    scheduleLabel: '',
    source,
  };
}

// Every title is a noun phrase describing ONE sitting, so "15-minute session"
// twice a week can never be read as 15 minutes split across the week.
function universalFallbacks(
  categoryId: string,
  areaName: string,
): PactSuggestion[] {
  const label = areaName.trim();
  const base = (text: string, sessions: number): PactSuggestion => ({
    id: `fallback-${categoryId}-${sessions}`,
    categoryId,
    text,
    sessions,
    isActive: true,
    picked: 0,
    kept: 0,
  });

  return [
    base(`15-minute ${label} session`, 2),
    base(`25-minute ${label} session`, 3),
    base(`45-minute ${label} session`, 5),
  ];
}

export function buildOptionsForArea(args: {
  config: PactConfigDoc;
  categoryId: string;
  areaName: string;
  weekKey: string;
  lastPact?: PactDoc | null;
  /** `lastPact`'s tasks are still on the board, so they can be carried forward. */
  lastPactContinuable?: boolean;
  streakMultiplier?: number;
}): PactOption[] {
  const { config, categoryId, areaName, weekKey, lastPact } = args;
  const streakMultiplier = args.streakMultiplier ?? 1;
  const library = (config.suggestions ?? []).filter(
    (s) => s.isActive && s.categoryId === categoryId,
  );
  const pool =
    library.length > 0
      ? library
      : universalFallbacks(categoryId, areaName);

  // Three ideas, drawn at random and held steady for the week. With sessions
  // gone from the ideas there is no ladder left to build — every row now costs
  // whatever the user decides it costs — so the menu's only job is variety.
  // Seeded so re-opening the sheet shows the same three: a menu that reshuffles
  // under the reader turns picking into shopping.
  const rng = createSeededRandom(`${categoryId}:${weekKey}:${pool.length}`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const chosen = shuffled.slice(0, PRIMARY_OPTIONS);

  const options = chosen.map((entry) => suggestionToOption(entry));

  // A week that ended, kept or missed. A missed one is the case where carrying
  // the same commitment forward matters most — the schedule is already the
  // user's own answer, and re-typing it is the friction that ends the area.
  if (lastPact && lastPact.settledAt && lastPact.status !== 'skipped') {
    // The one option that keeps its schedule: these days and this time are the
    // user's own answer from a week that worked, not an authored guess.
    const repeat: PactOption = {
      id: `repeat-${lastPact.pactId}`,
      text: lastPact.commitmentText,
      days: lastPact.days,
      startTime: lastPact.startTime,
      sessions: new Set(lastPact.days).size,
      taskCount: new Set(lastPact.days).size,
      rewardFlies: optionRewardFlies(config, lastPact.days, streakMultiplier),
      scheduleLabel: scheduleLabel(lastPact.days, lastPact.startTime),
      source: 'repeat',
      continuePactId: args.lastPactContinuable ? lastPact.pactId : undefined,
    };
    const deduped = options.filter((o) => o.text !== repeat.text);
    return [repeat, ...deduped].slice(0, MAX_OPTIONS);
  }

  return options.slice(0, MAX_OPTIONS);
}

/**
 * Which week a commitment made right now belongs to: always the week the user
 * is standing in. The evening before a new week is the eve of the NEXT week,
 * so planning then commits forward rather than to the week already closing.
 */
export function planningWeekKey(
  todayKey: string,
  weekStartsOn: WeekStartDay,
  nowHour: number,
  pickHour: number,
): string {
  const eveOfNextWeek = (dowFromKey(todayKey) + 1) % 7 === weekStartsOn;
  if (eveOfNextWeek && nowHour >= pickHour) {
    return startOfWeekYMD(shiftYMD(todayKey, 1), weekStartsOn);
  }
  return startOfWeekYMD(todayKey, weekStartsOn);
}

/**
 * The pick screen is always reachable — a week with no pact is a week the
 * user can still claim. `pickHour` only decides when we *nudge* them.
 */
export function isPickWindowOpen() {
  return true;
}

async function loadCategories() {
  return QuestCategoryModel.find({}).sort({ createdAt: 1 }).lean();
}

/**
 * When the user last *finished* something in this area, measured only from
 * completed tasks carrying one of the area's tags. Deliberately blind to
 * whether a pact was ever made here: a promise is not activity, and counting
 * one reset the gap for areas the user had done nothing in.
 */
function lastActivityKeyForArea(
  tasks: TaskDoc[],
  tagIds: string[],
  timezone: string,
): string | null {
  if (tagIds.length === 0) return null;
  const wanted = new Set(tagIds);
  let latest: string | null = null;
  for (const task of tasks) {
    if (!(task.tags ?? []).some((tagId) => wanted.has(tagId))) continue;
    for (const occurrence of task.completedDates ?? []) {
      const stamp = task.completedAtByDate?.[occurrence];
      const key = stamp
        ? getZonedYMD(stamp instanceof Date ? stamp : new Date(stamp), timezone)
        : occurrence;
      if (!latest || key > latest) latest = key;
    }
  }
  return latest;
}

export type PactSessionLedger = {
  progress: number;
  /** Scheduled days already behind the user with nothing ticked on them. */
  missed: number;
  /** Scheduled days still ahead, today included. */
  remaining: number;
  /**
   * A scheduled session went by unticked and a later one was still kept. The
   * single largest effect in the 53-arm gym megastudy came from paying for
   * exactly this return, so it is worth detecting precisely.
   */
  cameBack: boolean;
};

/**
 * Reads one pact's week off its tasks: how many sessions landed, and whether
 * the user missed one and came back. Pass the week context to get the second
 * answer — progress alone doesn't need it.
 *
 * A session completed late still counts for the day it was scheduled on, so
 * catching up on Wednesday clears Monday rather than burning it.
 */
export function readPactSessions(args: {
  pact: PactDoc;
  tasks: TaskDoc[];
  timezone: string;
  weekStartsOn?: WeekStartDay;
  todayKey?: string;
}): PactSessionLedger {
  const { pact, tasks, timezone, weekStartsOn, todayKey } = args;
  const ids = new Set(pact.taskIds ?? []);
  // Sessions kept on tasks the user has since deleted. They are not readable
  // from the board any more, so the count rides on the pact itself.
  const banked = Math.max(0, pact.bankedProgress ?? 0);
  if (ids.size === 0) {
    return {
      progress: Math.min(pact.target, Math.max(pact.progress ?? 0, banked)),
      cameBack: false,
      missed: 0,
      remaining: 0,
    };
  }
  const weekEnd = shiftYMD(pact.weekKey, 6);
  const order = weekStartsOn === undefined ? null : weekOrder(weekStartsOn);

  let done = banked;
  let missed = 0;
  let remaining = 0;
  let earliestMiss: string | null = null;
  let latestKept: string | null = null;

  for (const task of tasks) {
    if (!ids.has(task.id)) continue;
    let keptOn: string | null = null;
    for (const occurrence of task.completedDates ?? []) {
      const stamp = task.completedAtByDate?.[occurrence];
      const key = stamp
        ? getZonedYMD(stamp instanceof Date ? stamp : new Date(stamp), timezone)
        : occurrence;
      if (key < pact.weekKey || key > weekEnd) continue;
      done += 1;
      if (!keptOn || key < keptOn) keptOn = key;
    }
    if (keptOn) {
      if (!latestKept || keptOn > latestKept) latestKept = keptOn;
      continue;
    }
    if (!order || !todayKey) continue;
    const offset = order.indexOf(task.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    if (offset < 0) continue;
    const scheduled = shiftYMD(pact.weekKey, offset);
    // Today still counts as available: a session is only missed once its day
    // is behind you, which is also when it stops being something you can fix.
    if (scheduled >= todayKey) {
      remaining += 1;
      continue;
    }
    missed += 1;
    if (!earliestMiss || scheduled < earliestMiss) earliestMiss = scheduled;
  }

  return {
    progress: Math.min(pact.target, done),
    cameBack: !!earliestMiss && !!latestKept && latestKept > earliestMiss,
    missed,
    remaining,
  };
}

/**
 * Where each of the week's sessions stands, one entry per live task. The
 * delete flows price themselves off this: removing a session whose day is
 * still ahead lowers the week's goal, removing one already gone by does not.
 */
export function readPactSessionStates(args: {
  pact: PactDoc;
  tasks: TaskDoc[];
  timezone: string;
  weekStartsOn: WeekStartDay;
  todayKey: string;
}): PactSessionView[] {
  const { pact, tasks, timezone, weekStartsOn, todayKey } = args;
  const ids = new Set(pact.taskIds ?? []);
  if (ids.size === 0) return [];
  const weekEnd = shiftYMD(pact.weekKey, 6);
  const order = weekOrder(weekStartsOn);

  const sessions: PactSessionView[] = [];
  for (const task of tasks) {
    if (!ids.has(task.id)) continue;
    const offset = order.indexOf(task.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    const dateKey = offset < 0 ? pact.weekKey : shiftYMD(pact.weekKey, offset);
    let done = false;
    for (const occurrence of task.completedDates ?? []) {
      const stamp = task.completedAtByDate?.[occurrence];
      const key = stamp
        ? getZonedYMD(stamp instanceof Date ? stamp : new Date(stamp), timezone)
        : occurrence;
      if (key < pact.weekKey || key > weekEnd) continue;
      done = true;
      break;
    }
    sessions.push({
      taskId: task.id,
      dayOfWeek: (task.dayOfWeek ?? dowFromKey(dateKey)) as number,
      dateKey,
      state: done ? 'done' : dateKey >= todayKey ? 'open' : 'missed',
      repeatGroupId: task.repeatGroupId,
    });
  }
  return sessions.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export async function syncPactProgress(args: {
  pact: PactDoc;
  tasks: TaskDoc[];
  timezone: string;
}): Promise<number> {
  return readPactSessions(args).progress;
}

export function refreshMonthlyAllowances(
  streak: PactStreakState,
  config: PactConfigDoc,
  isPremium: boolean,
  todayKey: string,
): PactStreakState {
  const month = monthKeyFor(todayKey);
  const next = { ...streak };
  if (next.swapMonth !== month) {
    next.swapMonth = month;
    next.swapTokens = isPremium ? Math.max(0, config.plusSwapTokensPerMonth) : 0;
  }
  return next;
}

export async function settleFinishedWeeks(args: {
  userId: string;
  timezone: string;
  config: PactConfigDoc;
  streak: PactStreakState;
  tasks: TaskDoc[];
  todayKey: string;
  weekStartsOn: WeekStartDay;
}): Promise<PactStreakState> {
  const { userId, timezone, streak, tasks, todayKey } = args;
  const currentWeek = weekKeyFor(todayKey, args.weekStartsOn);
  const unsettled = await PactModel.find({
    userId,
    settledAt: null,
    weekKey: { $lt: currentWeek },
  });
  if (unsettled.length === 0) return streak;

  let next = { ...streak };
  const ordered = unsettled.sort((a, b) => a.weekKey.localeCompare(b.weekKey));

  // Doing the work is what pays — not remembering to tap Claim before the week
  // rolls over. Any week that ends finished-but-unclaimed is granted here, so
  // the flies, the gift and the tier can never be silently lost.
  const userDoc = await UserModel.findById(userId);
  const isPremium = userDoc ? isPremiumUser(userDoc.toObject()) : false;
  let autoGrantedFlies = 0;

  const shieldConfig = await loadShieldConfig();
  let shieldState = readShieldState(userDoc?.toObject() ?? null);

  const categories = await loadCategories();

  const rungs = [...(args.config.streakMultipliers ?? [])].sort(
    (a, b) => a.weeks - b.weeks,
  );
  const prestigeWeeks = pactPrestigeWeeks(args.config);
  const cycles = args.config.prestigeCycles ?? [];

  for (const pact of ordered) {
    const streakBefore = next.weeks;
    const grantedBefore = autoGrantedFlies;
    const lapsBefore = next.laps;
    // The week is over, so every scheduled day is in the past — asking the
    // ledger as of the day after it ended is what makes a miss a miss.
    const ledger = readPactSessions({
      pact,
      tasks,
      timezone,
      weekStartsOn: args.weekStartsOn,
      todayKey: shiftYMD(pact.weekKey, 7),
    });
    const progress = ledger.progress;
    const kept = progress >= pact.target;
    // Near miss: finish most of the week and the run survives. This one rule
    // saves more long-running pacts than shields do — but it buys survival
    // only. The completion bonus, the gift and the milestone are all forfeit,
    // so it can never become the cheap way to climb.
    const nearMissTarget = pactNearMissTarget(args.config, pact.target);
    const nearMiss = !kept && progress > 0 && progress >= nearMissTarget;
    let usedShield = false;

    // Sessions ticked at the week's edge may never have been reconciled while
    // the week was still current, and once it rolls over nothing else looks at
    // them. Settle them here so no kept session goes unpaid.
    const paidSessions = Math.max(0, pact.paidSessions ?? 0);
    const owedSessions = progress - paidSessions;
    const earnsComeback = ledger.cameBack && !pact.comebackPaid;
    if (userDoc && (owedSessions !== 0 || earnsComeback)) {
      autoGrantedFlies += applyPactSessionFlies({
        user: userDoc,
        config: args.config,
        paidSessions,
        owedSessions,
        comeback: earnsComeback,
        isPremium,
        // The rate this week was lived under: the streak it was reaching for,
        // which is what reconcile paid its earlier sessions at.
        streakWeeks: streakBefore + 1,
        laps: lapsBefore,
      });
      pact.paidSessions = progress;
      if (earnsComeback) pact.comebackPaid = true;
    }

    // Two rescued weeks in a row would let someone who finishes nothing hold
    // a twelve-week streak, so a rescue always has to be followed by a week
    // actually kept. Zero progress is never rescuable either, and a near miss
    // never spends one — protection the user already has for free must not
    // cost them a Lily Pad. The shield spends itself; nobody arms it.
    const rescuedLastWeek =
      next.shieldRescueWeek === shiftYMD(pact.weekKey, -7);
    const settleDay = shiftYMD(pact.weekKey, 7);
    if (
      !kept &&
      !nearMiss &&
      !pact.shieldUsed &&
      progress > 0 &&
      !rescuedLastWeek &&
      canRescue(shieldState, shieldConfig, 'pact', settleDay)
    ) {
      shieldState = consumeShield(shieldState, 'pact', settleDay);
      next.shieldRescueWeek = pact.weekKey;
      usedShield = true;
    }

    // Only a finished week ADVANCES. A rescue and a near miss both hold the
    // number where it is: a milestone reached on a week nobody did the work
    // for is a milestone the ladder no longer means anything at.
    const held = usedShield || nearMiss;
    if (kept) {
      next.weeks += 1;
      next.best = Math.max(next.best, next.weeks);
      next.lastKeptWeek = pact.weekKey;
      next.areaWeeks = {
        ...next.areaWeeks,
        [pact.categoryId]: (next.areaWeeks[pact.categoryId] ?? 0) + 1,
      };
      next.areaLastWeek = {
        ...next.areaLastWeek,
        [pact.categoryId]: pact.weekKey,
      };
    } else if (!held) {
      next.weeks = 0;
      // A broken run gives the milestones back to climb again. The prestige
      // base it already bought is untouched — nothing earned is ever taken.
      next.milestonesPaid = 0;
    }

    const survives = kept || held;
    if (kept) {
      pact.streakWeek = next.weeks;
      pact.areaWeek = next.areaWeeks[pact.categoryId];
    }

    // Shields are earned by the behaviour they protect: every Nth week you
    // actually keep hands one back, up to the cap. Off by default in v5 — the
    // milestone rungs issue them now, and against a holding cap of 2 a second
    // faucet only oversupplies.
    const earnEvery = Math.max(0, shieldConfig.earnEveryPactWeeks);
    if (kept && earnEvery > 0 && next.weeks % earnEvery === 0) {
      shieldState = grantShields(shieldState, shieldConfig, isPremium, 1);
    }

    // Only a genuinely finished week pays; a shield rescues the streak, not
    // the reward — otherwise missing the work would still earn the flies.
    if (kept && !pact.claimedAt && userDoc) {
      const summary = applyPactRewards({
        user: userDoc,
        config: args.config,
        pact,
        streakWeeks: next.weeks,
        laps: lapsBefore,
        isPremium,
      });
      autoGrantedFlies += summary.fliesGranted;
      pact.claimedAt = new Date();
    }

    // Milestones pay once each, the first time the streak reaches them. Only
    // a kept week can reach one, so a held week never triggers this.
    let milestoneWeeks: number | undefined;
    const bonusItemIds: string[] = [];
    if (kept && userDoc) {
      for (const rung of rungs) {
        const weeks = Math.max(0, Number(rung.weeks) || 0);
        if (weeks <= next.milestonesPaid || next.weeks < weeks) continue;
        next.milestonesPaid = weeks;
        milestoneWeeks = weeks;
        if (!rung.rewards?.length) continue;
        const bonus = await applyPactBonusRewards({
          user: userDoc,
          rewards: rung.rewards,
          isPremium,
          doubles: false,
          shieldState,
          shieldConfig,
        });
        shieldState = bonus.shieldState;
        autoGrantedFlies += bonus.fliesGranted;
        bonusItemIds.push(...bonus.grantedItemIds);
      }
    }

    // Prestige. Holding the top rate forever turns a finished cycle into
    // permanent multiplied income — the strongest faucet in the app, paid to
    // someone who has already proved the habit. So the streak resets and the
    // permanent base rises instead: everything already earned is kept, and
    // there is a new twelve weeks to climb. Deliberately after the payout —
    // the week that completes a cycle is still paid at the rate it earned.
    const streakReached = next.weeks;
    const lapCompleted = kept && prestigeWeeks > 0 && streakReached >= prestigeWeeks;
    let prestigeLabel: string | undefined;
    if (lapCompleted) {
      next.laps += 1;
      next.weeks = 0;
      next.milestonesPaid = 0;
      const cycle = cycles[next.laps - 1];
      // After the last cycle the run still pays — well — but issues no new
      // piece: a sixth would cheapen the five that make the set.
      const setPiece = cycle?.rewards ?? [];
      const rewards = cycle
        ? [...(args.config.prestigeRewards ?? []), ...setPiece]
        : (args.config.postSetPrestigeRewards ?? []);
      if (cycle?.label) prestigeLabel = cycle.label;
      if (userDoc && rewards.length) {
        const bonus = await applyPactBonusRewards({
          user: userDoc,
          rewards,
          isPremium,
          doubles: false,
          shieldState,
          shieldConfig,
        });
        shieldState = bonus.shieldState;
        autoGrantedFlies += bonus.fliesGranted;
        bonusItemIds.push(...bonus.grantedItemIds);
      }
    }
    const grantedThisWeek = autoGrantedFlies - grantedBefore;

    pact.progress = progress;
    pact.status = survives ? 'kept' : 'missed';
    pact.shieldUsed = usedShield;
    pact.settledAt = new Date();
    if (kept && !pact.completedAt) pact.completedAt = new Date();
    await pact.save();

    // The week is over and nobody watched it end. Keep the outcome so the
    // next visit can say what happened — a streak that breaks in silence
    // teaches nothing, and a shield spent in silence is a feature the user
    // paid for and never saw work.
    const settledCategory = categories.find(
      (entry) => entry.categoryId === pact.categoryId,
    );
    next.pendingResult = {
      weekKey: pact.weekKey,
      categoryName:
        settledCategory?.shortLabel || settledCategory?.name || 'your area',
      outcome: kept
        ? 'kept'
        : usedShield
          ? 'rescued'
          : nearMiss
            ? 'near_miss'
            : 'missed',
      progress,
      target: pact.target,
      streakBefore,
      // The number the week actually reached, not the post-prestige zero — a
      // completed cycle shown as "11 → 0" reads as a broken streak.
      streakAfter: streakReached,
      lapCompleted,
      milestoneWeeks,
      prestigeLabel,
      prestigeBase: lapCompleted
        ? pactPrestigeBase(args.config, next.laps)
        : undefined,
      fliesGranted: grantedThisWeek,
      grantedItemIds: bonusItemIds,
      shieldsLeft: shieldState.count,
    };
  }

  if (!isPremium && autoGrantedFlies > 0) {
    next.forgoneFlies += autoGrantedFlies;
  }

  if (userDoc) {
    (userDoc as any).set('quests.pactStreak', next);
    setShieldStateOn(userDoc, shieldState);
    await userDoc.save();
  } else {
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'quests.pactStreak': next } },
    );
    await persistShieldState(userId, shieldState);
  }
  return next;
}

function ladderFor(args: {
  config: PactConfigDoc;
  streak: PactStreakState;
  /** The week the user is playing for — the streak's next number. */
  weekStreakNumber: number;
}): PactLadderView {
  const { config, streak, weekStreakNumber } = args;
  const laps = streak.laps;
  const base = pactPrestigeBase(config, laps);
  const cap = pactMultiplierCap(config);
  const cycles = config.prestigeCycles ?? [];
  const cycle = cycles[laps];
  const prestigeWeeks = pactPrestigeWeeks(config);
  return {
    // The base rate leads the ladder as a real rung: a week with no streak
    // behind it still pays, and a ladder that opens at "nothing" is a ladder
    // nobody is standing on.
    rungs: [
      {
        weeks: 0,
        multiplier: 1,
        effective: Math.min(cap, base),
        rewards: [],
        reached: true,
        paid: true,
      },
      ...[...(config.streakMultipliers ?? [])]
        .sort((a, b) => a.weeks - b.weeks)
        .map((rung) => ({
          weeks: rung.weeks,
          multiplier: Math.max(1, Number(rung.multiplier) || 1),
          effective: Math.min(
            cap,
            base * Math.max(1, Number(rung.multiplier) || 1),
          ),
          rewards: rung.rewards ?? [],
          reached: streak.weeks >= rung.weeks,
          paid: streak.milestonesPaid >= rung.weeks,
        })),
    ],
    multiplier: pactMultiplier(config, weekStreakNumber, laps),
    baseMultiplier: base,
    cap,
    cycle: laps + 1,
    prestigeWeeks,
    prestigeRewards: [
      ...(cycle
        ? (config.prestigeRewards ?? [])
        : (config.postSetPrestigeRewards ?? [])),
      ...(cycle?.rewards ?? []),
    ],
    prestigeLabel: cycle?.label,
    setSize: cycles.length,
    setOwned: Math.min(cycles.length, laps),
    nextBaseMultiplier: pactPrestigeBase(config, laps + 1),
  };
}

/**
 * Every session count the pick sheet can offer, priced once on the server.
 * A client that recomputes the formula drifts from what settlement actually
 * pays the moment either side is tuned, and the number on the confirm step is
 * the promise the whole commitment is made against.
 */
function weekPreviewFor(
  config: PactConfigDoc,
  multiplier: number,
): PactWeekPreview[] {
  return Array.from({ length: PACT_MAX_SESSIONS }, (_, index) => {
    const sessions = index + 1;
    return {
      sessions,
      flies: Math.round(pactWeekValueFlies(config, sessions) * multiplier),
      sessionFlies: Math.round(pactSessionFlies(config) * multiplier),
      bonusFlies: Math.round(
        pactWeekBonusFlies(config, sessions) * multiplier,
      ),
      rewards: pactCompletionRewards(config, sessions),
    };
  });
}

export async function getPactView(args: {
  userId: string;
  timezone: string;
  nowHour?: number;
}): Promise<PactView> {
  const { userId, timezone } = args;
  await connectMongo();
  const config = await ensurePactConfig();
  const todayKey = getZonedToday(timezone);

  const [leapUnlocked, user, tasks, categories] = await Promise.all([
    hasReachedLeapOnboardingStep(userId),
    UserModel.findById(userId).lean<UserDoc | null>(),
    TaskModel.find(
      { userId, deletedAt: { $exists: false } },
      {
        id: 1,
        type: 1,
        tags: 1,
        text: 1,
        completedDates: 1,
        completedAtByDate: 1,
        focusAreaId: 1,
        startTime: 1,
        dayOfWeek: 1,
        repeatGroupId: 1,
      },
    ).lean<TaskDoc[]>(),
    loadCategories(),
  ]);
  if (!user) throw new Error('User not found');

  const isPremium = isPremiumUser(user);
  const profile = normalizeFocusProfile(user);
  const weekStartsOn = normalizeWeekStart(user.weekStartsOn);
  const currentWeek = weekKeyFor(todayKey, weekStartsOn);
  const nowHourResolved =
    args.nowHour ??
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
    );
  // On the eve of a new week this is next week's key, so planning ahead never
  // overwrites the week still in progress.
  const planningWeek = planningWeekKey(
    todayKey,
    weekStartsOn,
    nowHourResolved,
    config.pickHour ?? 18,
  );

  let streak = normalizePactStreak(user);
  streak = refreshMonthlyAllowances(streak, config, isPremium, todayKey);
  streak = await settleFinishedWeeks({
    userId,
    timezone,
    config,
    streak,
    tasks,
    todayKey,
    weekStartsOn,
  });

  // The rate the week in progress is being paid at — the prestige floor times
  // the streak's step, capped. Every fly number the card shows is already
  // multiplied by it, so the user reads one true number.
  const weekMultiplier = pactMultiplier(config, streak.weeks + 1, streak.laps);

  const activeDoc =
    (await PactModel.findOne({ userId, weekKey: currentWeek })) ??
    (planningWeek !== currentWeek
      ? await PactModel.findOne({ userId, weekKey: planningWeek })
      : null);
  let active: ActivePactView | null = null;
  if (activeDoc && activeDoc.status !== 'skipped') {
    const ledger = readPactSessions({
      pact: activeDoc,
      tasks,
      timezone,
      weekStartsOn,
      todayKey,
    });
    const progress = ledger.progress;
    if (progress !== activeDoc.progress) {
      activeDoc.progress = progress;
      if (progress >= activeDoc.target && !activeDoc.completedAt) {
        activeDoc.completedAt = new Date();
      }
      await activeDoc.save();
    }
    const category = categories.find(
      (c) => c.categoryId === activeDoc.categoryId,
    );
    const weekEnd = shiftYMD(currentWeek, 6);
    const todayDow = dowFromKey(todayKey);
    const upcoming = Array.from(new Set(activeDoc.days))
      .sort((a, b) => a - b)
      .find((d) => ((d - todayDow + 7) % 7) <= 6);
    const pactTaskIds = new Set(activeDoc.taskIds ?? []);
    const openToday =
      activeDoc.days.includes(todayDow) &&
      tasks.some(
        (task) =>
          pactTaskIds.has(task.id) &&
          task.dayOfWeek === todayDow &&
          !(task.completedDates ?? []).includes(todayKey),
      );
    active = {
      id: activeDoc.pactId,
      weekKey: activeDoc.weekKey,
      categoryId: activeDoc.categoryId,
      categoryName: category?.shortLabel || category?.name || 'Your area',
      accent: category?.accent,
      coverImageUrl: category?.coverImageUrl,
      backgroundFrom: category?.backgroundFrom,
      backgroundTo: category?.backgroundTo,
      commitmentText: activeDoc.commitmentText,
      scheduleLabel: scheduleLabel(activeDoc.days, activeDoc.startTime),
      days: activeDoc.days,
      startTime: activeDoc.startTime,
      progress,
      target: activeDoc.target,
      status: activeDoc.status,
      claimable: progress >= activeDoc.target && !activeDoc.claimedAt,
      claimed: !!activeDoc.claimedAt,
      // Priced on the target, not the day list: a session removed after its
      // day went by leaves the goal where it was, and the week has to keep
      // saying what that goal is worth.
      rewardFlies: Math.round(
        pactWeekValueFlies(config, activeDoc.target) * Math.max(1, weekMultiplier),
      ),
      sessionFlies: Math.round(pactSessionFlies(config) * weekMultiplier),
      weekBonusFlies: Math.round(
        pactWeekBonusFlies(config, activeDoc.target) * weekMultiplier,
      ),
      earnedFlies: Math.round(
        (Math.max(0, activeDoc.paidSessions ?? 0) * pactSessionFlies(config) +
          (activeDoc.comebackPaid ? pactComebackFlies(config) : 0)) *
          weekMultiplier,
      ),
      completionRewards: pactCompletionRewards(config, activeDoc.target),
      nearMissTarget: pactNearMissTarget(config, activeDoc.target),
      canHoldStreak:
        progress + ledger.remaining >= pactNearMissTarget(config, activeDoc.target),
      daysLeft: Math.max(0, daysBetween(todayKey, weekEnd) + 1),
      shieldUsed: activeDoc.shieldUsed,
      tagId: activeDoc.tagId,
      sessions: readPactSessionStates({
        pact: activeDoc,
        tasks,
        timezone,
        weekStartsOn,
        todayKey,
      }),
      openToday,
      missedSessions: ledger.missed,
      // Whether the whole week is still reachable. Once it is not, the bonus
      // and the gift are gone no matter what happens next, and saying so is
      // the only way the user finds out before the week quietly ends.
      canStillFinish: progress + ledger.remaining >= activeDoc.target,
      nextTaskLabel:
        upcoming === undefined
          ? null
          : `${DAY_NAMES[upcoming]}${activeDoc.startTime ? ` at ${activeDoc.startTime}` : ''}`,
    };
  }

  const selectedIds = profile.selectedCategoryIds ?? [];
  const tagMap = new Map(
    (profile.categoryTagMap ?? []).map((entry) => [entry.categoryId, entry.tagIds ?? []]),
  );

  const userTags: PactUserTag[] = ((user as any)?.tags ?? [])
    .map((tag: any) => ({
      id: String(tag?.id ?? ''),
      name: String(tag?.name ?? ''),
      color: String(tag?.color ?? '#22c55e'),
    }))
    .filter((tag: PactUserTag) => tag.id && tag.name);
  const areaByTagId = new Map<string, { id: string; name: string }>();
  for (const [categoryId, ids] of Array.from(tagMap.entries())) {
    const cat = categories.find((c) => c.categoryId === categoryId);
    if (!cat) continue;
    for (const id of ids) {
      areaByTagId.set(id, {
        id: categoryId,
        name: cat.shortLabel || cat.name,
      });
    }
  }
  for (const tag of userTags) {
    const linked = areaByTagId.get(tag.id);
    if (linked) {
      tag.linkedCategoryId = linked.id;
      tag.linkedAreaName = linked.name;
    }
  }
  const userTagsById = new Map<string, PactUserTag>(
    userTags.map((tag) => [tag.id, tag] as const),
  );

  const areas: PactAreaChoice[] = selectedIds
    .map((categoryId): PactAreaChoice | null => {
      const category = categories.find((c) => c.categoryId === categoryId);
      if (!category) return null;
      const tagIds = tagMap.get(categoryId) ?? [];
      const lastActivity = lastActivityKeyForArea(tasks, tagIds, timezone);
      return {
        categoryId,
        name: category.name,
        shortLabel: category.shortLabel || category.name,
        accent: category.accent,
        coverImageUrl: category.coverImageUrl,
        backgroundFrom: category.backgroundFrom,
        backgroundTo: category.backgroundTo,
        quietDays: lastActivity
          ? Math.max(0, daysBetween(lastActivity, todayKey))
          : null,
        streakWeeks: streak.areaWeeks[categoryId] ?? 0,
        weeksKept: streak.areaWeeks[categoryId] ?? 0,
        recommended: false,
        hasTag: tagIds.length > 0,
        // Same precedence commitPact uses, read-only: a tag already linked to
        // the area wins, then one named after it. Nothing shown means the
        // pact will have to make one.
        ...(() => {
          const linked = tagIds.find((id) => userTagsById.has(id));
          const byName = userTags.find(
            (tag) =>
              tag.name.toLowerCase() ===
              (category.shortLabel || category.name).toLowerCase(),
          );
          const tag = linked ? userTagsById.get(linked) : byName;
          return tag
            ? { tagId: tag.id, tagName: tag.name, tagColor: tag.color }
            : {};
        })(),
      };
    })
    .filter((entry): entry is PactAreaChoice => !!entry);

  // How much attention an area is owed. An area with no tag connected cannot
  // be measured at all, so it sorts last instead of pretending to be the most
  // neglected — which is what treating "no data" as a 999-day gap used to do.
  const needScore = (entry: PactAreaChoice) => {
    if (!entry.hasTag) return -1;
    if (entry.quietDays === null) return 10_000;
    return entry.quietDays;
  };
  areas.sort((a, b) => needScore(b) - needScore(a));

  // "Needs you" is a claim about evidence, so it is only made when there is
  // some: a tagged area gone quiet for a week, or one never finished in.
  const mostNeglected = areas[0];
  if (
    mostNeglected?.hasTag &&
    (mostNeglected.quietDays === null ||
      mostNeglected.quietDays >= PACT_QUIET_NUDGE_DAYS)
  ) {
    mostNeglected.recommended = true;
  }

  const shieldConfig = await loadShieldConfig();
  const shieldState = readShieldState(user);
  const shieldCap = shieldCapFor(shieldConfig, isPremium);
  const flyBalance = Math.max(0, Number((user as any)?.wardrobe?.flies) || 0);
  const streakView: PactStreakView = {
    weeks: streak.weeks,
    best: streak.best,
    laps: streak.laps,
    shields: shieldState.count,
    shieldCap,
    rescueOnCooldown:
      (!!streak.shieldRescueWeek &&
        streak.shieldRescueWeek === shiftYMD(currentWeek, -7)) ||
      !!cooldownEndsOn(shieldState, shieldConfig, 'pact', todayKey),
    atRisk:
      !!active &&
      active.progress < active.target &&
      active.daysLeft <= 2 &&
      streak.weeks > 0,
  };

  return {
    enabled: config.isActive && leapUnlocked,
    weekKey: currentWeek,
    weekLabel: weekLabel(currentWeek),
    pickOpen:
      !active &&
      isPickWindowOpen(),
    active,
    areas,
    streak: streakView,
    isPremium,
    // Always true. Kept on the view so an older client build that still reads
    // it stops gating rather than gating everyone.
    canWriteOwn: true,
    swapTokens: streak.swapTokens,
    introSeen: streak.introSeen,
    needsAreas: areas.length === 0,
    weekStartsOn,
    // Already at the week's rate, like every other fly number in the view. A
    // preview that quotes the base while the card quotes the multiplied total
    // is two prices for one week.
    flyRates: {
      perTask: Math.round(pactSessionFlies(config) * weekMultiplier),
      comeback: Math.round(pactComebackFlies(config) * weekMultiplier),
    },
    weekPreview: weekPreviewFor(config, weekMultiplier),
    completionRewards: config.completionRewards ?? [],
    weekResult: streak.pendingResult,
    forgoneFlies: streak.forgoneFlies,
    userTags,
    flyBalance,
    ladder: ladderFor({ config, streak, weekStreakNumber: streak.weeks + 1 }),
    rewardCatalog: buildRewardCatalog(await getFullCatalog(), [
      config.completionRewards ?? [],
      ...(config.completionGiftTiers ?? []).map((tier) => tier.rewards ?? []),
      // Milestone and prestige lanes carry SHIELD and RARITY_ITEM entries the
      // catalog has no id for; they resolve to nothing rather than throwing,
      // and the client renders those two by name instead of by tile.
      ...(config.streakMultipliers ?? []).map(
        (rung) => (rung.rewards ?? []) as QuestRewards,
      ),
      (config.prestigeRewards ?? []) as QuestRewards,
      (config.postSetPrestigeRewards ?? []) as QuestRewards,
      ...(config.prestigeCycles ?? []).map(
        (cycle) => (cycle.rewards ?? []) as QuestRewards,
      ),
    ]),
  };
}

export async function getAreaOptions(args: {
  userId: string;
  categoryId: string;
  timezone: string;
}): Promise<PactOption[]> {
  const { userId, categoryId, timezone } = args;
  await connectMongo();
  const config = await ensurePactConfig();
  const [user, categories, lastPact] = await Promise.all([
    UserModel.findById(userId).select('quests').lean<UserDoc | null>(),
    loadCategories(),
    PactModel.findOne({
      userId,
      categoryId,
      settledAt: { $ne: null },
      status: { $ne: 'skipped' },
    })
      .sort({ weekKey: -1 })
      .lean<PactDoc>(),
  ]);
  const lastPactContinuable = !!lastPact?.taskIds?.length
    ? !!(await TaskModel.exists({
        userId,
        id: { $in: lastPact.taskIds },
        type: 'weekly',
        deletedAt: { $exists: false },
      }))
    : false;
  const category = categories.find((c) => c.categoryId === categoryId);
  const weekStartsOn = normalizeWeekStart((user as any)?.weekStartsOn);
  return buildOptionsForArea({
    config,
    categoryId,
    areaName: category?.shortLabel || category?.name || 'this area',
    weekKey: weekKeyFor(getZonedToday(timezone), weekStartsOn),
    lastPact,
    lastPactContinuable,
    streakMultiplier: pactMultiplier(
      config,
      normalizePactStreak(user).weeks + 1,
      normalizePactStreak(user).laps,
    ),
  });
}

export function newPactId() {
  return uuid();
}
