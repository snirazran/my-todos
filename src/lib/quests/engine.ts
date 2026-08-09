import QuestModel, { type QuestDoc } from '@/lib/models/Quest';
import QuestTemplateModel, {
  type QuestTemplateDoc,
} from '@/lib/models/QuestTemplate';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import QuestCategoryModel, { type QuestCategoryDoc } from '@/lib/models/QuestCategory';
import FriendshipModel from '@/lib/models/Friendship';
import connectMongo from '@/lib/mongoose';
import type { UserDoc } from '@/lib/types/UserDoc';
import { TRADE_ITEM_COUNT, type ItemDef } from '@/lib/skins/catalog';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { loadBackgroundPrizes } from '@/lib/skins/gifts';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  isTagScopedQuestMetric,
  loadQuestCounters,
  parseTaskStreakDays,
  sumCounters,
  sumCountersForTags,
  taskStreakMetric,
  type QuestCounterEntry,
} from './metrics';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipePoolEntry,
  type RecipeSlot,
} from '@/lib/models/QuestRecipe';
import { ensureDefaultQuestRecipe } from './recipeDefaults';
import { ensureDefaultOnboardingTemplates } from './onboardingQuests';
import type {
  CategoryQuestProgressView,
  DailyQuestProgressView,
  FocusCategoryTagMap,
  FocusProfile,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestLogicBlock,
  QuestLogicType,
  QuestPlacement,
  QuestProgressView,
  QuestReward,
  QuestRewards,
  QuestSubject,
  QuestTemplateView,
  QuestVisibilityCondition,
  ResolvedQuestLogicBlock,
} from './types';

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function byTemplateOrder(a: QuestTemplateDoc, b: QuestTemplateDoc) {
  if (a.placement !== b.placement) {
    return a.placement.localeCompare(b.placement);
  }

  return (
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function isPremiumUser(user: UserDoc) {
  return user.premiumUntil ? new Date(user.premiumUntil) > new Date() : false;
}

export function normalizeFocusProfile(user: UserDoc): FocusProfile {
  return {
    completedAt: user.focusProfile?.completedAt ?? null,
    selectedCategoryIds: user.focusProfile?.selectedCategoryIds ?? [],
    categoryTagMap: user.focusProfile?.categoryTagMap ?? [],
    suggestedContentCreatedAt:
      user.focusProfile?.suggestedContentCreatedAt ?? null,
    unlockedAnimationIds: user.focusProfile?.unlockedAnimationIds ?? [],
    areaQuestsUnlockedAt: user.focusProfile?.areaQuestsUnlockedAt ?? null,
    activeFocusCategoryId: user.focusProfile?.activeFocusCategoryId ?? null,
    rentedFocus: user.focusProfile?.rentedFocus ?? null,
  };
}

export const RENT_SLOT_ADS_REQUIRED = 1;
export const RENT_SLOT_DURATION_MS = 24 * 60 * 60 * 1000;
export const DAILY_QUESTS_UNLOCK_STEP_TARGET = 5;

export function activeRentedFocusCategoryId(
  profile: FocusProfile,
  now: Date = new Date(),
): string | null {
  const rented = profile.rentedFocus;
  if (!rented?.categoryId || !rented.expiresAt) return null;
  if (new Date(rented.expiresAt) <= now) return null;
  if (!(profile.selectedCategoryIds ?? []).includes(rented.categoryId)) {
    return null;
  }
  return rented.categoryId;
}

// The set of focus categories a user may progress right now; null means all
// (premium). Free users get their active focus plus an unexpired rental.
export function resolveUnlockedFocusCategoryIds(
  profile: FocusProfile,
  isPremium: boolean,
  now: Date = new Date(),
): string[] | null {
  if (isPremium) return null;
  const ids: string[] = [];
  const active = resolveActiveFocusCategoryId(profile, false);
  if (active) ids.push(active);
  const rented = activeRentedFocusCategoryId(profile, now);
  if (rented && rented !== active) ids.push(rented);
  return ids;
}

// The single focus category a free user is actively progressing. Premium users
// progress every focus in parallel, so this returns null for them. Falls back
// to the first selected category when no valid choice is stored.
export function resolveActiveFocusCategoryId(
  profile: FocusProfile,
  isPremium: boolean,
): string | null {
  if (isPremium) return null;
  const selected = profile.selectedCategoryIds ?? [];
  if (selected.length === 0) return null;
  const chosen = profile.activeFocusCategoryId;
  if (chosen && selected.includes(chosen)) return chosen;
  return selected[0];
}

function getUserTagId(tag: unknown) {
  if (!tag || typeof tag !== 'object') return null;
  const tagRecord = tag as { id?: unknown; name?: unknown };
  if (typeof tagRecord.id === 'string' && tagRecord.id.trim()) {
    return tagRecord.id.trim();
  }
  if (typeof tagRecord.name === 'string' && tagRecord.name.trim()) {
    return tagRecord.name.trim();
  }
  return null;
}

function getUserTagName(tag: unknown) {
  if (!tag || typeof tag !== 'object') return null;
  const tagRecord = tag as { id?: unknown; name?: unknown };
  if (typeof tagRecord.name === 'string' && tagRecord.name.trim()) {
    return tagRecord.name.trim();
  }
  if (typeof tagRecord.id === 'string' && tagRecord.id.trim()) {
    return tagRecord.id.trim();
  }
  return null;
}

function hasAnyTag(task: TaskDoc, tagIds?: string[]) {
  if (!tagIds?.length) return true;
  const taskTags = task.tags ?? [];
  return tagIds.some((tagId) => taskTags.includes(tagId));
}

// The day a completion counts for is the day it was ticked, not the day the
// occurrence was scheduled for — a task moved between days, or ticked ahead of
// time, must not move or duplicate the work it represents. Rows written before
// completedAtByDate existed fall back to the occurrence date.
function taskCompletionDates(task: TaskDoc, timezone: string) {
  const occurrences = new Set(task.completedDates ?? []);
  if (
    occurrences.size === 0 &&
    task.type === 'regular' &&
    task.completed &&
    task.date
  ) {
    occurrences.add(task.date);
  }
  const stamps = task.completedAtByDate ?? {};
  return Array.from(occurrences, (occurrence) => {
    const at = stamps[occurrence];
    if (!at) return occurrence;
    const parsed = at instanceof Date ? at : new Date(at);
    return isNaN(parsed.getTime()) ? occurrence : getZonedYMD(parsed, timezone);
  });
}

function matchesSubject(task: TaskDoc, subject: QuestSubject) {
  if (subject === 'any') return true;
  return (
    subject === 'task' &&
    (task.type === 'regular' || task.type === 'weekly' || task.type === 'backlog')
  );
}

function matchesLogicBlock(task: TaskDoc, block: QuestLogicBlock) {
  const effectiveSubject: QuestSubject =
    block.type === 'focus_minutes' ? 'task' : block.subject;
  if (!matchesSubject(task, effectiveSubject)) return false;
  const tagIds =
    block.tagMode === 'random_user_tag' &&
    'resolvedTagId' in block &&
    block.resolvedTagId
      ? [block.resolvedTagId]
      : block.tagMode === 'focus_category_tags' &&
          'resolvedTagIds' in block &&
          Array.isArray(block.resolvedTagIds)
        ? block.resolvedTagIds
        : undefined;
  if (
    (block.tagMode === 'random_user_tag' ||
      block.tagMode === 'focus_category_tags') &&
    (!tagIds || tagIds.length === 0)
  ) {
    return false;
  }
  if (!hasAnyTag(task, tagIds)) return false;
  return true;
}

function countAddedTasks(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.filter((task) => {
    if (!predicate(task) || !task.createdAt) return false;
    const createdDate = getZonedYMD(new Date(task.createdAt), timezone);
    return createdDate >= startDate && createdDate <= endDate;
  }).length;
}

function countCompletedEvents(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.reduce((sum, task) => {
    if (!predicate(task)) return sum;
    return (
      sum +
      taskCompletionDates(task, timezone).filter(
        (dateStr) => dateStr >= startDate && dateStr <= endDate,
      ).length
    );
  }, 0);
}

function sumFocusSeconds(
  tasks: TaskDoc[],
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.reduce((sum, task) => {
    if (!predicate(task)) return sum;
    return (
      sum +
      (task.frogodoroSessions ?? []).reduce((taskSum, session) => {
        if (session.date >= startDate && session.date <= endDate) {
          return taskSum + (session.focusTime ?? 0);
        }
        return taskSum;
      }, 0)
    );
  }, 0);
}

// Distinct local days in the window carrying at least one matching completion.
// Volume targets reward one heroic afternoon; this rewards showing up.
function countDistinctActiveDays(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  const days = new Set<string>();
  for (const task of tasks) {
    if (!predicate(task)) continue;
    for (const dateStr of taskCompletionDates(task, timezone)) {
      if (dateStr >= startDate && dateStr <= endDate) days.add(dateStr);
    }
  }
  return days.size;
}

// One unbroken sitting, which sumFocusSeconds cannot express: it adds every
// session in the window together, so six five-minute stints read the same as
// half an hour of actual depth.
function countDeepSessions(
  tasks: TaskDoc[],
  startDate: string,
  endDate: string,
  minimumMinutes: number,
  predicate: (task: TaskDoc) => boolean,
) {
  const threshold = Math.max(1, minimumMinutes) * 60;
  let count = 0;
  for (const task of tasks) {
    if (!predicate(task)) continue;
    for (const session of task.frogodoroSessions ?? []) {
      if (session.date < startDate || session.date > endDate) continue;
      if ((session.focusTime ?? 0) >= threshold) count += 1;
    }
  }
  return count;
}

function getZonedHour(at: Date, timezone: string): number | null {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(at);
    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Completions with a timestamp that lands before the cutoff hour. Rows written
// before completedAtByDate existed have no stamp and cannot qualify.
function countEarlyCompletions(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  beforeHour: number,
  predicate: (task: TaskDoc) => boolean,
) {
  let count = 0;
  for (const task of tasks) {
    if (!predicate(task)) continue;
    const stamps = task.completedAtByDate ?? {};
    for (const occurrence of task.completedDates ?? []) {
      const at = stamps[occurrence];
      if (!at) continue;
      const parsed = at instanceof Date ? at : new Date(at);
      if (isNaN(parsed.getTime())) continue;
      const dateStr = getZonedYMD(parsed, timezone);
      if (dateStr < startDate || dateStr > endDate) continue;
      const hour = getZonedHour(parsed, timezone);
      if (hour !== null && hour < beforeHour) count += 1;
    }
  }
  return count;
}

// An add credits only when the task it created is finished. Counting the
// completion rather than the creation is what stops "add" being a free reward
// for typing a title and never doing it.
function countFollowedThroughAdds(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.filter((task) => {
    if (!predicate(task) || !task.createdAt) return false;
    const createdDate = getZonedYMD(new Date(task.createdAt), timezone);
    if (createdDate < startDate || createdDate > endDate) return false;
    return taskCompletionDates(task, timezone).some(
      (dateStr) => dateStr >= startDate && dateStr <= endDate,
    );
  }).length;
}

// Rolled fly amounts and focus-minute targets land on multiples of 5 (10, 15,
// 20…) so rewards never read as odd values like 49. Falls back to the raw roll
// when the admin range contains no multiple of 5.
function snapToFiveInRange(value: number, min: number, max: number): number {
  const lo = Math.ceil(min / 5) * 5;
  const hi = Math.floor(max / 5) * 5;
  if (lo > hi) return value;
  const snapped = Math.round(value / 5) * 5;
  return Math.min(hi, Math.max(lo, snapped));
}

const BASELINE_LOOKBACK_DAYS = 14;
const BASELINE_MIN_OBSERVED_DAYS = 3;
// A scale low enough to flatten the ladder defeats the point of having tiers,
// so the floor stays well above zero and the cold-start case opts out entirely
// rather than bottoming out.
const BASELINE_MIN_SCALE = 0.6;
const BASELINE_MAX_SCALE = 1.6;
const BASELINE_MIN_COMPLETIONS = 4;
const BASELINE_MIN_FOCUS_MINUTES = 20;

// Below these an objective stops meaning what its name says: "show up on 1
// day" is just "complete a task", and a one-minute focus target is noise.
const TYPE_MIN_TARGET: Partial<Record<QuestLogicType, number>> = {
  distinct_days: 2,
  focus_minutes: 10,
};

// Recipe ladders are authored for a user doing roughly this much in the tagged
// area each day. A user's own trailing rate is divided by these to get the
// scale their targets roll at, so the admin's ladder shape survives while the
// numbers land where that user can actually reach them.
const BASELINE_REFERENCE = {
  completionsPerDay: 4,
  focusMinutesPerDay: 35,
  activeDayFraction: 0.8,
} as const;

export type QuestBaseline = {
  completionsPerDay: number;
  focusMinutesPerDay: number;
  activeDayFraction: number;
};

const NEUTRAL_BASELINE: QuestBaseline = {
  completionsPerDay: BASELINE_REFERENCE.completionsPerDay,
  focusMinutesPerDay: BASELINE_REFERENCE.focusMinutesPerDay,
  activeDayFraction: BASELINE_REFERENCE.activeDayFraction,
};

// Trailing tagged rate, measured over closed days only so a target cannot
// shift under the user partway through the day it was rolled on.
function computeQuestBaseline(args: {
  tasks: TaskDoc[];
  timezone: string;
  todayKey: string;
  tagIds?: string[];
  focusCategoryId?: string;
  accountCreatedAt?: Date | null;
}): QuestBaseline {
  const { tasks, timezone, todayKey, tagIds, focusCategoryId } = args;
  const startKey = shiftDateKey(todayKey, -BASELINE_LOOKBACK_DAYS);
  const endKey = shiftDateKey(todayKey, -1);

  let observedDays = BASELINE_LOOKBACK_DAYS;
  const createdAt = args.accountCreatedAt;
  if (createdAt) {
    const createdKey = getZonedYMD(new Date(createdAt), timezone);
    if (createdKey > startKey) {
      let days = 0;
      let cursor = endKey;
      while (cursor >= createdKey && days < BASELINE_LOOKBACK_DAYS) {
        days += 1;
        cursor = shiftDateKey(cursor, -1);
      }
      observedDays = days;
    }
  }
  observedDays = Math.max(BASELINE_MIN_OBSERVED_DAYS, observedDays);

  const matches = (task: TaskDoc) => {
    if (task.type === 'focus-area') {
      return focusCategoryId ? task.focusAreaId === focusCategoryId : true;
    }
    return hasAnyTag(task, tagIds);
  };

  const activeDays = new Set<string>();
  let completions = 0;
  for (const task of tasks) {
    if (!matches(task)) continue;
    for (const dateKey of taskCompletionDates(task, timezone)) {
      if (dateKey < startKey || dateKey > endKey) continue;
      completions += 1;
      activeDays.add(dateKey);
    }
  }

  const focusMinutes =
    sumFocusSeconds(tasks, startKey, endKey, matches) / 60;

  // Too thin a sample to personalise from. A brand-new focus area has no
  // tagged history, and scaling off that would floor every tier of the ladder
  // at once — the author's numbers are the better guess until there is signal.
  if (
    completions < BASELINE_MIN_COMPLETIONS &&
    focusMinutes < BASELINE_MIN_FOCUS_MINUTES
  ) {
    return NEUTRAL_BASELINE;
  }

  return {
    completionsPerDay: completions / observedDays,
    focusMinutesPerDay: focusMinutes / observedDays,
    activeDayFraction: activeDays.size / observedDays,
  };
}

function baselineScaleForBlock(
  block: QuestLogicBlock,
  baseline: QuestBaseline,
): number {
  // Streak lengths and one-shot app actions are calendar facts, not volume —
  // scaling them would change what the objective means. A deep session's whole
  // point is its length, so only its count could scale, and a count of one is
  // already the floor.
  if (block.type === 'metric_count' || block.type === 'deep_session') return 1;
  const ratio =
    block.type === 'focus_minutes'
      ? baseline.focusMinutesPerDay / BASELINE_REFERENCE.focusMinutesPerDay
      : block.type === 'distinct_days'
        ? baseline.activeDayFraction / BASELINE_REFERENCE.activeDayFraction
        : baseline.completionsPerDay / BASELINE_REFERENCE.completionsPerDay;
  if (!Number.isFinite(ratio)) return 1;
  // A day count is capped by the window, so scaling it up only ever collides
  // with the ceiling and makes two tiers ask the same thing.
  const ceiling =
    block.type === 'distinct_days' ? 1 : BASELINE_MAX_SCALE;
  return Math.min(ceiling, Math.max(BASELINE_MIN_SCALE, ratio));
}

function resolveLogicTarget(
  block: QuestLogicBlock,
  seed: string,
  baseline: QuestBaseline = NEUTRAL_BASELINE,
  windowDays?: number,
) {
  if (block.amountMode === 'fixed') {
    return Math.max(1, block.amount ?? 1);
  }

  const min = Math.max(1, Math.min(block.minAmount ?? 1, block.maxAmount ?? 1));
  const max = Math.max(min, block.maxAmount ?? min);
  const rng = createSeededRandom(seed);
  const rolled = Math.floor(rng() * (max - min + 1)) + min;
  const scale = baselineScaleForBlock(block, baseline);
  const floor = TYPE_MIN_TARGET[block.type] ?? 1;
  const scaled = Math.max(floor, Math.round(rolled * scale));
  if (block.type === 'focus_minutes') {
    return Math.max(floor, Math.round(scaled / 5) * 5);
  }
  // You cannot show up on more days than the window has.
  if (block.type === 'distinct_days' && windowDays) {
    return Math.min(Math.max(1, Math.floor(windowDays)), scaled);
  }
  return scaled;
}

// Scaling each tier independently can collapse a ladder: two tiers of the same
// kind that were authored 2 and 3 both land on 1, and the board shows the same
// objective twice at different rewards. This restores the authored ordering
// after scaling, without undoing the scale itself.
function enforceLadderShape(
  blocks: ResolvedQuestLogicBlock[],
  windowDays: number,
): void {
  const signature = (block: ResolvedQuestLogicBlock) =>
    [
      block.type,
      block.action ?? '',
      block.metricKey ?? '',
      block.sessionMinutes ?? '',
      block.beforeHour ?? '',
      block.requiresFollowThrough ? 'follow' : '',
    ].join('|');

  const groups = new Map<string, ResolvedQuestLogicBlock[]>();
  for (const block of blocks) {
    if (block.amountMode !== 'random') continue;
    const key = signature(block);
    const group = groups.get(key);
    if (group) group.push(block);
    else groups.set(key, [block]);
  }

  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;
    const ceiling =
      group[0].type === 'distinct_days'
        ? Math.max(1, Math.floor(windowDays))
        : Number.MAX_SAFE_INTEGER;
    for (let i = 1; i < group.length; i += 1) {
      const previous = group[i - 1];
      const current = group[i];
      // Only tiers the author meant to escalate are pushed apart.
      const authoredHigher =
        (current.minAmount ?? 0) > (previous.minAmount ?? 0);
      if (!authoredHigher) continue;
      if (current.target <= previous.target) {
        current.target = Math.min(ceiling, previous.target + 1);
      }
    }
  }
}

function resolveRewardAmount(reward: QuestReward, seed: string) {
  const amountMode = reward.amountMode ?? 'fixed';
  if (amountMode === 'fixed') {
    return Math.max(1, reward.amount ?? 1);
  }

  const min = Math.max(1, Math.min(reward.minAmount ?? 1, reward.maxAmount ?? 1));
  const max = Math.max(min, reward.maxAmount ?? min);
  const rng = createSeededRandom(seed);
  const rolled = Math.floor(rng() * (max - min + 1)) + min;
  return snapToFiveInRange(rolled, min, max);
}

function progressForLogicBlock(args: {
  block: ResolvedQuestLogicBlock;
  tasks: TaskDoc[];
  timezone: string;
  startDate: string;
  endDate: string;
  counters?: QuestCounterEntry[];
  focusCategoryId?: string;
}) {
  const { block, tasks, timezone, startDate, endDate, counters, focusCategoryId } = args;

  if (block.type === 'metric_count') {
    if (!block.metricKey) return 0;
    if (
      block.tagMode === 'focus_category_tags' &&
      isTagScopedQuestMetric(block.metricKey)
    ) {
      return sumCountersForTags(
        counters ?? [],
        block.metricKey,
        startDate,
        endDate,
        block.resolvedTagIds ?? [],
      );
    }
    return sumCounters(counters ?? [], block.metricKey, startDate, endDate);
  }

  if (block.type === 'focus_minutes') {
    return Math.floor(
      sumFocusSeconds(tasks, startDate, endDate, (task) => {
        if (task.type !== 'focus-area') return matchesLogicBlock(task, block);
        if (focusCategoryId) return task.focusAreaId === focusCategoryId;
        const scopedTags =
          block.tagMode === 'random_user_tag' && block.resolvedTagId
            ? [block.resolvedTagId]
            : block.tagMode === 'focus_category_tags'
              ? block.resolvedTagIds
              : undefined;
        return scopedTags ? hasAnyTag(task, scopedTags) : true;
      }) / 60,
    );
  }

  if (block.type === 'distinct_days') {
    return countDistinctActiveDays(tasks, timezone, startDate, endDate, (task) =>
      matchesLogicBlock(task, block),
    );
  }

  if (block.type === 'deep_session') {
    return countDeepSessions(
      tasks,
      startDate,
      endDate,
      block.sessionMinutes ?? 25,
      (task) => {
        if (task.type !== 'focus-area') return matchesLogicBlock(task, block);
        if (focusCategoryId) return task.focusAreaId === focusCategoryId;
        return block.tagMode === 'focus_category_tags'
          ? hasAnyTag(task, block.resolvedTagIds)
          : true;
      },
    );
  }

  if (block.action === 'add') {
    const predicate = (task: TaskDoc) =>
      !task.isStarter && matchesLogicBlock(task, block);
    return block.requiresFollowThrough
      ? countFollowedThroughAdds(tasks, timezone, startDate, endDate, predicate)
      : countAddedTasks(tasks, timezone, startDate, endDate, predicate);
  }

  if (typeof block.beforeHour === 'number') {
    return countEarlyCompletions(
      tasks,
      timezone,
      startDate,
      endDate,
      block.beforeHour,
      (task) => matchesLogicBlock(task, block),
    );
  }

  return countCompletedEvents(tasks, timezone, startDate, endDate, (task) =>
    matchesLogicBlock(task, block),
  );
}

function sanitizeReward(reward: QuestReward) {
  const next: QuestReward = {
    type: reward.type,
  };
  if (typeof reward.amount === 'number') next.amount = reward.amount;
  if (reward.amountMode) next.amountMode = reward.amountMode;
  if (typeof reward.minAmount === 'number') next.minAmount = reward.minAmount;
  if (typeof reward.maxAmount === 'number') next.maxAmount = reward.maxAmount;
  if (reward.itemId) next.itemId = reward.itemId;
  if (reward.backgroundId) next.backgroundId = reward.backgroundId;
  return next;
}

function isSupportedReward(reward: { type?: string }): reward is QuestReward {
  return (
    reward.type === 'FLIES' ||
    reward.type === 'ITEM' ||
    reward.type === 'BOX' ||
    reward.type === 'BACKGROUND'
  );
}

function sanitizeRewardSet(rewards: unknown): QuestRewards {
  if (!Array.isArray(rewards)) return [];
  return rewards
    .filter((reward): reward is QuestReward => isSupportedReward(reward as { type?: string }))
    .map(sanitizeReward);
}

function resolveReward(reward: QuestReward, seed: string): QuestReward {
  if (reward.type === 'FLIES') {
    return {
      type: 'FLIES',
      amount: resolveRewardAmount(reward, seed),
    };
  }

  return sanitizeReward(reward);
}

function buildVisibilityMetrics(
  user: UserDoc,
  tasks: TaskDoc[],
  todayKey: string,
) {
  return {
    daily_tasks_count: tasks.filter(
      (task) => task.type === 'regular' && task.date === todayKey,
    ).length,
    tags_count: user.tags?.length ?? 0,
  };
}

function matchesVisibilityConditions(
  conditions: QuestVisibilityCondition[] | undefined,
  metrics: ReturnType<typeof buildVisibilityMetrics>,
) {
  if (!conditions?.length) return true;

  return conditions.every((condition) => {
    const current = metrics[condition.metric];
    if (condition.operator === 'gt') return current > condition.value;
    return current < condition.value;
  });
}

type RewardCatalogBackground = {
  id: string;
  name: string;
  rarity: ItemDef['rarity'];
  imageUrl?: string;
};

function buildRewardCatalog(
  catalog: ItemDef[],
  rewardSets: QuestRewards[],
  backgrounds: RewardCatalogBackground[] = [],
) {
  const itemIds = new Set<string>();
  const backgroundIds = new Set<string>();
  rewardSets.forEach((set) => {
    set.forEach((reward) => {
      if (reward.itemId) itemIds.add(reward.itemId);
      if (reward.backgroundId) backgroundIds.add(reward.backgroundId);
    });
  });

  const entries: [string, Record<string, unknown>][] = catalog
    .filter((item) => itemIds.has(item.id))
    .map((item) => [item.id, item]);

  backgrounds
    .filter((bg) => backgroundIds.has(bg.id))
    .forEach((bg) =>
      entries.push([
        bg.id,
        {
          id: bg.id,
          name: bg.name,
          slot: 'background',
          rarity: bg.rarity,
          riveIndex: 0,
          imageUrl: bg.imageUrl,
        },
      ]),
    );

  return Object.fromEntries(entries);
}

function categoryDocToDefinition(doc: QuestCategoryDoc): MacroCategoryDefinition {
  return {
    id: doc.categoryId,
    name: doc.name,
    shortLabel: doc.shortLabel,
    description: doc.description,
    onboardingSentence: doc.onboardingSentence,
    coverImageUrl: doc.coverImageUrl,
    accent: doc.accent,
    backgroundFrom: doc.backgroundFrom,
    backgroundTo: doc.backgroundTo,
    taskSuggestions: [],
    campaignHeadlines: [],
    durationDaysOptions: [],
    premiumAnimationId: '',
  };
}

function templateToView(doc: QuestTemplateDoc): QuestTemplateView {
  return {
    id: doc.templateId,
    name: doc.name,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    placement: doc.placement,
    categoryId: doc.categoryId,
    durationMinutes:
      doc.placement === 'category' && doc.durationMinutes && doc.durationMinutes > 0
        ? doc.durationMinutes
        : undefined,
    logic: doc.logic,
    visibilityConditions: doc.visibilityConditions ?? [],
    isActive: doc.isActive,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

function questDocToView(doc: QuestDoc): QuestProgressView {
  const completed = doc.progress >= doc.target;
  const claimed = !!doc.claimedAt;
  return {
    id: doc.questId,
    templateId: doc.templateId,
    placement: doc.placement,
    categoryId: doc.categoryId,
    windowKey: doc.windowKey,
    title: doc.title,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    durationMinutes: doc.durationMinutes,
    startedAt: doc.startedAt?.toISOString(),
    expiresAt: doc.expiresAt?.toISOString(),
    lastProgressAt: (doc.lastProgressAt ?? doc.createdAt)?.toISOString(),
    target: doc.target,
    progress: doc.progress,
    completed,
    claimable: completed && !claimed,
    claimed,
    logic: doc.logic,
    claimedObjectiveIds: doc.claimedObjectiveIds ?? [],
    carriedTiers: doc.carriedTiers ?? 0,
    rerollsLeft: doc.templateId.startsWith('gen:')
      ? Math.max(0, REROLLS_PER_LADDER - (doc.rerollsUsed ?? 0))
      : 0,
  };
}

// A recipe slot's rewards are OPTIONS, not a bundle: each roll grants exactly
// one of them, picked with the roll's seed.
function pickSlotReward(rewards: QuestRewards | undefined, seed: string) {
  const pool = rewards ?? [];
  if (pool.length <= 1) return pool;
  const rng = createSeededRandom(seed);
  return [pool[Math.floor(rng() * pool.length)]];
}

// Bonus rewards stack ON TOP of the base pick: each entry rolls independently
// with its own chance (1 = guaranteed), seeded so the outcome is stable for
// the lifetime of the roll.
function rollBonusRewards(
  bonusRewards: RecipeSlot['bonusRewards'],
  seed: string,
) {
  const granted: QuestReward[] = [];
  (bonusRewards ?? []).forEach((entry, index) => {
    if (!entry?.reward || !isSupportedReward(entry.reward)) return;
    const chance = Math.min(1, Math.max(0, entry.chance ?? 0));
    if (chance <= 0) return;
    if (createSeededRandom(`${seed}:${index}`)() < chance) {
      granted.push(sanitizeReward(entry.reward));
    }
  });
  return granted;
}

// Streak pool entries roll their day requirement from the admin-configured
// range; the rolled length is baked into the metric key (task_streak_N).
function resolveRecipeMetricKey(
  pick: { metricKey?: string; streakDaysMin?: number; streakDaysMax?: number },
  seed: string,
): string | undefined {
  if (!pick.metricKey?.startsWith('task_streak')) return pick.metricKey;
  const fallback = Number(pick.metricKey.match(/^task_streak_(\d+)$/)?.[1] ?? 3);
  const min = Math.max(2, Math.floor(pick.streakDaysMin ?? fallback));
  const max = Math.max(min, Math.floor(pick.streakDaysMax ?? min));
  const rng = createSeededRandom(seed);
  const days = Math.floor(rng() * (max - min + 1)) + min;
  return taskStreakMetric(days);
}

// Tiers a ladder must reach before the next roll starts with a head start,
// and how many it gets. Nunes & Drèze: a card with the first stamps already
// filled gets finished far more often than an equivalent empty one.
const CARRYOVER_EARNED_AFTER_TIERS = 3;
const CARRYOVER_TIERS_GRANTED = 1;

export const REROLLS_PER_LADDER = 1;

function tiersReached(quest: {
  logic?: ResolvedQuestLogicBlock[];
}): number {
  return (quest.logic ?? []).filter(
    (block) => (block.progress ?? 0) >= Math.max(1, block.target ?? 1),
  ).length;
}

function carryOverTiersFor(quest: { logic?: ResolvedQuestLogicBlock[] }): number {
  return tiersReached(quest) >= CARRYOVER_EARNED_AFTER_TIERS
    ? CARRYOVER_TIERS_GRANTED
    : 0;
}

function ladderEngaged(quest: QuestDoc): boolean {
  if ((quest.claimedObjectiveIds ?? []).length > 0) return true;
  if ((quest.rerollsUsed ?? 0) > 0) return true;
  return (quest.logic ?? []).some(
    (block) => !block.preCredited && (block.progress ?? 0) > 0,
  );
}

type LadderOutcome =
  | 'completed'
  | 'expired_attempted'
  | 'expired_untouched'
  | 'expired_locked';

// Where a ladder stopped, recorded once as it is replaced. Without this the
// stall points are invisible and target calibration is guesswork.
async function recordLadderOutcome(args: {
  userId: string;
  quest: QuestDoc;
  outcome: LadderOutcome;
  carriedTiers: number;
}): Promise<void> {
  const { quest, outcome } = args;
  const total = (quest.logic ?? []).length;
  if (total === 0) return;
  const reached = tiersReached(quest);
  const attempted = outcome === 'completed' || outcome === 'expired_attempted';
  try {
    await recordAnalyticsEvent({
      userId: args.userId,
      name: 'quest_ladder_finished',
      properties: {
        placement: quest.placement,
        category_id: quest.categoryId ?? 'uncategorized',
        template_id: quest.templateId,
        reason: outcome === 'completed' ? 'completed' : 'expired',
        outcome,
        attempted,
        tiers_total: total,
        tiers_reached: reached,
        tiers_claimed: (quest.claimedObjectiveIds ?? []).length,
        stalled_at_tier: !attempted || reached >= total ? null : reached + 1,
        stalled_objective_type:
          !attempted || reached >= total
            ? null
            : quest.logic?.[reached]?.type ?? null,
        rerolls_used: quest.rerollsUsed ?? 0,
        carried_in: quest.carriedTiers ?? 0,
        carried_out: args.carriedTiers,
      },
    });
  } catch (err) {
    console.error('recordLadderOutcome failed', err);
  }
}

// Pool-entry fields that shape what a rolled block asks for, rather than how
// much of it. Omitted entirely when unset so a block never carries a key the
// admin did not author.
function recipePickModifiers(pick: RecipePoolEntry): Partial<QuestLogicBlock> {
  const modifiers: Partial<QuestLogicBlock> = {};
  if (pick.type === 'deep_session') {
    modifiers.sessionMinutes = Math.max(1, Math.floor(pick.sessionMinutes ?? 25));
  }
  if (pick.type === 'count' && pick.action === 'add' && pick.requiresFollowThrough) {
    modifiers.requiresFollowThrough = true;
  }
  if (
    pick.type === 'count' &&
    (pick.action ?? 'complete') === 'complete' &&
    typeof pick.beforeHour === 'number'
  ) {
    modifiers.beforeHour = Math.min(23, Math.max(1, Math.floor(pick.beforeHour)));
  }
  return modifiers;
}

function shiftDateKey(dateKey: string, deltaDays: number) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

// Longest run a weekly task can still extend today: counts back from today
// when it is already ticked, otherwise from yesterday. Only weekly tasks are
// considered because only they bump the task_streak_N metric. Null means the
// user owns no task that could ever carry the streak.
function longestExtendableStreakRun(
  tasks: TaskDoc[],
  todayKey: string,
  tagIds?: string[],
): number | null {
  const wanted = tagIds?.length ? new Set(tagIds) : null;
  let best: number | null = null;
  for (const task of tasks) {
    if (task.type !== 'weekly') continue;
    if (wanted && !task.tags?.some((tagId) => wanted.has(tagId))) continue;
    const dates = new Set(task.completedDates ?? []);
    for (const late of task.lateCompletedDates ?? []) dates.delete(late);
    let day = dates.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
    let run = 0;
    while (dates.has(day)) {
      run += 1;
      day = shiftDateKey(day, -1);
    }
    if (best === null || run > best) best = run;
  }
  return best;
}

// "Close enough" margin for shop-dependent objectives: a normal day's free
// quest income, so the missing flies are earnable within the quest window.
const NEARLY_AFFORDABLE_FLIES = 10;

// Whether the user can act on a rolled pool entry right now: trading needs a
// full set of same-rarity skins (owned, or buyable with current flies plus a
// day's earnings), selling needs a duplicate, acquiring needs spending power
// or an unopened gift, and a task streak needs a weekly task whose run can
// still reach the required length before the window closes. Filtering these at
// roll time keeps dead objectives out of a user's quest.
function isPoolEntryEligible(args: {
  entry: RecipePoolEntry;
  placement: 'daily' | 'category';
  user: UserDoc;
  catalog: ItemDef[];
  tasks: TaskDoc[];
  todayKey: string;
  hasFriends: boolean;
  windowDays: number;
  tagIds?: string[];
}): boolean {
  const { entry, user, catalog, tasks, todayKey } = args;
  if (entry.type !== 'metric_count' || !entry.metricKey) return true;
  const metricKey = entry.metricKey;
  const inventory = user.wardrobe?.inventory ?? {};

  // Buddy objectives are dead weight for a user with no friends to buddy up
  // with — never roll them into a quest.
  if (metricKey === 'buddy_task_completed' && !args.hasFriends) return false;

  if (
    metricKey === 'trade_completed' ||
    metricKey === 'skin_sold' ||
    metricKey === 'skin_acquired'
  ) {
    if (catalog.length === 0) return false;
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const flies = user.wardrobe?.flies ?? 0;

    if (metricKey === 'trade_completed') {
      const ownedByRarity = new Map<string, number>();
      for (const [itemId, count] of Object.entries(inventory)) {
        const def = byId.get(itemId);
        if (!def || def.slot === 'container' || def.rarity === 'legendary') {
          continue;
        }
        ownedByRarity.set(
          def.rarity,
          (ownedByRarity.get(def.rarity) ?? 0) + Math.max(0, count ?? 0),
        );
      }
      if (
        Array.from(ownedByRarity.values()).some(
          (total) => total >= TRADE_ITEM_COUNT,
        )
      ) {
        return true;
      }
      const cheapestByRarity = new Map<string, number>();
      for (const item of catalog) {
        if (item.slot === 'container' || item.rarity === 'legendary') continue;
        const price = item.priceFlies ?? 0;
        if (price <= 0) continue;
        const prev = cheapestByRarity.get(item.rarity);
        if (prev === undefined || price < prev) {
          cheapestByRarity.set(item.rarity, price);
        }
      }
      return Array.from(cheapestByRarity.entries()).some(([rarity, price]) => {
        const missing = TRADE_ITEM_COUNT - (ownedByRarity.get(rarity) ?? 0);
        return flies + NEARLY_AFFORDABLE_FLIES >= missing * price;
      });
    }

    if (metricKey === 'skin_sold') {
      return Object.entries(inventory).some(([itemId, count]) => {
        const def = byId.get(itemId);
        return !!def && def.slot !== 'container' && (count ?? 0) >= 2;
      });
    }

    const hasUnopenedGift = Object.entries(inventory).some(([itemId, count]) => {
      const def = byId.get(itemId);
      return !!def && def.slot === 'container' && (count ?? 0) >= 1;
    });
    if (hasUnopenedGift) return true;
    const prices = catalog
      .filter((item) => item.slot !== 'container' && (item.priceFlies ?? 0) > 0)
      .map((item) => item.priceFlies ?? 0);
    return (
      prices.length > 0 &&
      flies + NEARLY_AFFORDABLE_FLIES >= Math.min(...prices)
    );
  }

  const fallbackDays = parseTaskStreakDays(metricKey);
  if (fallbackDays !== null) {
    const days = Math.max(
      2,
      Math.floor(entry.streakDaysMax ?? entry.streakDaysMin ?? fallbackDays),
    );
    const run = longestExtendableStreakRun(tasks, todayKey, args.tagIds);
    if (run === null) return false;
    return run + Math.max(1, args.windowDays) >= days;
  }

  return true;
}

// Eligible entries first; if none remain, fall back to the slot's universal
// (task/focus) entries so a slot never vanishes from the quest.
function buildEligiblePool(args: {
  slot: RecipeSlot;
  placement: 'daily' | 'category';
  user: UserDoc;
  catalog: ItemDef[];
  tasks: TaskDoc[];
  todayKey: string;
  hasFriends: boolean;
  windowDays: number;
  tagIds?: string[];
}): RecipePoolEntry[] {
  const base = (args.slot.pool ?? []).filter(
    (entry) => entry && Math.floor(entry.minTarget) > 0,
  );
  const eligible = base.filter((entry) =>
    isPoolEntryEligible({ ...args, entry }),
  );
  if (eligible.length > 0) return eligible;
  const universal = base.filter((entry) => entry.type !== 'metric_count');
  return universal.length > 0 ? universal : base;
}

function pickWeighted<T extends { weight?: number }>(
  entries: T[],
  rng: () => number,
): T | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, e) => sum + Math.max(1, e.weight ?? 1), 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(1, entry.weight ?? 1);
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function placementWindowKey(
  placement: QuestPlacement,
  templateId: string,
  timezone: string,
) {
  if (placement === 'daily') return getZonedToday(timezone);
  if (placement === 'onboarding') return 'onboarding';
  return `category:${templateId}`;
}

function isQuestDocFullyClaimed(doc: {
  logic?: ResolvedQuestLogicBlock[];
  claimedObjectiveIds?: string[];
}): boolean {
  const rewardBlocks = (doc.logic ?? []).filter(
    (block) => (block.rewards?.length ?? 0) > 0,
  );
  return (
    rewardBlocks.length > 0 &&
    rewardBlocks.every((block) =>
      (doc.claimedObjectiveIds ?? []).includes(block.id),
    )
  );
}

function comparableQuestValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparableQuestValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((next, key) => {
        if (key === '_id') return next;
        const entry = comparableQuestValue(record[key]);
        if (typeof entry !== 'undefined') next[key] = entry;
        return next;
      }, {});
  }
  return value;
}

function questValuesEqual(left: unknown, right: unknown) {
  return (
    JSON.stringify(comparableQuestValue(left)) ===
    JSON.stringify(comparableQuestValue(right))
  );
}

function setQuestField(
  doc: InstanceType<typeof QuestModel>,
  field: keyof QuestDoc,
  nextValue: unknown,
) {
  if (questValuesEqual((doc as any)[field], nextValue)) return false;
  (doc as any)[field] = nextValue;
  return true;
}

async function syncQuestForTemplate(args: {
  template: QuestTemplateDoc;
  userId: string;
  user: UserDoc;
  tasks: TaskDoc[];
  timezone: string;
  counters?: QuestCounterEntry[];
  existingDoc?: InstanceType<typeof QuestModel> | null;
}) {
  const { template, userId, user, tasks, timezone, counters } = args;
  const windowKey = placementWindowKey(template.placement, template.templateId, timezone);
  const questId =
    template.placement === 'daily'
      ? `${template.templateId}:${windowKey}`
      : template.placement === 'onboarding'
        ? `${template.templateId}:onboarding`
        : `${template.templateId}:category`;

  let doc =
    args.existingDoc ??
    new QuestModel({
      userId,
      questId,
      templateId: template.templateId,
      rollKey: crypto.randomUUID(),
      placement: template.placement,
      categoryId: template.categoryId,
      windowKey,
      title: template.name,
      description: template.description,
      target: 0,
      progress: 0,
      logic: [],
    });

  if (!doc.rollKey) {
    doc.rollKey = crypto.randomUUID();
  }

  const templateDurationMinutes =
    template.placement === 'category' &&
    typeof template.durationMinutes === 'number' &&
    Number.isFinite(template.durationMinutes) &&
    template.durationMinutes > 0
      ? Math.floor(template.durationMinutes)
      : undefined;

  const startDate =
    template.placement === 'daily'
      ? windowKey
      : getZonedYMD(doc.createdAt ?? new Date(), timezone);
  const endDate = getZonedToday(timezone);
  const userTags = (user.tags ?? []).filter(
    (tag) => !!getUserTagId(tag),
  );
  const profile = normalizeFocusProfile(user);
  const categoryTagIds =
    template.categoryId
      ? profile.categoryTagMap.find(
          (entry) => entry.categoryId === template.categoryId,
        )?.tagIds ?? []
      : [];
  const categoryTags = userTags.filter((tag) => {
    const tagId = getUserTagId(tag);
    return tagId ? categoryTagIds.includes(tagId) : false;
  });
  const templateLogic =
    template.placement === 'category'
      ? template.logic.map((block) =>
          block.type === 'metric_count' &&
          !isTagScopedQuestMetric(block.metricKey)
            ? block
            : { ...block, tagMode: 'focus_category_tags' as const },
        )
      : template.logic;

  const unlockedFocusIds = resolveUnlockedFocusCategoryIds(
    profile,
    isPremiumUser(user),
  );
  const lockedForFreeUser =
    template.placement === 'category' &&
    unlockedFocusIds !== null &&
    unlockedFocusIds.length > 0 &&
    !unlockedFocusIds.includes(template.categoryId ?? '');

  // Onboarding targets are a hand-authored sequence; only rolled placements
  // scale to the user. Anchored to the window's start, not today, so a target
  // cannot drift under the user as they make progress against it.
  const baseline =
    template.placement === 'onboarding' || lockedForFreeUser
      ? NEUTRAL_BASELINE
      : computeQuestBaseline({
          tasks,
          timezone,
          todayKey: startDate,
          tagIds:
            template.placement === 'category' ? categoryTagIds : undefined,
          focusCategoryId:
            template.placement === 'category' ? template.categoryId : undefined,
          accountCreatedAt: user.createdAt ?? null,
        });

  let nextDurationMinutes: number | undefined;
  let nextStartedAt: Date | null;
  let nextExpiresAt: Date | null;
  let nextLockedRemainingMs: number | null;
  if (templateDurationMinutes) {
    const nowMs = Date.now();
    const windowMs = templateDurationMinutes * 60_000;
    nextDurationMinutes = doc.durationMinutes ?? templateDurationMinutes;
    if (lockedForFreeUser) {
      const carried =
        doc.lockedRemainingMs ??
        (doc.expiresAt ? doc.expiresAt.getTime() - nowMs : windowMs);
      nextLockedRemainingMs = carried > 0 ? carried : windowMs;
      nextStartedAt = null;
      nextExpiresAt = null;
    } else if (typeof doc.lockedRemainingMs === 'number') {
      nextStartedAt = new Date(nowMs);
      nextExpiresAt = new Date(
        nowMs + (doc.lockedRemainingMs > 0 ? doc.lockedRemainingMs : windowMs),
      );
      nextLockedRemainingMs = null;
    } else {
      nextStartedAt = doc.startedAt ?? new Date(nowMs);
      nextExpiresAt =
        doc.expiresAt ?? new Date(nextStartedAt.getTime() + windowMs);
      nextLockedRemainingMs = null;
    }
  } else {
    nextDurationMinutes = undefined;
    nextStartedAt = null;
    nextExpiresAt = null;
    nextLockedRemainingMs = null;
  }

  const prevBlocksById = new Map(
    (doc.logic ?? []).map((block) => [block.id, block]),
  );

  const resolvedLogic: ResolvedQuestLogicBlock[] = templateLogic.map((block) => {
      const resolvedTag =
        block.tagMode === 'random_user_tag' && userTags.length > 0
        ? userTags[
            Math.floor(
              createSeededRandom(
                `${userId}:${template.templateId}:${windowKey}:${block.id}:tag`,
              )() * userTags.length,
            )
          ]
        : null;
    const target = resolveLogicTarget(
      block,
      `${userId}:${template.templateId}:${windowKey}:${doc.rollKey}:${block.id}`,
      baseline,
      templateDurationMinutes
        ? Math.max(1, Math.round(templateDurationMinutes / (24 * 60)))
        : 1,
    );
      const resolvedBlock: ResolvedQuestLogicBlock = {
        ...block,
        target,
        progress: 0,
        resolvedTagId: getUserTagId(resolvedTag) ?? undefined,
        resolvedTagIds:
          block.tagMode === 'focus_category_tags'
            ? categoryTags
                .map((tag) => getUserTagId(tag))
                .filter((tagId): tagId is string => !!tagId)
            : undefined,
        resolvedTagName: getUserTagName(resolvedTag) ?? undefined,
        resolvedTagNames:
          block.tagMode === 'focus_category_tags'
            ? categoryTags
                .map((tag) => getUserTagName(tag))
                .filter((tagName): tagName is string => !!tagName)
            : undefined,
      };
    const rawProgress = progressForLogicBlock({
      block: resolvedBlock,
      tasks,
      timezone,
      startDate,
      endDate,
      counters,
      focusCategoryId:
        template.placement === 'category' ? template.categoryId : undefined,
    });
    const prevBlock = prevBlocksById.get(block.id);
    const prevOffset = Math.max(0, prevBlock?.progressOffset ?? 0);
    const prevProgress = Math.max(0, prevBlock?.progress ?? 0);
    const progressOffset = lockedForFreeUser
      ? Math.max(0, rawProgress - prevProgress)
      : prevOffset;
    const progress = block.preCredited
      ? target
      : Math.max(0, rawProgress - progressOffset);
    const resolvedRewards = (block.rewards ?? [])
      .filter((r): r is QuestReward => isSupportedReward(r as { type?: string }))
      .map((r, ri) =>
        resolveReward(
          r,
          `${userId}:${template.templateId}:${windowKey}:${doc.rollKey}:obj-reward:${block.id}:${ri}`,
        ),
      );
    return {
      ...resolvedBlock,
      progress,
      progressOffset,
      rewards: resolvedRewards.length > 0 ? resolvedRewards : undefined,
    };
  });

  enforceLadderShape(
    resolvedLogic,
    templateDurationMinutes
      ? Math.max(1, Math.round(templateDurationMinutes / (24 * 60)))
      : 1,
  );
  for (const block of resolvedLogic) {
    if (block.preCredited) block.progress = block.target;
  }

  const target = resolvedLogic.reduce((sum, block) => sum + block.target, 0);
  const progress = resolvedLogic.reduce(
    (sum, block) => sum + Math.min(block.progress, block.target),
    0,
  );
  const completed = progress >= target;

  const nextCompletedAt = completed ? doc.completedAt ?? new Date() : null;

  const prevQuestProgress = (doc as any).isNew ? 0 : Math.max(0, doc.progress);
  const nextLastProgressAt =
    progress > prevQuestProgress ? new Date() : doc.lastProgressAt ?? null;

  let changed = !!(doc as any).isNew;
  changed = setQuestField(doc, 'questId', questId) || changed;
  changed = setQuestField(doc, 'placement', template.placement) || changed;
  changed = setQuestField(doc, 'categoryId', template.categoryId) || changed;
  changed = setQuestField(doc, 'windowKey', windowKey) || changed;
  changed = setQuestField(doc, 'title', template.name) || changed;
  changed = setQuestField(doc, 'description', template.description) || changed;
  changed = setQuestField(doc, 'durationMinutes', nextDurationMinutes) || changed;
  changed = setQuestField(doc, 'startedAt', nextStartedAt) || changed;
  changed = setQuestField(doc, 'expiresAt', nextExpiresAt) || changed;
  changed =
    setQuestField(doc, 'lockedRemainingMs', nextLockedRemainingMs) || changed;
  changed = setQuestField(doc, 'logic', resolvedLogic) || changed;
  changed =
    setQuestField(
      doc,
      'carriedTiers',
      resolvedLogic.filter((block) => block.preCredited).length,
    ) || changed;
  changed = setQuestField(doc, 'target', target) || changed;
  changed = setQuestField(doc, 'progress', progress) || changed;
  changed = setQuestField(doc, 'completedAt', nextCompletedAt) || changed;
  changed = setQuestField(doc, 'lastProgressAt', nextLastProgressAt) || changed;

  if (changed) {
    doc.markModified('logic');
    try {
      await doc.save();
    } catch (err: any) {
      // Duplicate key: a concurrent request already inserted this quest doc.
      // Re-fetch and return the winner instead of surfacing a 500.
      if (err.code === 11000 && (doc as any).isNew) {
        const existing = await QuestModel.findOne({ userId, questId });
        if (existing) return existing;
      }
      // VersionError: a concurrent request already updated this quest doc.
      // Since this is a sync, the other request's update is sufficient.
      if (err.name === 'VersionError') {
        const existing = await QuestModel.findOne({ userId, questId });
        if (existing) return existing;
      }
      throw err;
    }
  }

  return doc;
}

export async function syncQuestState(args: {
  userId: string;
  timezone: string;
  catalog?: ItemDef[];
  includeCatalog?: boolean;
  includeCategories?: boolean;
  refreshDaily?: boolean;
  refreshFocus?: boolean;
  dailySelectionSeed?: string;
}) {
  const { userId, timezone } = args;
  const includeCatalog = args.includeCatalog ?? true;
  const includeCategories = args.includeCategories ?? true;
  const [user, tasks, catalog, templates, categories, loadedDocs, recipes] = await Promise.all([
    UserModel.findById(userId).lean<UserDoc | null>(),
    TaskModel.find(
      { userId, deletedAt: { $exists: false } },
      {
        type: 1,
        completed: 1,
        completedDates: 1,
        completedAtByDate: 1,
        lateCompletedDates: 1,
        date: 1,
        createdAt: 1,
        tags: 1,
        focusAreaId: 1,
        frogodoroSessions: 1,
        isStarter: 1,
      },
    ).lean<TaskDoc[]>(),
    includeCatalog
      ? args.catalog
        ? Promise.resolve(args.catalog)
        : getFullCatalog()
      : Promise.resolve([] as ItemDef[]),
    QuestTemplateModel.find({ isActive: true }).lean<QuestTemplateDoc[]>(),
    includeCategories
      ? QuestCategoryModel.find({}).sort({ createdAt: 1 }).lean<QuestCategoryDoc[]>()
      : QuestCategoryModel.find(
          {},
          { categoryId: 1, name: 1, shortLabel: 1, questMode: 1 },
        )
          .sort({ createdAt: 1 })
          .lean<QuestCategoryDoc[]>(),
    QuestModel.find({ userId }).select('-coverImageUrl'),
    QuestRecipeModel.find({ isActive: true }).lean<QuestRecipeDoc[]>(),
  ]);

  if (!user) throw new Error('User not found');

  const hasFriends = !!(await FriendshipModel.exists({
    $or: [{ userA: userId }, { userB: userId }],
  }));

  const profile = normalizeFocusProfile(user);
  const todayKey = getZonedToday(timezone);
  const visibilityMetrics = buildVisibilityMetrics(user, tasks, todayKey);

  // Refresh scopes delete the live docs AND drop them from the in-memory
  // list, otherwise the stale docs would be treated as frozen rolls and the
  // quests would come back unchanged.
  let allExistingDocs = loadedDocs;
  if (args.refreshDaily) {
    await QuestModel.deleteMany({
      userId,
      placement: 'daily',
      windowKey: todayKey,
    });
    allExistingDocs = allExistingDocs.filter(
      (doc) => !(doc.placement === 'daily' && doc.windowKey === todayKey),
    );
  }
  if (args.refreshFocus) {
    await QuestModel.deleteMany({ userId, placement: 'category' });
    allExistingDocs = allExistingDocs.filter(
      (doc) => doc.placement !== 'category',
    );
  }

  const filteredTemplates = [...templates]
    .sort(byTemplateOrder)
    .filter((template) =>
    matchesVisibilityConditions(
      template.visibilityConditions,
      visibilityMetrics,
    ),
  );

  const dailyTemplates = filteredTemplates.filter(
    (template) => template.placement === 'daily',
  );
  const questModeByCategoryId = new Map(
    categories.map((c) => [c.categoryId, c.questMode ?? 'templates']),
  );
  const categoryTemplates = filteredTemplates.filter((template) => {
    if (template.placement !== 'category' || !template.categoryId) return false;
    if (questModeByCategoryId.get(template.categoryId) === 'generated') {
      return false;
    }
    return profile.selectedCategoryIds.includes(template.categoryId);
  });

  const existingDailyDocs = allExistingDocs.filter(
    (doc) => doc.placement === 'daily' && doc.windowKey === todayKey,
  );

  let selectedDailyTemplates: QuestTemplateDoc[] = [];
  if (existingDailyDocs.length > 0) {
    const templateIds = new Set(existingDailyDocs.map((doc) => doc.templateId));
    const matchedTemplates = dailyTemplates.filter((template) =>
      templateIds.has(template.templateId),
    );
    if (matchedTemplates.length > 0) {
      selectedDailyTemplates = matchedTemplates;
    }
  }

  if (selectedDailyTemplates.length === 0) {
    const rng = createSeededRandom(
      `${userId}:${todayKey}:${args.dailySelectionSeed ?? 'default'}`,
    );
    selectedDailyTemplates = shuffle(dailyTemplates, rng).slice(0, 3);
  }

  // An active daily recipe replaces authored daily templates with ONE quest
  // holding an objective per slot (slot order = difficulty order, like the
  // focus ladders). The roll is frozen in the day's quest doc once created:
  // pool eligibility depends on user state (flies, inventory) that changes
  // during the day, so re-rolling mid-day could swap objectives.
  const dailyRecipe = recipes.find(
    (r) =>
      (r.placement ?? 'category') === 'daily' &&
      r.isActive &&
      (r.slots ?? []).length > 0,
  );
  if (dailyRecipe) {
    const templateId = `gend:${todayKey}`;
    const frozenDaily = allExistingDocs.find(
      (doc) => doc.placement === 'daily' && doc.templateId === templateId,
    );
    const rolledLogic = frozenDaily?.logic?.length
      ? (frozenDaily.logic as QuestLogicBlock[])
      : (dailyRecipe.slots as RecipeSlot[])
      .map((slot, index) => {
        const pool = buildEligiblePool({
          slot,
          placement: 'daily',
          user,
          catalog,
          tasks,
          todayKey,
          hasFriends,
          windowDays: 1,
        });
        const pick = pickWeighted(
          pool,
          createSeededRandom(`${userId}:${templateId}:slot:${index}`),
        );
        if (!pick || (slot.rewards ?? []).length === 0) return null;
        const isMetric = pick.type === 'metric_count';
        const minAmount = Math.max(1, Math.floor(pick.minTarget));
        const block: QuestLogicBlock = {
          id: `slot-${index + 1}`,
          type: pick.type,
          subject: 'task',
          action:
            pick.type === 'count' ? pick.action ?? 'complete' : undefined,
          amountMode: 'random',
          minAmount,
          maxAmount: Math.max(minAmount, Math.floor(pick.maxTarget)),
          tagMode: 'ignore',
          metricKey: isMetric
            ? resolveRecipeMetricKey(pick, `${userId}:${templateId}:slot:${index}:streak`)
            : undefined,
          ...recipePickModifiers(pick),
          rewards: [
            ...pickSlotReward(
              slot.rewards,
              `${userId}:${templateId}:slot:${index}:reward`,
            ),
            ...rollBonusRewards(
              slot.bonusRewards,
              `${userId}:${templateId}:slot:${index}:bonus`,
            ),
          ],
        };
        return block;
      })
      .filter((block): block is QuestLogicBlock => !!block);
    if (rolledLogic.length > 0) {
      selectedDailyTemplates = [
        {
          templateId,
          name: dailyRecipe.name || 'Daily Quests',
          description: '',
          placement: 'daily',
          logic: rolledLogic,
          visibilityConditions: [],
          isActive: true,
        } as unknown as QuestTemplateDoc,
      ];
    }
  }

  // Per-category rotation: each selected category has exactly one active quest.
  // If the active quest's template is expired, rotate to a different template
  // from the same category (or re-roll the same template if it's the only one).
  const templatesByCategoryId = new Map<string, QuestTemplateDoc[]>();
  for (const template of categoryTemplates) {
    if (!template.categoryId) continue;
    const arr = templatesByCategoryId.get(template.categoryId) ?? [];
    arr.push(template);
    templatesByCategoryId.set(template.categoryId, arr);
  }

  const existingByCategoryId = new Map<string, QuestDoc[]>();
  for (const doc of allExistingDocs) {
    if (doc.placement === 'category' && doc.categoryId) {
      const arr = existingByCategoryId.get(doc.categoryId) ?? [];
      arr.push(doc);
      existingByCategoryId.set(doc.categoryId, arr);
    }
  }

  const selectedCategoryTemplates: QuestTemplateDoc[] = [];
  const categoryDocIdsToKeep = new Set<string>();
  const nowMs = Date.now();

  Array.from(templatesByCategoryId.entries()).forEach(
    ([categoryId, templatesForCat]: [string, QuestTemplateDoc[]]) => {
      if (templatesForCat.length === 0) return;
      const existingDocs = existingByCategoryId.get(categoryId) ?? [];
      const validTemplateIds = new Set(
        templatesForCat.map((t: QuestTemplateDoc) => t.templateId),
      );

      const liveDoc = existingDocs.find((doc) => {
        if (!validTemplateIds.has(doc.templateId)) return false;
        return !doc.expiresAt || doc.expiresAt.getTime() > nowMs;
      });

      let chosenTemplate: QuestTemplateDoc;
      if (liveDoc) {
        chosenTemplate =
          templatesForCat.find(
            (t: QuestTemplateDoc) => t.templateId === liveDoc.templateId,
          ) ?? templatesForCat[0];
        categoryDocIdsToKeep.add(String(liveDoc._id));
      } else {
        const lastTemplateId = existingDocs[0]?.templateId;
        const rotated =
          lastTemplateId && templatesForCat.length > 1
            ? templatesForCat.filter(
                (t: QuestTemplateDoc) => t.templateId !== lastTemplateId,
              )
            : templatesForCat;
        const pool = rotated.length > 0 ? rotated : templatesForCat;
        const rng = createSeededRandom(
          `${userId}:rotate:${categoryId}:${nowMs}`,
        );
        chosenTemplate = pool[Math.floor(rng() * pool.length)];
      }

      selectedCategoryTemplates.push(chosenTemplate);
    },
  );

  // Generated mode: categories whose quests are rolled from a recipe instead
  // of authored templates. A roll lives until its window expires (immediate
  // re-roll) or it is fully claimed (re-roll after the local day ends).
  const generatedCategoryIds = profile.selectedCategoryIds.filter(
    (categoryId) => questModeByCategoryId.get(categoryId) === 'generated',
  );
  const generatedTemplates: QuestTemplateDoc[] = [];
  const generatedUnlockedFocusIds = resolveUnlockedFocusCategoryIds(
    profile,
    isPremiumUser(user),
  );
  if (generatedCategoryIds.length > 0) {
    let activeRecipes = recipes.filter((r) => (r.placement ?? 'category') !== 'daily');
    if (activeRecipes.length === 0) {
      const seeded = await ensureDefaultQuestRecipe();
      if (seeded && seeded.isActive) activeRecipes = [seeded];
    }
    for (const categoryId of generatedCategoryIds) {
      const recipe =
        activeRecipes.find((r) => (r.categoryIds ?? []).includes(categoryId)) ??
        activeRecipes.find((r) => (r.categoryIds ?? []).length === 0);
      if (!recipe || (recipe.slots ?? []).length === 0) continue;

      let existing =
        allExistingDocs.find(
          (doc) =>
            doc.placement === 'category' &&
            doc.categoryId === categoryId &&
            doc.templateId.startsWith('gen:'),
        ) ?? null;

      let carriedTiers = 0;
      if (existing) {
        const rewardBlocks = (existing.logic ?? []).filter(
          (block) => (block.rewards?.length ?? 0) > 0,
        );
        const fullyClaimed =
          rewardBlocks.length > 0 &&
          rewardBlocks.every((block) =>
            (existing!.claimedObjectiveIds ?? []).includes(block.id),
          );
        if (fullyClaimed && !existing.regenAfterDay) {
          existing.regenAfterDay = todayKey;
          await QuestModel.updateOne(
            { _id: existing._id },
            { $set: { regenAfterDay: todayKey } },
          );
        }
        const cooldownOver =
          !!existing.regenAfterDay && todayKey > existing.regenAfterDay;
        const expired =
          !fullyClaimed &&
          !!existing.expiresAt &&
          existing.expiresAt.getTime() <= nowMs;
        if (cooldownOver || expired) {
          const lockedNow =
            generatedUnlockedFocusIds !== null &&
            generatedUnlockedFocusIds.length > 0 &&
            !generatedUnlockedFocusIds.includes(categoryId);
          const engaged = ladderEngaged(existing);
          const outcome: LadderOutcome = !expired
            ? 'completed'
            : lockedNow
              ? 'expired_locked'
              : engaged
                ? 'expired_attempted'
                : 'expired_untouched';
          carriedTiers =
            expired && !engaged
              ? Math.max(existing.carriedTiers ?? 0, carryOverTiersFor(existing))
              : carryOverTiersFor(existing);
          await recordLadderOutcome({
            userId,
            quest: existing,
            outcome,
            carriedTiers,
          });
          existing = null;
        } else {
          categoryDocIdsToKeep.add(String(existing._id));
        }
      }

      const rollKey = existing?.rollKey ?? crypto.randomUUID();
      const templateId = existing?.templateId ?? `gen:${categoryId}:${rollKey}`;
      const recipeTagIds =
        profile.categoryTagMap.find((entry) => entry.categoryId === categoryId)
          ?.tagIds ?? [];
      const recipeWindowDays = Math.max(
        1,
        Math.round((recipe.durationMinutes ?? 3 * 24 * 60) / (24 * 60)),
      );
      // Same freeze as the daily roll: a live doc keeps its rolled logic so
      // pool eligibility changes can't swap objectives mid-roll.
      const logic = existing?.logic?.length
        ? (existing.logic as QuestLogicBlock[])
        : (recipe.slots as RecipeSlot[])
        .map((slot, index) => {
          const pool = buildEligiblePool({
            slot,
            placement: 'category',
            user,
            catalog,
            tasks,
            todayKey,
            hasFriends,
            windowDays: recipeWindowDays,
            tagIds: recipeTagIds,
          });
          const pick = pickWeighted(
            pool,
            createSeededRandom(`${userId}:${templateId}:slot:${index}`),
          );
          if (!pick) return null;
          const isMetric = pick.type === 'metric_count';
          const minAmount = Math.max(1, Math.floor(pick.minTarget));
          const metricKey = isMetric
            ? resolveRecipeMetricKey(pick, `${userId}:${templateId}:slot:${index}:streak`)
            : undefined;
          const block: QuestLogicBlock = {
            id: `slot-${index + 1}`,
            type: pick.type,
            subject: 'task',
            ...(index < carriedTiers ? { preCredited: true } : {}),
            action: pick.type === 'count' ? pick.action ?? 'complete' : undefined,
            amountMode: 'random',
            minAmount,
            maxAmount: Math.max(minAmount, Math.floor(pick.maxTarget)),
            tagMode:
              !isMetric || isTagScopedQuestMetric(metricKey)
                ? 'focus_category_tags'
                : 'ignore',
            metricKey,
            ...recipePickModifiers(pick),
            rewards: [
              ...pickSlotReward(
                slot.rewards,
                `${userId}:${templateId}:slot:${index}:reward`,
              ),
              ...rollBonusRewards(
                slot.bonusRewards,
                `${userId}:${templateId}:slot:${index}:bonus`,
              ),
            ],
          };
          return block;
        })
        .filter((block): block is QuestLogicBlock => !!block);
      if (logic.length === 0) continue;

      const category = categories.find((c) => c.categoryId === categoryId);
      generatedTemplates.push({
        templateId,
        name: `${category?.shortLabel || category?.name || 'Focus'} Goals`,
        description: 'A fresh set of goals rolled just for you.',
        placement: 'category',
        categoryId,
        durationMinutes:
          recipe.durationMinutes > 0 ? recipe.durationMinutes : undefined,
        logic,
        visibilityConditions: [],
        isActive: true,
      } as unknown as QuestTemplateDoc);
    }
  }

  // Onboarding quests: admin-managed templates shown one at a time, oldest
  // first; the next appears once the previous is fully claimed. Fully-claimed
  // docs stay in the DB (never re-emitted) so these one-time quests never
  // repeat.
  const onboardingTemplates: QuestTemplateDoc[] = [];
  let onboardingCandidates = filteredTemplates.filter(
    (template) => template.placement === 'onboarding',
  );
  if (onboardingCandidates.length === 0) {
    const seeded = await ensureDefaultOnboardingTemplates();
    templates.push(...seeded);
    onboardingCandidates = seeded.filter(
      (template) =>
        template.isActive &&
        matchesVisibilityConditions(
          template.visibilityConditions,
          visibilityMetrics,
        ),
    );
  }
  onboardingCandidates.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const onboardingDocFor = (templateId: string) =>
    allExistingDocs.find((doc) => doc.templateId === templateId);
  for (const template of onboardingCandidates) {
    const doc = onboardingDocFor(template.templateId);
    if (!doc || !isQuestDocFullyClaimed(doc)) {
      onboardingTemplates.push(template);
      break;
    }
  }

  const eligibleTemplates = [
    ...selectedDailyTemplates,
    ...selectedCategoryTemplates,
    ...generatedTemplates,
    ...onboardingTemplates,
  ];
  const eligibleDailyTemplateIds = new Set(
    selectedDailyTemplates.map((t) => t.templateId),
  );

  // Find docs to delete in-memory and batch delete by IDs
  const docsToDelete = allExistingDocs.filter((doc) => {
    if (doc.placement === 'daily' && doc.windowKey === todayKey) {
      return !eligibleDailyTemplateIds.has(doc.templateId);
    }
    if (doc.placement === 'category') {
      return !categoryDocIdsToKeep.has(doc._id.toString());
    }
    // Delete stale daily docs from other days
    if (doc.placement === 'daily' && doc.windowKey !== todayKey) {
      return true;
    }
    return false;
  });

  const deleteIdSet = new Set(docsToDelete.map((doc) => doc._id.toString()));
  const deletePromise =
    deleteIdSet.size > 0
      ? QuestModel.deleteMany({ _id: { $in: docsToDelete.map((d) => d._id) } })
      : Promise.resolve();

  // Build lookup of existing docs by templateId+windowKey for syncQuestForTemplate
  const existingDocMap = new Map(
    allExistingDocs
      .filter((doc) => !deleteIdSet.has(doc._id.toString()))
      .map((doc) => [`${doc.templateId}:${doc.windowKey}`, doc]),
  );

  const needsCounters = eligibleTemplates.some((template) =>
    (template.logic ?? []).some((block) => block.type === 'metric_count'),
  );
  let counters: QuestCounterEntry[] = [];
  if (needsCounters) {
    let sinceDateKey = todayKey;
    for (const doc of allExistingDocs) {
      if (deleteIdSet.has(doc._id.toString())) continue;
      const created = getZonedYMD(doc.createdAt ?? new Date(), timezone);
      if (created < sinceDateKey) sinceDateKey = created;
    }
    counters = await loadQuestCounters({ userId, sinceDateKey });
  }

  const [docs] = await Promise.all([
    Promise.all(
      eligibleTemplates.map((template) => {
        const windowKey = placementWindowKey(template.placement, template.templateId, timezone);
        const existingDoc = existingDocMap.get(`${template.templateId}:${windowKey}`) ?? null;
        return syncQuestForTemplate({ template, userId, user, tasks, timezone, counters, existingDoc });
      }),
    ),
    deletePromise,
  ]);

  const questViews = docs.map(questDocToView);
  const dailyQuests = questViews
    .filter((quest): quest is DailyQuestProgressView => quest.placement === 'daily')
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((quest) =>
      quest.templateId.startsWith('gend:') && dailyRecipe?.coverImageUrl
        ? { ...quest, coverImageUrl: dailyRecipe.coverImageUrl }
        : quest,
    );
  const categoryQuests = questViews
    .filter(
      (quest): quest is CategoryQuestProgressView => quest.placement === 'category',
    )
    .sort((a, b) => {
      if ((a.categoryId ?? '') !== (b.categoryId ?? '')) {
        return (a.categoryId ?? '').localeCompare(b.categoryId ?? '');
      }
      return a.title.localeCompare(b.title);
    });
  const onboardingQuests = questViews.filter(
    (quest) => quest.placement === 'onboarding',
  );

  // New users see one goal at a time: daily quests stay hidden until 5
  // objectives are complete (or every early onboarding quest is done, so a
  // short onboarding roster can't gate dailies forever).
  // Displayed quests carry fresh progress; finished ones fall back to their
  // stored doc (a candidate with no doc yet hasn't even been reached).
  const onboardingProgressComplete = (templateId: string) => {
    const view = onboardingQuests.find(
      (quest) => quest.templateId === templateId,
    );
    if (view) {
      return view.logic.every(
        (block) => block.progress >= Math.max(1, block.target),
      );
    }
    const doc = onboardingDocFor(templateId);
    return (
      !!doc &&
      (doc.logic ?? []).every(
        (block) => (block.progress ?? 0) >= Math.max(1, block.target ?? 1),
      )
    );
  };
  const firstOnboardingComplete = onboardingCandidates[0]
    ? onboardingProgressComplete(onboardingCandidates[0].templateId)
    : true;

  // Lifetime completed objectives across starter + daily quests — drives the
  // daily-quest and "Your areas" unlocks. Counted from the stored docs of
  // PAST onboarding quests too (the display drops each one once fully
  // claimed; without this the teaser's progress visibly reset when First
  // Hops finished).
  const displayedOnboardingIds = new Set(
    onboardingQuests.map((quest) => quest.templateId),
  );
  const pastOnboardingSteps = allExistingDocs
    .filter(
      (doc) =>
        doc.placement === 'onboarding' &&
        !displayedOnboardingIds.has(doc.templateId),
    )
    .reduce(
      (sum, doc) =>
        sum +
        (doc.logic ?? []).filter(
          (block) =>
            (block.progress ?? 0) >= Math.max(1, block.target ?? 1),
        ).length,
      0,
    );
  const earlyObjectiveSteps =
    pastOnboardingSteps +
    [...onboardingQuests, ...dailyQuests].reduce(
      (sum, quest) =>
        sum +
        quest.logic.filter(
          (block) => block.progress >= Math.max(1, block.target),
        ).length,
      0,
    );

  const dailyQuestsGated =
    earlyObjectiveSteps < DAILY_QUESTS_UNLOCK_STEP_TARGET &&
    onboardingCandidates
      .slice(0, 2)
      .some((template) => !onboardingProgressComplete(template.templateId));
  const visibleDailyQuests = dailyQuestsGated ? [] : dailyQuests;

  const templatesWithCover = new Set(
    templates
      .filter((t) => typeof t.coverImageUrl === 'string' && t.coverImageUrl.length > 0)
      .map((t) => t.templateId),
  );

  const premium = isPremiumUser(user);
  const rewardBackgrounds = includeCatalog ? await loadBackgroundPrizes() : [];
  const activeFocusCategoryId = resolveActiveFocusCategoryId(profile, premium);
  const unlockedFocusIds = resolveUnlockedFocusCategoryIds(profile, premium);
  const rentedFocusCategoryId = premium
    ? null
    : activeRentedFocusCategoryId(profile);
  const gatedCategoryQuests: CategoryQuestProgressView[] = categoryQuests.map(
    (quest) => ({
      ...quest,
      locked:
        unlockedFocusIds !== null &&
        unlockedFocusIds.length > 0 &&
        !unlockedFocusIds.includes(quest.categoryId),
    }),
  );

  return {
    user,
    tasks,
    catalog,
    isPremium: premium,
    focusProfile: profile,
    activeFocusCategoryId,
    rentedFocus: rentedFocusCategoryId
      ? {
          categoryId: rentedFocusCategoryId,
          expiresAt: profile.rentedFocus?.expiresAt ?? null,
        }
      : null,
    macroCategories: categories.map(categoryDocToDefinition),
    templatesWithCover,
    dailyQuests: visibleDailyQuests,
    dailyQuestsGated,
    firstOnboardingComplete,
    earlyObjectiveSteps,
    categoryQuests: gatedCategoryQuests,
    onboardingQuests,
    rewardCatalog: includeCatalog
      ? buildRewardCatalog(
          catalog,
          [
            ...dailyQuests.flatMap((quest) =>
              quest.logic.map((block) => block.rewards ?? []),
            ),
            ...categoryQuests.flatMap((quest) =>
              quest.logic.map((block) => block.rewards ?? []),
            ),
            ...onboardingQuests.flatMap((quest) =>
              quest.logic.map((block) => block.rewards ?? []),
            ),
          ],
          rewardBackgrounds,
        )
      : {},
  };
}

export { buildRewardCatalog, templateToView };

export async function saveFocusProfile(args: {
  userId: string;
  selectedCategoryIds: MacroCategoryId[];
  categoryTagMap: FocusCategoryTagMap[];
  createSuggestions?: boolean;
  timezone: string;
}) {
  const {
    userId,
    selectedCategoryIds,
    categoryTagMap,
    createSuggestions,
    timezone,
  } = args;
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  const existing = normalizeFocusProfile(user.toObject());
  user.focusProfile = {
    ...existing,
    completedAt: existing.completedAt ?? new Date(),
    selectedCategoryIds,
    categoryTagMap,
    unlockedAnimationIds: existing.unlockedAnimationIds ?? [],
  };
  user.markModified('focusProfile');
  await user.save();

  if (createSuggestions && !existing.suggestedContentCreatedAt) {
    user.focusProfile = {
      ...((user.focusProfile as FocusProfile) ?? {}),
      selectedCategoryIds,
      categoryTagMap,
      completedAt: new Date(),
      suggestedContentCreatedAt: new Date(),
      unlockedAnimationIds:
        (user.focusProfile as FocusProfile)?.unlockedAnimationIds ?? [],
    };
    user.markModified('focusProfile');
    await user.save();
  }

  return syncQuestState({ userId, timezone });
}

// Free users pick which single focus quest is active. Must be one of their
// selected focus categories.
export async function saveActiveFocusCategory(args: {
  userId: string;
  categoryId: string;
}) {
  const { userId, categoryId } = args;
  await connectMongo();
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  const profile = normalizeFocusProfile(user.toObject());
  if (!profile.selectedCategoryIds.includes(categoryId)) {
    throw new Error('That category is not one of your focus areas');
  }

  // Switching costs you the progress on the focus you're leaving: re-anchor its
  // quest so progress recomputes from now, and clear its completion/claims.
  const previousActive = resolveActiveFocusCategoryId(profile, false);
  if (previousActive && previousActive !== categoryId) {
    const now = new Date();
    const outgoing = await QuestModel.find({
      userId,
      placement: 'category',
      categoryId: previousActive,
    });
    await Promise.all(
      outgoing.map((quest) => {
        const zeroedLogic = (quest.logic ?? []).map((block: any) => ({
          ...block,
          progress: 0,
        }));
        return QuestModel.updateOne(
          { _id: quest._id },
          {
            $set: {
              createdAt: now,
              startedAt: null,
              expiresAt: null,
              progress: 0,
              completedAt: null,
              claimedAt: null,
              claimedObjectiveIds: [],
              logic: zeroedLogic,
            },
          },
          { timestamps: false },
        );
      }),
    );
  }

  user.focusProfile = {
    ...((user.focusProfile as FocusProfile) ?? {}),
    activeFocusCategoryId: categoryId,
  };
  user.markModified('focusProfile');
  await user.save();

  return { activeFocusCategoryId: categoryId };
}

// When a free user fully finishes (claims) their active focus quest, advance the
// active focus to the next selected category that still has an available quest,
// so they keep progressing without manually switching. Mutates
// `user.focusProfile` in place; the caller is responsible for saving the user.
// Unlike a manual switch, this does NOT zero any progress. Returns the new
// category id, or null if nothing changed.
async function advanceActiveFocusAfterFinish(args: {
  user: InstanceType<typeof UserModel>;
  finishedCategoryId?: string | null;
}): Promise<string | null> {
  const { user, finishedCategoryId } = args;
  if (!finishedCategoryId) return null;
  // Premium users progress every focus in parallel — no single active focus.
  if (isPremiumUser(user.toObject())) return null;

  const profile = normalizeFocusProfile(user.toObject());
  const currentActive = resolveActiveFocusCategoryId(profile, false);
  // Only advance when the finished quest is the one they were actively progressing.
  if (!currentActive || currentActive !== finishedCategoryId) return null;

  const candidates = (profile.selectedCategoryIds ?? []).filter(
    (id) => id !== currentActive,
  );
  if (candidates.length === 0) return null;

  const quests = await QuestModel.find({
    userId: String(user._id),
    placement: 'category',
    categoryId: { $in: candidates },
  }).lean<QuestDoc[]>();

  // A focus quest is "available" if it still has a reward to earn, or an
  // objective in progress.
  const isAvailable = (quest: QuestDoc) => {
    const claimed = new Set(quest.claimedObjectiveIds ?? []);
    return (quest.logic ?? []).some((block: any) =>
      block.rewards?.length
        ? !claimed.has(block.id)
        : block.progress < block.target,
    );
  };

  // Keep the user's own selection order so the next focus is predictable.
  const nextCategoryId =
    candidates.find((id) =>
      quests.some((quest) => quest.categoryId === id && isAvailable(quest)),
    ) ?? null;
  if (!nextCategoryId) return null;

  user.focusProfile = {
    ...((user.focusProfile as FocusProfile) ?? {}),
    activeFocusCategoryId: nextCategoryId,
  };
  user.markModified('focusProfile');
  return nextCategoryId;
}

export async function claimQuestReward(args: {
  userId: string;
  claimType: 'daily' | 'category';
  targetId: string;
  timezone: string;
}) {
  const { userId, claimType, targetId } = args;
  await connectMongo();

  // Load user and quest in parallel
  const [user, quest] = await Promise.all([
    UserModel.findById(userId),
    QuestModel.findOne({ userId, questId: targetId }),
  ]);
  if (!user) throw new Error('User not found');
  if (!quest) throw new Error('Quest not found');
  if (quest.placement !== claimType) {
    throw new Error('Quest type mismatch');
  }
  if (quest.claimedAt || quest.progress < quest.target) {
    throw new Error('Quest is not claimable');
  }

  const isPremium = isPremiumUser(user.toObject());

  if (!user.wardrobe) {
    user.wardrobe = {
      equipped: {},
      inventory: {},
      unseenItems: [],
      flies: 0,
    };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  if (!user.wardrobe.backgrounds) {
    user.wardrobe.backgrounds = { equipped: null, inventory: {} };
  }
  user.wardrobe.backgrounds.inventory = user.wardrobe.backgrounds.inventory ?? {};
  const summary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [] as string[],
    grantedBackgroundIds: [] as string[],
  };

  const multiplier = isPremium ? 2 : 1;
  const alreadyClaimed = new Set(quest.claimedObjectiveIds ?? []);

  const applyRewards = (rewards: QuestReward[]) => {
    for (const reward of rewards) {
      if (reward.type === 'FLIES') {
        const amount = (reward.amount ?? 0) * multiplier;
        user.wardrobe!.flies += amount;
        summary.fliesGranted += amount;
        summary.flyBalanceAfter = user.wardrobe!.flies;
      } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
        const inv = user.wardrobe!.backgrounds!.inventory;
        for (let i = 0; i < multiplier; i += 1) {
          inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
          summary.grantedBackgroundIds.push(reward.backgroundId);
        }
      } else if (reward.itemId) {
        for (let i = 0; i < multiplier; i += 1) {
          user.wardrobe!.inventory[reward.itemId] =
            (user.wardrobe!.inventory[reward.itemId] ?? 0) + 1;
          user.wardrobe!.unseenItems!.push(reward.itemId);
          summary.grantedItemIds.push(reward.itemId);
        }
      }
    }
  };

  // Claim any unclaimed objective rewards first
  for (const block of quest.logic) {
    if (!block.rewards?.length) continue;
    if (alreadyClaimed.has(block.id)) continue;
    if (block.progress < block.target) continue;
    applyRewards(block.rewards);
    alreadyClaimed.add(block.id);
  }
  quest.claimedObjectiveIds = Array.from(alreadyClaimed);
  quest.markModified('claimedObjectiveIds');

  quest.claimedAt = new Date();
  recordDoubleableClaim(user, summary);
  user.markModified('wardrobe');

  // Claiming the whole quest finishes it — advance a free user's active focus.
  if (quest.placement === 'category') {
    await advanceActiveFocusAfterFinish({
      user,
      finishedCategoryId: quest.categoryId,
    });
  }

  // Save quest and user in parallel
  await Promise.all([quest.save(), user.save()]);
  return summary;
}

