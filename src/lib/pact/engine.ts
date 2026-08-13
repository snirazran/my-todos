import { v4 as uuid } from 'uuid';
import PactModel, { type PactDoc } from '@/lib/models/Pact';
import PactConfigModel, {
  DEFAULT_PACT_COMPLETION_REWARDS,
  DEFAULT_PACT_MASTERY_TIERS,
  DEFAULT_PACT_MILESTONE_REWARDS,
  DEFAULT_PACT_STREAK_TIERS,
  PACT_CONFIG_ID,
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
} from '@/lib/quests/engine';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { applyPactRewards } from './grant';
import type { UserDoc } from '@/lib/types/UserDoc';
import {
  MAX_OPTIONS,
  PACT_SIZE_LABEL,
  PRIMARY_OPTIONS,
  type ActivePactView,
  type PactAreaChoice,
  type PactMilestone,
  type PactOption,
  type PactSizeTier,
  type PactStreakView,
  type PactSuggestion,
  type PactView,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type PactStreakState = {
  weeks: number;
  best: number;
  lastKeptWeek: string;
  shields: number;
  /** Week key of the last week a shield rescued, for the back-to-back guard. */
  shieldRescueWeek: string;
  /** Lifetime rescues, which is what escalates the ad price. */
  shieldRescues: number;
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
};

const EMPTY_STREAK: PactStreakState = {
  weeks: 0,
  best: 0,
  lastKeptWeek: '',
  shields: 0,
  shieldRescueWeek: '',
  shieldRescues: 0,
  swapTokens: 0,
  swapMonth: '',
  introSeen: false,
  areaWeeks: {},
  areaLastWeek: {},
  forgoneFlies: 0,
};

export function normalizePactStreak(user: Partial<UserDoc> | null): PactStreakState {
  const raw = (user as any)?.quests?.pactStreak;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STREAK };
  return {
    weeks: Math.max(0, Number(raw.weeks) || 0),
    best: Math.max(0, Number(raw.best) || 0),
    lastKeptWeek: typeof raw.lastKeptWeek === 'string' ? raw.lastKeptWeek : '',
    shields: Math.max(0, Number(raw.shields) || 0),
    shieldRescueWeek:
      typeof raw.shieldRescueWeek === 'string' ? raw.shieldRescueWeek : '',
    shieldRescues: Math.max(0, Number(raw.shieldRescues) || 0),
    swapTokens: Math.max(0, Number(raw.swapTokens) || 0),
    swapMonth: typeof raw.swapMonth === 'string' ? raw.swapMonth : '',
    introSeen: !!raw.introSeen,
    areaWeeks: raw.areaWeeks && typeof raw.areaWeeks === 'object' ? raw.areaWeeks : {},
    areaLastWeek:
      raw.areaLastWeek && typeof raw.areaLastWeek === 'object' ? raw.areaLastWeek : {},
    forgoneFlies: Math.max(0, Number(raw.forgoneFlies) || 0),
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
  if (existing) {
    // Fields added after this doc was written have no value on it — Mongoose
    // defaults only apply to new documents — so backfill them here or the
    // feature silently runs without gifts, tiers, or suggestions.
    const backfill: Partial<PactConfigDoc> = {};
    if (!existing.suggestions?.length) backfill.suggestions = seedSuggestions();
    if (!existing.completionRewards) {
      backfill.completionRewards = DEFAULT_PACT_COMPLETION_REWARDS;
    }
    if (!existing.milestoneRewards) {
      backfill.milestoneRewards = DEFAULT_PACT_MILESTONE_REWARDS;
    }
    if (typeof existing.milestoneEveryWeeks !== 'number') {
      backfill.milestoneEveryWeeks = 2;
    }
    if (!existing.streakTiers?.length) {
      backfill.streakTiers = DEFAULT_PACT_STREAK_TIERS;
    }
    if (!existing.masteryTiers?.length) {
      backfill.masteryTiers = DEFAULT_PACT_MASTERY_TIERS;
    }
    if (typeof existing.shieldCapFree !== 'number') backfill.shieldCapFree = 1;
    if (typeof existing.shieldCapPlus !== 'number') backfill.shieldCapPlus = 2;
    if (typeof existing.shieldEarnEveryWeeks !== 'number') {
      backfill.shieldEarnEveryWeeks = 2;
    }
    if (typeof existing.shieldPriceFlies !== 'number') {
      backfill.shieldPriceFlies = 100;
    }
    if (typeof existing.shieldAdsRequired !== 'number') {
      backfill.shieldAdsRequired = 1;
    }
    if (typeof existing.shieldAdMinStreak !== 'number') {
      backfill.shieldAdMinStreak = 2;
    }
    if (Object.keys(backfill).length === 0) return existing;
    await PactConfigModel.updateOne(
      { configId: PACT_CONFIG_ID },
      { $set: backfill },
    );
    return { ...existing, ...backfill };
  }
  const created = await PactConfigModel.create({
    configId: PACT_CONFIG_ID,
    suggestions: seedSuggestions(),
  });
  return created.toObject() as PactConfigDoc;
}

function tierForAreaWeeks(weeksKept: number): PactSizeTier {
  if (weeksKept >= 6) return 'strong';
  if (weeksKept >= 2) return 'steady';
  return 'starter';
}

function tierRank(tier: PactSizeTier) {
  return tier === 'starter' ? 0 : tier === 'steady' ? 1 : 2;
}

export function optionRewardFlies(
  config: PactConfigDoc,
  days: number[],
  tier: PactSizeTier,
) {
  const taskCount = Math.max(1, new Set(days).size);
  const base = taskCount * Math.max(1, config.fliesPerCompletion);
  const bonus = Math.max(0, config.weekBonusFlies);
  const push = tier === 'strong' ? Math.max(0, config.bigCommitmentBonusFlies) : 0;
  return base + bonus + push;
}

function suggestionToOption(
  suggestion: PactSuggestion,
  config: PactConfigDoc,
  source: PactOption['source'] = 'library',
): PactOption {
  const days = suggestion.days.length ? suggestion.days : [1, 3, 5];
  return {
    id: suggestion.id,
    text: suggestion.text,
    days,
    startTime: suggestion.startTime || '19:00',
    minutes: suggestion.minutes,
    tier: suggestion.tier,
    tierLabel: PACT_SIZE_LABEL[suggestion.tier],
    taskCount: new Set(days).size,
    rewardFlies: optionRewardFlies(config, days, suggestion.tier),
    scheduleLabel: scheduleLabel(days, suggestion.startTime || '19:00'),
    source,
  };
}

// Every title is a noun phrase describing ONE sitting, so "15-minute session"
// twice a week can never be read as 15 minutes split across the week.
function universalFallbacks(
  categoryId: string,
  areaName: string,
  quickAdd: string[] = [],
): PactSuggestion[] {
  const label = areaName.trim();
  const base = (
    tier: PactSizeTier,
    text: string,
    days: number[],
    startTime: string,
    minutes: number,
  ): PactSuggestion => ({
    id: `fallback-${categoryId}-${tier}`,
    categoryId,
    text,
    days,
    startTime,
    minutes,
    tier,
    isActive: true,
    picked: 0,
    kept: 0,
  });

  // An area's own quick-add suggestions are already authored, area-specific
  // task titles — far better than anything generic we could compose.
  if (quickAdd.length > 0) {
    const tiers: PactSizeTier[] = ['starter', 'steady', 'strong'];
    const schedules: [number[], string, number][] = [
      [[2, 4], '18:00', 15],
      [[1, 3, 5], '18:30', 25],
      [[1, 2, 3, 4, 5], '19:00', 45],
    ];
    return quickAdd.slice(0, 3).map((text, index) =>
      base(
        tiers[index] ?? 'steady',
        text,
        schedules[index]?.[0] ?? [1, 3, 5],
        schedules[index]?.[1] ?? '18:30',
        schedules[index]?.[2] ?? 20,
      ),
    );
  }

  return [
    base('starter', `15-minute ${label} session`, [2, 4], '18:00', 15),
    base('steady', `25-minute ${label} session`, [1, 3, 5], '18:30', 25),
    base('strong', `45-minute ${label} session`, [1, 3, 5], '19:00', 45),
  ];
}

function keepRate(suggestion: PactSuggestion) {
  if (suggestion.picked < 3) return 0.5;
  return suggestion.kept / suggestion.picked;
}

export function buildOptionsForArea(args: {
  config: PactConfigDoc;
  categoryId: string;
  areaName: string;
  weeksKept: number;
  quickAdd?: string[];
  lastPact?: PactDoc | null;
}): PactOption[] {
  const { config, categoryId, areaName, weeksKept, lastPact } = args;
  const preferredTier = tierForAreaWeeks(weeksKept);
  const library = (config.suggestions ?? []).filter(
    (s) => s.isActive && s.categoryId === categoryId,
  );
  const pool =
    library.length > 0
      ? library
      : universalFallbacks(categoryId, areaName, args.quickAdd);

  const ranked = [...pool].sort((a, b) => {
    const aDist = Math.abs(tierRank(a.tier) - tierRank(preferredTier));
    const bDist = Math.abs(tierRank(b.tier) - tierRank(preferredTier));
    if (aDist !== bDist) return aDist - bDist;
    return keepRate(b) - keepRate(a);
  });

  // The first three cover one tier each so the default view spans easy →
  // hard; the rest follow and the sheet keeps them behind "More ideas".
  // Trimming the library outright would punish a user who knows exactly what
  // they want, so the extra options are deferred rather than deleted.
  const chosen: PactSuggestion[] = [];
  const seenTiers = new Set<PactSizeTier>();
  for (const entry of ranked) {
    if (chosen.length >= PRIMARY_OPTIONS) break;
    if (seenTiers.has(entry.tier) && ranked.length > 3) continue;
    seenTiers.add(entry.tier);
    chosen.push(entry);
  }
  for (const entry of ranked) {
    if (chosen.length >= MAX_OPTIONS) break;
    if (!chosen.includes(entry)) chosen.push(entry);
  }

  const options = chosen.map((entry) => suggestionToOption(entry, config));

  if (lastPact && lastPact.status === 'kept') {
    const repeat: PactOption = {
      id: `repeat-${lastPact.pactId}`,
      text: lastPact.commitmentText,
      days: lastPact.days,
      startTime: lastPact.startTime,
      tier: lastPact.tier,
      tierLabel: PACT_SIZE_LABEL[lastPact.tier],
      taskCount: new Set(lastPact.days).size,
      rewardFlies: optionRewardFlies(config, lastPact.days, lastPact.tier),
      scheduleLabel: scheduleLabel(lastPact.days, lastPact.startTime),
      source: 'repeat',
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

function lastActivityKeyForArea(
  tasks: TaskDoc[],
  tagIds: string[],
  timezone: string,
): string | null {
  if (tagIds.length === 0) return null;
  const wanted = new Set(tagIds);
  let latest: string | null = null;
  for (const task of tasks) {
    const matches =
      task.focusAreaId && tagIds.length
        ? false
        : (task.tags ?? []).some((tagId) => wanted.has(tagId));
    if (!matches) continue;
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

export async function syncPactProgress(args: {
  pact: PactDoc;
  tasks: TaskDoc[];
  timezone: string;
}): Promise<number> {
  const { pact, tasks, timezone } = args;
  const ids = new Set(pact.taskIds ?? []);
  if (ids.size === 0) return pact.progress ?? 0;
  const weekEnd = shiftYMD(pact.weekKey, 6);
  let done = 0;
  for (const task of tasks) {
    if (!ids.has(task.id)) continue;
    for (const occurrence of task.completedDates ?? []) {
      const stamp = task.completedAtByDate?.[occurrence];
      const key = stamp
        ? getZonedYMD(stamp instanceof Date ? stamp : new Date(stamp), timezone)
        : occurrence;
      if (key >= pact.weekKey && key <= weekEnd) done += 1;
    }
  }
  return Math.min(pact.target, done);
}

export function shieldCapFor(config: PactConfigDoc, isPremium: boolean) {
  const cap = isPremium ? config.shieldCapPlus : config.shieldCapFree;
  return Math.max(0, Number(cap ?? (isPremium ? 2 : 1)));
}

/**
 * Ads for one shield. Priced off lifetime rescues rather than the current
 * streak: someone who leans on rescues pays more each time, while a long
 * clean streak that finally slips still pays the base.
 */
export function shieldAdsRequiredFor(
  config: PactConfigDoc,
  rescuesUsed: number,
) {
  const base = Math.max(1, Number(config.shieldAdsRequired ?? 1));
  if (rescuesUsed >= 6) return base + 2;
  if (rescuesUsed >= 2) return base + 1;
  return base;
}

export function refreshMonthlyAllowances(
  streak: PactStreakState,
  config: PactConfigDoc,
  isPremium: boolean,
  todayKey: string,
): PactStreakState {
  const month = monthKeyFor(todayKey);
  const next = { ...streak };
  // Shields are held stock, not a monthly grant: refills are earned by kept
  // weeks, bought with flies, or watched for. A monthly top-up handed Plus a
  // shield for every week of the month, which is immunity, not a safety net.
  next.shields = Math.min(next.shields, shieldCapFor(config, isPremium));
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

  for (const pact of ordered) {
    const progress = await syncPactProgress({ pact, tasks, timezone });
    const kept = progress >= pact.target;
    let usedShield = false;

    // Two rescued weeks in a row would let someone who finishes nothing hold
    // a twelve-week streak, so a rescue always has to be followed by a week
    // actually kept. Zero progress is never rescuable either.
    const rescuedLastWeek =
      next.shieldRescueWeek === shiftYMD(pact.weekKey, -7);
    if (
      !kept &&
      !pact.shieldUsed &&
      next.shields > 0 &&
      progress > 0 &&
      !rescuedLastWeek
    ) {
      next.shields -= 1;
      next.shieldRescueWeek = pact.weekKey;
      next.shieldRescues += 1;
      usedShield = true;
    }

    const survives = kept || usedShield;
    if (survives) {
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
    } else {
      next.weeks = 0;
    }

    if (survives) {
      pact.streakWeek = next.weeks;
      pact.areaWeek = next.areaWeeks[pact.categoryId];
    }

    // Shields are earned by the behaviour they protect: every Nth week you
    // actually keep hands one back, up to the cap. Rescued weeks earn nothing.
    const earnEvery = Math.max(0, Number(args.config.shieldEarnEveryWeeks ?? 0));
    if (kept && earnEvery > 0 && next.weeks % earnEvery === 0) {
      next.shields = Math.min(
        next.shields + 1,
        shieldCapFor(args.config, isPremium),
      );
    }

    // Only a genuinely finished week pays; a shield rescues the streak, not
    // the reward — otherwise missing the work would still earn the flies.
    if (kept && !pact.claimedAt && userDoc) {
      const summary = applyPactRewards({
        user: userDoc,
        config: args.config,
        pact,
        streakWeeks: next.weeks,
        areaWeeks: next.areaWeeks[pact.categoryId] ?? 1,
        isPremium,
      });
      autoGrantedFlies += summary.fliesGranted;
      pact.claimedAt = new Date();
    }

    pact.progress = progress;
    pact.status = kept ? 'kept' : usedShield ? 'kept' : 'missed';
    pact.shieldUsed = usedShield;
    pact.settledAt = new Date();
    if (kept && !pact.completedAt) pact.completedAt = new Date();
    await pact.save();
  }

  if (!isPremium && autoGrantedFlies > 0) {
    next.forgoneFlies += autoGrantedFlies;
  }

  if (userDoc) {
    (userDoc as any).set('quests.pactStreak', next);
    await userDoc.save();
  } else {
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'quests.pactStreak': next } },
    );
  }
  return next;
}

/**
 * The nearest unclaimed rung — whichever of the overall streak ladder or this
 * area's mastery ladder the user will reach first. Showing one near goal beats
 * showing the whole ladder: the pull comes from a target within reach.
 */
function nextMilestoneFor(args: {
  config: PactConfigDoc;
  streak: PactStreakState;
  categoryId?: string;
  categoryName?: string;
}): PactMilestone | null {
  const { config, streak, categoryId, categoryName } = args;
  const areaWeeks = categoryId ? streak.areaWeeks[categoryId] ?? 0 : 0;

  const streakNext = (config.streakTiers ?? [])
    .filter((tier) => tier.weeks > streak.weeks)
    .sort((a, b) => a.weeks - b.weeks)[0];
  const masteryNext = categoryId
    ? (config.masteryTiers ?? [])
        .filter((tier) => tier.weeks > areaWeeks)
        .sort((a, b) => a.weeks - b.weeks)[0]
    : undefined;

  const streakToGo = streakNext ? streakNext.weeks - streak.weeks : Infinity;
  const masteryToGo = masteryNext ? masteryNext.weeks - areaWeeks : Infinity;
  if (streakToGo === Infinity && masteryToGo === Infinity) return null;

  if (masteryToGo < streakToGo && masteryNext) {
    return {
      kind: 'mastery',
      weeks: masteryNext.weeks,
      weeksDone: areaWeeks,
      rewards: masteryNext.rewards ?? [],
      areaName: categoryName,
    };
  }
  return streakNext
    ? {
        kind: 'streak',
        weeks: streakNext.weeks,
        weeksDone: streak.weeks,
        rewards: streakNext.rewards ?? [],
      }
    : null;
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

  const [user, tasks, categories] = await Promise.all([
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

  const activeDoc =
    (await PactModel.findOne({ userId, weekKey: currentWeek })) ??
    (planningWeek !== currentWeek
      ? await PactModel.findOne({ userId, weekKey: planningWeek })
      : null);
  let active: ActivePactView | null = null;
  if (activeDoc && activeDoc.status !== 'skipped') {
    const progress = await syncPactProgress({
      pact: activeDoc,
      tasks,
      timezone,
    });
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
      rewardFlies: optionRewardFlies(config, activeDoc.days, activeDoc.tier),
      daysLeft: Math.max(0, daysBetween(todayKey, weekEnd)),
      shieldUsed: activeDoc.shieldUsed,
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

  const areas: PactAreaChoice[] = selectedIds
    .map((categoryId): PactAreaChoice | null => {
      const category = categories.find((c) => c.categoryId === categoryId);
      if (!category) return null;
      const tagIds = tagMap.get(categoryId) ?? [];
      const lastActivity = lastActivityKeyForArea(tasks, tagIds, timezone);
      const lastPactWeek = streak.areaLastWeek[categoryId] ?? '';
      const reference = [lastActivity, lastPactWeek].filter(Boolean).sort().pop();
      return {
        categoryId,
        name: category.name,
        shortLabel: category.shortLabel || category.name,
        accent: category.accent,
        coverImageUrl: category.coverImageUrl,
        backgroundFrom: category.backgroundFrom,
        backgroundTo: category.backgroundTo,
        quietDays: reference ? Math.max(0, daysBetween(reference, todayKey)) : null,
        streakWeeks: streak.areaWeeks[categoryId] ?? 0,
        weeksKept: streak.areaWeeks[categoryId] ?? 0,
        recommended: false,
        hasTag: tagIds.length > 0,
      };
    })
    .filter((entry): entry is PactAreaChoice => !!entry);

  areas.sort((a, b) => {
    const aQuiet = a.quietDays ?? 999;
    const bQuiet = b.quietDays ?? 999;
    return bQuiet - aQuiet;
  });
  if (areas.length > 0) areas[0].recommended = true;

  const shieldCap = shieldCapFor(config, isPremium);
  const flyBalance = Math.max(0, Number((user as any)?.wardrobe?.flies) || 0);
  const shieldPriceFlies = Math.max(1, Number(config.shieldPriceFlies ?? 100));
  const roomForShield = streak.shields < shieldCap;
  const streakView: PactStreakView = {
    weeks: streak.weeks,
    best: streak.best,
    shields: streak.shields,
    shieldCap,
    shieldPriceFlies,
    shieldAdsRequired: shieldAdsRequiredFor(config, streak.shieldRescues),
    canBuyShield: roomForShield && flyBalance >= shieldPriceFlies,
    // Never for Plus — not paying to watch ads is part of what Plus is.
    canEarnShieldWithAd:
      !isPremium &&
      roomForShield &&
      streak.weeks >= Math.max(0, Number(config.shieldAdMinStreak ?? 0)),
    rescueOnCooldown:
      !!streak.shieldRescueWeek &&
      streak.shieldRescueWeek === shiftYMD(currentWeek, -7),
    atRisk:
      !!active &&
      active.progress < active.target &&
      active.daysLeft <= 1 &&
      streak.weeks > 0,
  };

  return {
    enabled: config.isActive,
    weekKey: currentWeek,
    weekLabel: weekLabel(currentWeek),
    pickOpen:
      !active &&
      isPickWindowOpen(),
    daysLeftInWeek: Math.max(0, daysBetween(todayKey, shiftYMD(currentWeek, 6))),
    active,
    areas,
    streak: streakView,
    isPremium,
    canWriteOwn: isPremium,
    swapTokens: streak.swapTokens,
    introSeen: streak.introSeen,
    needsAreas: areas.length === 0,
    weekStartsOn,
    flyRates: {
      perTask: Math.max(1, config.fliesPerCompletion),
      weekBonus: Math.max(0, config.weekBonusFlies),
      pushBonus: Math.max(0, config.bigCommitmentBonusFlies),
    },
    completionRewards: config.completionRewards ?? [],
    forgoneFlies: streak.forgoneFlies,
    nextMilestone: nextMilestoneFor({
      config,
      streak,
      categoryId: active?.categoryId ?? areas[0]?.categoryId,
      categoryName: active?.categoryName ?? areas[0]?.shortLabel,
    }),
    rewardCatalog: buildRewardCatalog(await getFullCatalog(), [
      config.completionRewards ?? [],
      config.milestoneRewards ?? [],
      ...(config.streakTiers ?? []).map((tier) => tier.rewards ?? []),
      ...(config.masteryTiers ?? []).map((tier) => tier.rewards ?? []),
    ]),
  };
}

export async function getAreaOptions(args: {
  userId: string;
  categoryId: string;
  timezone: string;
}): Promise<PactOption[]> {
  const { userId, categoryId } = args;
  await connectMongo();
  const config = await ensurePactConfig();
  const [user, categories, lastPact] = await Promise.all([
    UserModel.findById(userId).select('quests').lean<UserDoc | null>(),
    loadCategories(),
    PactModel.findOne({ userId, categoryId }).sort({ weekKey: -1 }).lean<PactDoc>(),
  ]);
  const streak = normalizePactStreak(user);
  const category = categories.find((c) => c.categoryId === categoryId);
  return buildOptionsForArea({
    config,
    categoryId,
    areaName: category?.shortLabel || category?.name || 'this area',
    weeksKept: streak.areaWeeks[categoryId] ?? 0,
    quickAdd: (category?.quickAddSuggestions ?? [])
      .map((entry) => entry?.text?.trim())
      .filter((text): text is string => !!text),
    lastPact,
  });
}

export function newPactId() {
  return uuid();
}