export async function claimObjectiveReward(args: {
  userId: string;
  questId: string;
  objectiveId: string;
  timezone: string;
}) {
  const { userId, questId, objectiveId } = args;
  await connectMongo();

  // Load user and quest in parallel
  const [user, quest] = await Promise.all([
    UserModel.findById(userId),
    QuestModel.findOne({ userId, questId }),
  ]);
  if (!user) throw new Error('User not found');
  if (!quest) throw new Error('Quest not found');

  // Free users can only claim from their active focus quest (or a rental).
  if (quest.placement === 'category') {
    const premium = isPremiumUser(user.toObject());
    const unlockedIds = resolveUnlockedFocusCategoryIds(
      normalizeFocusProfile(user.toObject()),
      premium,
    );
    if (
      unlockedIds !== null &&
      unlockedIds.length > 0 &&
      !unlockedIds.includes(quest.categoryId ?? '')
    ) {
      throw new Error(
        'This focus quest is locked. Switch your active focus or upgrade to Premium.',
      );
    }
  }

  const alreadyClaimed = (quest.claimedObjectiveIds ?? []).includes(objectiveId);
  if (alreadyClaimed) throw new Error('Objective reward already claimed');

  const block = quest.logic.find((b) => b.id === objectiveId);
  if (!block) throw new Error('Objective not found');
  if (!block.rewards?.length) throw new Error('Objective has no rewards');
  if (block.progress < block.target) throw new Error('Objective not completed');

  const isPremium = isPremiumUser(user.toObject());

  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  if (!user.wardrobe.backgrounds) {
    user.wardrobe.backgrounds = { equipped: null, inventory: {} };
  }
  user.wardrobe.backgrounds.inventory = user.wardrobe.backgrounds.inventory ?? {};
  const summary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [] as string[],
    grantedBackgroundIds: [] as string[],
  };

  const multiplier = isPremium ? 2 : 1;

  for (const reward of block.rewards) {
    if (reward.type === 'FLIES') {
      const amount = (reward.amount ?? 0) * multiplier;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
      summary.flyBalanceAfter = user.wardrobe.flies;
    } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
      const inv = user.wardrobe.backgrounds.inventory;
      for (let i = 0; i < multiplier; i += 1) {
        inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
        summary.grantedBackgroundIds.push(reward.backgroundId);
      }
    } else if (reward.itemId) {
      for (let i = 0; i < multiplier; i += 1) {
        user.wardrobe.inventory[reward.itemId] =
          (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
        user.wardrobe.unseenItems!.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    }
  }
  recordDoubleableClaim(user, summary);
  user.markModified('wardrobe');

  quest.claimedObjectiveIds = [...(quest.claimedObjectiveIds ?? []), objectiveId];
  quest.markModified('claimedObjectiveIds');
  user.markModified('wardrobe');

  // If this was the last objective — i.e. every reward objective is now complete
  // and claimed — the focus quest is finished, so advance a free user's active
  // focus to the next available category.
  if (quest.placement === 'category') {
    const claimed = new Set(quest.claimedObjectiveIds);
    const rewardBlocks = (quest.logic ?? []).filter((b) => b.rewards?.length);
    const finished =
      rewardBlocks.length > 0 &&
      rewardBlocks.every((b) => b.progress >= b.target && claimed.has(b.id));
    if (finished) {
      await advanceActiveFocusAfterFinish({
        user,
        finishedCategoryId: quest.categoryId,
      });
    }
  }

  // Save quest and user in parallel
  await Promise.all([quest.save(), user.save()]);
  return summary;
}

// Re-rolls one unfinished, unclaimed objective from its recipe slot. The pool
// pick is reseeded off the spend count so the same slot cannot hand back the
// objective the user was trying to get rid of.
export async function rerollQuestObjective(args: {
  userId: string;
  questId: string;
  objectiveId: string;
  timezone: string;
}) {
  const { userId, questId, objectiveId, timezone } = args;
  await connectMongo();

  const [user, quest] = await Promise.all([
    UserModel.findById(userId).lean<UserDoc | null>(),
    QuestModel.findOne({ userId, questId }),
  ]);
  if (!user) throw new Error('User not found');
  if (!quest) throw new Error('Quest not found');
  if (!quest.templateId.startsWith('gen:')) {
    throw new Error('This quest cannot be rerolled');
  }
  const spent = quest.rerollsUsed ?? 0;
  if (spent >= REROLLS_PER_LADDER) {
    throw new Error('No rerolls left on this quest');
  }

  const blockIndex = (quest.logic ?? []).findIndex(
    (block) => block.id === objectiveId,
  );
  if (blockIndex < 0) throw new Error('Objective not found');
  const block = quest.logic[blockIndex];
  if ((quest.claimedObjectiveIds ?? []).includes(objectiveId)) {
    throw new Error('Objective is already claimed');
  }
  if ((block.progress ?? 0) >= Math.max(1, block.target ?? 1)) {
    throw new Error('Objective is already finished');
  }
  if (block.preCredited) {
    throw new Error('Objective is already finished');
  }

  const recipes = await QuestRecipeModel.find({
    placement: { $ne: 'daily' },
    isActive: true,
  }).lean<QuestRecipeDoc[]>();
  const recipe =
    recipes.find((r) =>
      (r.categoryIds ?? []).includes(quest.categoryId ?? ''),
    ) ?? recipes.find((r) => (r.categoryIds ?? []).length === 0);
  const slot = recipe?.slots?.[blockIndex];
  if (!recipe || !slot) throw new Error('Recipe slot not found');

  const [tasks, catalog, hasFriends] = await Promise.all([
    TaskModel.find(
      { userId, deletedAt: { $exists: false } },
      {
        type: 1,
        completed: 1,
        completedDates: 1,
        completedAtByDate: 1,
        lateCompletedDates: 1,
        date: 1,
        createdAt: 1,
        tags: 1,
        focusAreaId: 1,
        frogodoroSessions: 1,
        isStarter: 1,
      },
    ).lean<TaskDoc[]>(),
    getFullCatalog(),
    FriendshipModel.exists({
      status: 'accepted',
      $or: [{ requesterId: userId }, { addresseeId: userId }],
    }).then((doc) => !!doc),
  ]);

  const profile = normalizeFocusProfile(user);
  const tagIds =
    profile.categoryTagMap.find(
      (entry) => entry.categoryId === quest.categoryId,
    )?.tagIds ?? [];
  const todayKey = getZonedToday(timezone);
  const windowDays = Math.max(
    1,
    Math.round((recipe.durationMinutes ?? 3 * 24 * 60) / (24 * 60)),
  );

  const pool = buildEligiblePool({
    slot,
    placement: 'category',
    user,
    catalog,
    tasks,
    todayKey,
    hasFriends,
    windowDays,
    tagIds,
  });
  // Anything but what they already have, unless the slot has nothing else to
  // offer — a reroll that returns the same objective is worse than refusing.
  const alternatives = pool.filter(
    (entry) =>
      !(
        entry.type === block.type &&
        (entry.action ?? undefined) === (block.action ?? undefined) &&
        (entry.metricKey ?? undefined) === (block.metricKey ?? undefined)
      ),
  );
  const candidates = alternatives.length > 0 ? alternatives : pool;
  const seed = `${userId}:${quest.templateId}:slot:${blockIndex}:reroll:${spent + 1}`;
  const pick = pickWeighted(candidates, createSeededRandom(seed));
  if (!pick) throw new Error('Nothing to reroll into');

  const isMetric = pick.type === 'metric_count';
  const minAmount = Math.max(1, Math.floor(pick.minTarget));
  const metricKey = isMetric
    ? resolveRecipeMetricKey(pick, `${seed}:streak`)
    : undefined;
  const nextBlock: ResolvedQuestLogicBlock = {
    ...block,
    type: pick.type,
    subject: 'task',
    action: pick.type === 'count' ? pick.action ?? 'complete' : undefined,
    amountMode: 'random',
    minAmount,
    maxAmount: Math.max(minAmount, Math.floor(pick.maxTarget)),
    tagMode:
      !isMetric || isTagScopedQuestMetric(metricKey)
        ? 'focus_category_tags'
        : 'ignore',
    metricKey,
    sessionMinutes: undefined,
    requiresFollowThrough: undefined,
    beforeHour: undefined,
    ...recipePickModifiers(pick),
    target: 1,
    progress: 0,
    progressOffset: 0,
  };

  quest.logic[blockIndex] = nextBlock;
  quest.rerollsUsed = spent + 1;
  quest.markModified('logic');
  await quest.save();

  await recordAnalyticsEvent({
    userId,
    name: 'quest_objective_rerolled',
    properties: {
      category_id: quest.categoryId ?? 'uncategorized',
      template_id: quest.templateId,
      tier: blockIndex + 1,
      from_type: block.type,
      to_type: nextBlock.type,
      rerolls_used: quest.rerollsUsed,
    },
  }).catch(() => {});

  // The rolled block carries min/max, not a target; the next sync resolves it
  // against the user's baseline exactly as it would a fresh roll.
  await syncQuestState({ userId, timezone, includeCatalog: false });

  return { ok: true, rerollsLeft: REROLLS_PER_LADDER - quest.rerollsUsed };
}
