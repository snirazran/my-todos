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
import { TRADE_MIN_ITEM_COUNT, type ItemDef } from '@/lib/skins/catalog';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { loadBackgroundPrizes } from '@/lib/skins/gifts';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import {
  loadQuestCounters,
  parseTaskStreakDays,
  sumCounters,
  taskStreakMetric,
  type QuestCounterEntry,
} from './metrics';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipePoolEntry,
  type RecipeSlot,
} from '@/lib/models/QuestRecipe';
import { ensureDefaultOnboardingTemplates } from './onboardingQuests';
import type {
  DailyQuestProgressView,
  FocusCategoryTagMap,
  FocusProfile,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestLogicBlock,
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
  };
}

export const DAILY_QUESTS_UNLOCK_STEP_TARGET = 5;

/** The onboarding objective that introduces the weekly Leap. */
const LEAP_ONBOARDING_METRIC = 'focus_tag_linked';

// One swap a day, matching Fortnite's single daily reroll: enough agency that a
// rolled objective is never an order, not enough to shop for the cheapest one.
export const DAILY_QUEST_REROLLS_PER_DAY = 1;

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
  const resolvedTagId = (block as ResolvedQuestLogicBlock).resolvedTagId;
  const tagIds =
    block.tagMode === 'random_user_tag' && resolvedTagId
      ? [resolvedTagId]
      : undefined;
  if (block.tagMode === 'random_user_tag' && !tagIds) {
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

export const DAY_PART_COUNT = 3;

function dayPartOfHour(hour: number): number {
  if (hour < 12) return 0;
  if (hour < 17) return 1;
  return 2;
}

function countDistinctDayParts(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  const parts = new Set<number>();
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
      if (hour !== null) parts.add(dayPartOfHour(hour));
    }
    if (parts.size >= DAY_PART_COUNT) break;
  }
  return parts.size;
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

function resolveLogicTarget(
  block: QuestLogicBlock,
  seed: string,
  windowDays?: number,
) {
  if (block.amountMode === 'fixed') {
    const fixed = Math.max(1, block.amount ?? 1);
    return block.type === 'day_parts'
      ? Math.min(DAY_PART_COUNT, fixed)
      : fixed;
  }

  const min = Math.max(1, Math.min(block.minAmount ?? 1, block.maxAmount ?? 1));
  const max = Math.max(min, block.maxAmount ?? min);
  const rng = createSeededRandom(seed);
  const rolled = Math.floor(rng() * (max - min + 1)) + min;
  if (block.type === 'focus_minutes') {
    return snapToFiveInRange(rolled, min, max);
  }
  // You cannot show up on more days than the window has.
  if (block.type === 'distinct_days' && windowDays) {
    return Math.min(Math.max(1, Math.floor(windowDays)), rolled);
  }
  if (block.type === 'day_parts') {
    return Math.min(DAY_PART_COUNT, rolled);
  }
  return rolled;
}

function resolveRewardAmount(reward: QuestReward, seed: string) {
  const amountMode = reward.amountMode ?? 'fixed';
  if (amountMode === 'fixed') {
    return Math.min(MAX_REWARD_FLIES, Math.max(1, reward.amount ?? 1));
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
}) {
  const { block, tasks, timezone, startDate, endDate, counters } = args;

  if (block.type === 'metric_count') {
    if (!block.metricKey) return 0;
    return sumCounters(counters ?? [], block.metricKey, startDate, endDate);
  }

  if (block.type === 'focus_minutes') {
    return Math.floor(
      sumFocusSeconds(tasks, startDate, endDate, (task) => {
        if (task.type !== 'focus-area') return matchesLogicBlock(task, block);
        const scopedTags =
          block.tagMode === 'random_user_tag' && block.resolvedTagId
            ? [block.resolvedTagId]
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
        return true;
      },
    );
  }

  if (block.type === 'day_parts') {
    return countDistinctDayParts(tasks, timezone, startDate, endDate, (task) =>
      matchesLogicBlock(task, block),
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

// No authored reward is anywhere near this. An amount that escapes it came
// from bad data, not a decision, and unbounded it would both print as a
// nonsense badge and pay out for real.
export const MAX_REWARD_FLIES = 10_000;

function clampFlies(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(MAX_REWARD_FLIES, Math.max(0, Math.floor(n)));
}

function sanitizeReward(reward: QuestReward) {
  const next: QuestReward = {
    type: reward.type,
  };
  const flies = reward.type === 'FLIES';
  if (typeof reward.amount === 'number') {
    next.amount = flies ? clampFlies(reward.amount) : reward.amount;
  }
  if (reward.amountMode) next.amountMode = reward.amountMode;
  if (typeof reward.minAmount === 'number') {
    next.minAmount = flies ? clampFlies(reward.minAmount) : reward.minAmount;
  }
  if (typeof reward.maxAmount === 'number') {
    next.maxAmount = flies ? clampFlies(reward.maxAmount) : reward.maxAmount;
  }
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
  };
}

function templateToView(doc: QuestTemplateDoc): QuestTemplateView {
  return {
    id: doc.templateId,
    name: doc.name,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    placement: doc.placement,
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
    windowKey: doc.windowKey,
    title: doc.title,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    expiresAt: doc.expiresAt?.toISOString(),
    lastProgressAt: (doc.lastProgressAt ?? doc.createdAt)?.toISOString(),
    target: doc.target,
    progress: doc.progress,
    completed,
    claimable: completed && !claimed,
    claimed,
    logic: doc.logic,
    claimedObjectiveIds: doc.claimedObjectiveIds ?? [],
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

function rollSlotRewards(slot: RecipeSlot, seedBase: string): QuestRewards {
  return [
    ...pickSlotReward(slot.rewards, `${seedBase}:reward`),
    ...rollBonusRewards(slot.bonusRewards, `${seedBase}:bonus`),
  ];
}

function backfillAuthoredRewards(args: {
  logic: QuestLogicBlock[];
  slots: RecipeSlot[];
  userId: string;
  templateId: string;
}): QuestLogicBlock[] {
  const { logic, slots, userId, templateId } = args;
  return logic.map((block) => {
    if (block.baseRewards?.length) return block;
    const match = /^slot-(\d+)$/.exec(block.id);
    const index = match ? Number(match[1]) - 1 : -1;
    const slot = index >= 0 ? slots[index] : undefined;
    if (!slot) return block;
    const authored = rollSlotRewards(
      slot,
      `${userId}:${templateId}:slot:${index}`,
    );
    if (authored.length === 0) return block;
    return { ...block, baseRewards: authored, rewards: authored };
  });
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

function retroactiveBaseline(args: {
  placement: QuestPlacement;
  isNewDoc: boolean;
  rawProgress: number;
  target: number;
}): number {
  if (args.placement !== 'daily' || !args.isNewDoc) return 0;
  const creditable = Math.max(0, args.target - 1);
  return Math.max(0, args.rawProgress - creditable);
}

function poolEntryFamily(entry: RecipePoolEntry): string {
  if (entry.type === 'metric_count') {
    return `metric:${entry.metricKey ?? 'unknown'}`;
  }
  if (entry.type === 'focus_minutes' || entry.type === 'deep_session') {
    return 'focus';
  }
  return 'tasks';
}

function poolEntryShape(entry: RecipePoolEntry): string {
  if (entry.type === 'metric_count') {
    return `metric:${entry.metricKey ?? 'unknown'}`;
  }
  if (entry.type === 'count') {
    const action = entry.action ?? 'complete';
    if (action === 'complete' && typeof entry.beforeHour === 'number') {
      return 'count:complete:early';
    }
    return `count:${action}`;
  }
  return entry.type;
}

const ANCHOR_FAMILY = 'tasks';

const HISTORY_WINDOW_DAYS = 14;

function activeDayMedian(values: number[]): number | null {
  const active = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (active.length === 0) return null;
  const mid = Math.floor(active.length / 2);
  return active.length % 2 === 0
    ? (active[mid - 1] + active[mid]) / 2
    : active[mid];
}

function historyBaseline(args: {
  entry: RecipePoolEntry;
  tasks: TaskDoc[];
  timezone: string;
  todayKey: string;
}): number | null {
  const { entry, tasks, timezone, todayKey } = args;
  const perDay: number[] = [];
  for (let offset = 1; offset <= HISTORY_WINDOW_DAYS; offset += 1) {
    const dateKey = shiftDateKey(todayKey, -offset);
    if (entry.type === 'focus_minutes') {
      perDay.push(
        Math.floor(
          sumFocusSeconds(tasks, dateKey, dateKey, () => true) / 60,
        ),
      );
    } else if (entry.action === 'add') {
      perDay.push(
        countAddedTasks(tasks, timezone, dateKey, dateKey, (task) => !task.isStarter),
      );
    } else {
      perDay.push(countCompletedEvents(tasks, timezone, dateKey, dateKey, () => true));
    }
  }
  return activeDayMedian(perDay);
}

function supportsHistoryScaling(entry: RecipePoolEntry): boolean {
  return entry.type === 'count' || entry.type === 'focus_minutes';
}

function scaledTargetFor(args: {
  entry: RecipePoolEntry;
  tasks: TaskDoc[];
  timezone: string;
  todayKey: string;
}): number | null {
  const { entry } = args;
  if (!entry.scaleFromHistory || !supportsHistoryScaling(entry)) return null;
  const min = Math.max(1, Math.floor(entry.minTarget));
  const max = Math.max(min, Math.floor(entry.maxTarget));
  const baseline = historyBaseline(args);
  if (baseline === null) return min;
  const factor = entry.scaleFactor && entry.scaleFactor > 0 ? entry.scaleFactor : 1;
  const scaled = Math.round(baseline * factor);
  const clamped = Math.min(max, Math.max(min, scaled));
  return entry.type === 'focus_minutes'
    ? snapToFiveInRange(clamped, min, max)
    : clamped;
}

function effortUnits(args: {
  entry: RecipePoolEntry;
  target: number;
}): number {
  const { entry, target } = args;
  const amount = Math.max(1, target);
  switch (entry.type) {
    case 'focus_minutes':
      return amount / 5;
    case 'deep_session':
      return amount * (Math.max(5, entry.sessionMinutes ?? 25) / 5) * 1.25;
    case 'day_parts':
      return amount * 1.6;
    case 'distinct_days':
      return amount * 2;
    case 'metric_count':
      return amount * 2.5;
    default:
      if (entry.action === 'add') {
        return amount * (entry.requiresFollowThrough ? 1.2 : 0.5);
      }
      return amount * (typeof entry.beforeHour === 'number' ? 1.3 : 1);
  }
}

function midTarget(entry: RecipePoolEntry): number {
  const min = Math.max(1, Math.floor(entry.minTarget));
  const max = Math.max(min, Math.floor(entry.maxTarget));
  return Math.round((min + max) / 2);
}

const EFFORT_PRICE_MIN = 0.7;
const EFFORT_PRICE_MAX = 1.5;

function effortPriceMultiplier(args: {
  pool: RecipePoolEntry[];
  entry: RecipePoolEntry;
  target: number;
}): number {
  const reference = activeDayMedian(
    args.pool.map((entry) => effortUnits({ entry, target: midTarget(entry) })),
  );
  if (!reference) return 1;
  const rolled = effortUnits({ entry: args.entry, target: args.target });
  return Math.min(
    EFFORT_PRICE_MAX,
    Math.max(EFFORT_PRICE_MIN, rolled / reference),
  );
}

function flyRewardTotal(rewards: QuestRewards): number {
  return rewards.reduce((sum, reward) => {
    if (reward.type !== 'FLIES') return sum;
    return (
      sum +
      Math.max(0, reward.amount ?? reward.minAmount ?? reward.maxAmount ?? 0)
    );
  }, 0);
}

function scaleFlyRewards(
  rewards: QuestRewards,
  multiplier: number,
): QuestRewards {
  if (multiplier === 1) return rewards;
  const scale = (value: number | undefined) =>
    typeof value === 'number' ? Math.max(1, Math.round(value * multiplier)) : value;
  return rewards.map((reward) =>
    reward.type === 'FLIES'
      ? {
          ...reward,
          amount: scale(reward.amount),
          minAmount: scale(reward.minAmount),
          maxAmount: scale(reward.maxAmount),
        }
      : reward,
  );
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

const MIN_CUTOFF_RUNWAY_HOURS = 1;

// Whether enough of the day is left for a time-shaped objective to be winnable
// at all: a "before noon" ask rolled at 3pm, or two separate stretches of the
// day rolled in the evening, is dead on arrival.
function hasRunwayToday(
  entry: RecipePoolEntry,
  localHour: number | undefined,
): boolean {
  if (typeof localHour !== 'number') return true;
  if (
    entry.type === 'count' &&
    (entry.action ?? 'complete') === 'complete' &&
    typeof entry.beforeHour === 'number'
  ) {
    return entry.beforeHour - localHour >= MIN_CUTOFF_RUNWAY_HOURS;
  }
  if (entry.type === 'day_parts') {
    const partsLeft = DAY_PART_COUNT - dayPartOfHour(localHour);
    return partsLeft >= Math.max(1, Math.floor(entry.minTarget));
  }
  return true;
}

// Whether the user can act on a rolled pool entry right now: trading needs a
// full set of same-rarity skins (owned, or buyable with current flies plus a
// day's earnings), acquiring needs spending power
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
  localHour?: number;
  tagIds?: string[];
}): boolean {
  const { entry, user, catalog, tasks, todayKey } = args;
  if (!hasRunwayToday(entry, args.localHour)) return false;
  if (entry.type !== 'metric_count' || !entry.metricKey) return true;
  const metricKey = entry.metricKey;
  const inventory = user.wardrobe?.inventory ?? {};

  // Buddy objectives are dead weight for a user with no friends to buddy up
  // with — never roll them into a quest.
  if (metricKey === 'buddy_task_completed' && !args.hasFriends) return false;

  if (metricKey === 'trade_completed' || metricKey === 'skin_acquired') {
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
          (total) => total >= TRADE_MIN_ITEM_COUNT,
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
        const missing = TRADE_MIN_ITEM_COUNT - (ownedByRarity.get(rarity) ?? 0);
        return flies + NEARLY_AFFORDABLE_FLIES >= missing * price;
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
  localHour?: number;
  tagIds?: string[];
}): RecipePoolEntry[] {
  const base = (args.slot.pool ?? []).filter(
    (entry) =>
      entry &&
      Math.floor(entry.minTarget) > 0 &&
      hasRunwayToday(entry, args.localHour),
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

/**
 * The Leap is the reward for reaching its own onboarding step. Before that the
 * roster is still teaching the basics, and a "pick your area" banner competing
 * with "finish 1 task" asks a brand-new user to commit to a week before they
 * have finished anything.
 *
 * The step lives inside First Hops rather than being its own quest, so this
 * resolves at objective granularity using the same rule the UI uses to pick the
 * active onboarding objective: the first rewarded block not yet claimed.
 * Reaching it is enough — clearing it is not required, or the very objective
 * telling you to take a Leap would point at something hidden.
 */
export async function hasReachedLeapOnboardingStep(
  userId: string,
): Promise<boolean> {
  const [templates, docs] = await Promise.all([
    QuestTemplateModel.find({ isActive: true, placement: 'onboarding' })
      .sort({ createdAt: 1 })
      .lean<QuestTemplateDoc[]>(),
    QuestModel.find({ userId, placement: 'onboarding' })
      .select('templateId logic claimedObjectiveIds')
      .lean<
        { templateId: string; logic?: any[]; claimedObjectiveIds?: string[] }[]
      >(),
  ]);

  const rewardedBlocks = (template: QuestTemplateDoc) =>
    (template.logic ?? []).filter((block) => (block.rewards?.length ?? 0) > 0);
  const isLeapBlock = (block: { type?: string; metricKey?: string }) =>
    block.type === 'metric_count' && block.metricKey === LEAP_ONBOARDING_METRIC;

  // A roster that never asks for a Leap must not lock it away forever.
  if (!templates.some((template) => rewardedBlocks(template).some(isLeapBlock))) {
    return true;
  }

  const byTemplate = new Map(docs.map((doc) => [doc.templateId, doc]));
  for (const template of templates) {
    const blocks = rewardedBlocks(template);
    const leapIndex = blocks.findIndex(isLeapBlock);
    const doc = byTemplate.get(template.templateId);
    if (leapIndex >= 0) {
      const claimed = doc?.claimedObjectiveIds ?? [];
      return blocks
        .slice(0, leapIndex)
        .every((block) => claimed.includes(block.id));
    }
    if (!doc || !isQuestDocFullyClaimed(doc)) return false;
  }
  return true;
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
      : `${template.templateId}:onboarding`;

  let doc =
    args.existingDoc ??
    new QuestModel({
      userId,
      questId,
      templateId: template.templateId,
      rollKey: crypto.randomUUID(),
      placement: template.placement,
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

  const isNewDoc = !!(doc as any).isNew;

  const startDate =
    template.placement === 'daily'
      ? windowKey
      : getZonedYMD(doc.createdAt ?? new Date(), timezone);
  const endDate = getZonedToday(timezone);
  const userTags = (user.tags ?? []).filter(
    (tag) => !!getUserTagId(tag),
  );
  const templateLogic = template.logic;

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
      1,
    );
      const resolvedBlock: ResolvedQuestLogicBlock = {
        ...block,
        target,
        progress: 0,
        resolvedTagId: getUserTagId(resolvedTag) ?? undefined,
        resolvedTagName: getUserTagName(resolvedTag) ?? undefined,
      };
    const rawProgress = progressForLogicBlock({
      block: resolvedBlock,
      tasks,
      timezone,
      startDate,
      endDate,
      counters,
    });
    const baselineProgress = block.preCredited
      ? 0
      : typeof block.baselineProgress === 'number'
        ? Math.max(0, block.baselineProgress)
        : retroactiveBaseline({
            placement: template.placement,
            isNewDoc,
            rawProgress,
            target,
          });
    const progress = block.preCredited
      ? target
      : Math.max(0, rawProgress - baselineProgress);
    const authoredRewards = (block.baseRewards ?? block.rewards ?? []).filter(
      (r): r is QuestReward => isSupportedReward(r as { type?: string }),
    );
    const resolvedRewards = authoredRewards.map((r, ri) =>
      resolveReward(
        r,
        `${userId}:${template.templateId}:${windowKey}:${doc.rollKey}:obj-reward:${block.id}:${ri}`,
      ),
    );
    return {
      ...resolvedBlock,
      progress,
      baselineProgress,
      baseRewards: authoredRewards.length > 0 ? authoredRewards : undefined,
      rewards: resolvedRewards.length > 0 ? resolvedRewards : undefined,
    };
  });

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
  changed = setQuestField(doc, 'windowKey', windowKey) || changed;
  changed = setQuestField(doc, 'title', template.name) || changed;
  changed = setQuestField(doc, 'description', template.description) || changed;
  changed = setQuestField(doc, 'logic', resolvedLogic) || changed;
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

function rollDailyLogic(args: {
  recipe: QuestRecipeDoc;
  userId: string;
  templateId: string;
  selectionSeed?: string;
  user: UserDoc;
  catalog: ItemDef[];
  tasks: TaskDoc[];
  timezone: string;
  todayKey: string;
  hasFriends: boolean;
}): QuestLogicBlock[] {
  const { recipe, userId, templateId, tasks, timezone, todayKey } = args;
  const seedBase = args.selectionSeed
    ? `${userId}:${templateId}:${args.selectionSeed}`
    : `${userId}:${templateId}`;
  const usedFamilies = new Set<string>();
  const usedShapes = new Set<string>();
  const blocks: QuestLogicBlock[] = [];
  const localHour = getZonedHour(new Date(), timezone) ?? undefined;
  let previousSlotFlies = 0;

  (recipe.slots ?? []).forEach((slot, index) => {
    if ((slot.rewards ?? []).length === 0) return;

    const eligible = buildEligiblePool({
      slot,
      placement: 'daily',
      user: args.user,
      catalog: args.catalog,
      tasks,
      todayKey,
      hasFriends: args.hasFriends,
      windowDays: 1,
      localHour,
    });
    const anchorOnly =
      index === 0
        ? eligible.filter((entry) => poolEntryFamily(entry) === ANCHOR_FAMILY)
        : [];
    const candidates = anchorOnly.length > 0 ? anchorOnly : eligible;
    const distinct = candidates.filter((entry) => {
      if (usedShapes.has(poolEntryShape(entry))) return false;
      const family = poolEntryFamily(entry);
      return family === ANCHOR_FAMILY || !usedFamilies.has(family);
    });
    const pool = distinct.length > 0 ? distinct : candidates;

    const slotSeed = `${seedBase}:slot:${index}`;
    const pick = pickWeighted(pool, createSeededRandom(slotSeed));
    if (!pick) return;
    usedFamilies.add(poolEntryFamily(pick));
    usedShapes.add(poolEntryShape(pick));

    const minAmount = Math.max(1, Math.floor(pick.minTarget));
    const base: QuestLogicBlock = {
      id: `slot-${index + 1}`,
      type: pick.type,
      subject: 'task',
      action: pick.type === 'count' ? pick.action ?? 'complete' : undefined,
      amountMode: 'random',
      minAmount,
      maxAmount: Math.max(minAmount, Math.floor(pick.maxTarget)),
      tagMode: 'ignore',
      metricKey:
        pick.type === 'metric_count'
          ? resolveRecipeMetricKey(pick, `${slotSeed}:streak`)
          : undefined,
      ...recipePickModifiers(pick),
    };

    const target =
      scaledTargetFor({ entry: pick, tasks, timezone, todayKey }) ??
      resolveLogicTarget(base, `${slotSeed}:target`, 1);
    const rewards = rollSlotRewards(slot, slotSeed);

    let priced = rewards;
    if (recipe.priceByEffort) {
      const authoredFlies = flyRewardTotal(rewards);
      let multiplier = effortPriceMultiplier({
        pool: candidates,
        entry: pick,
        target,
      });
      // Slot order promises a rising payout, and that promise outranks the
      // effort adjustment: a cheap roll late in the ladder is held at the
      // previous slot's amount rather than dropping below it.
      if (authoredFlies > 0 && previousSlotFlies > 0) {
        multiplier = Math.max(multiplier, previousSlotFlies / authoredFlies);
      }
      priced = scaleFlyRewards(rewards, multiplier);
    }
    previousSlotFlies = Math.max(previousSlotFlies, flyRewardTotal(priced));

    blocks.push({
      ...base,
      amountMode: 'fixed',
      amount: target,
      rewards: priced,
    });
  });

  return blocks;
}

export async function syncQuestState(args: {
  userId: string;
  timezone: string;
  catalog?: ItemDef[];
  includeCatalog?: boolean;
  includeCategories?: boolean;
  refreshDaily?: boolean;
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
    QuestTemplateModel.find({
      isActive: true,
      placement: 'onboarding',
    }).lean<QuestTemplateDoc[]>(),
    includeCategories
      ? QuestCategoryModel.find({}).sort({ createdAt: 1 }).lean<QuestCategoryDoc[]>()
      : QuestCategoryModel.find({}, { categoryId: 1, name: 1, shortLabel: 1 })
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
  const filteredTemplates = [...templates]
    .sort(byTemplateOrder)
    .filter((template) =>
    matchesVisibilityConditions(
      template.visibilityConditions,
      visibilityMetrics,
    ),
  );

  let selectedDailyTemplates: QuestTemplateDoc[] = [];

  // The day's quests are ONE quest holding an objective per recipe slot (slot
  // order = difficulty order). The roll is frozen in the day's quest doc once
  // created:
  // pool eligibility depends on user state (flies, inventory) that changes
  // during the day, so re-rolling mid-day could swap objectives.
  const dailyRecipe = recipes.find(
    (r) => r.placement === 'daily' && r.isActive && (r.slots ?? []).length > 0,
  );
  if (dailyRecipe) {
    const templateId = `gend:${todayKey}`;
    const frozenDaily = allExistingDocs.find(
      (doc) => doc.placement === 'daily' && doc.templateId === templateId,
    );
    const rolledLogic = frozenDaily?.logic?.length
      ? backfillAuthoredRewards({
          logic: frozenDaily.logic as QuestLogicBlock[],
          slots: (dailyRecipe.slots ?? []) as RecipeSlot[],
          userId,
          templateId,
        })
      : rollDailyLogic({
          recipe: dailyRecipe,
          userId,
          templateId,
          selectionSeed: args.dailySelectionSeed,
          user,
          catalog,
          tasks,
          timezone,
          todayKey,
          hasFriends,
        });
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
    // Delete stale daily docs from PAST days only. A window key ahead of today
    // means this sync is running on a lagging clock — a write whose request
    // carried no timezone falls back to UTC, which is still yesterday for a
    // user east of it — and that roll is the live one, not a stale one.
    if (doc.placement === 'daily' && doc.windowKey < todayKey) {
      return true;
    }
    return false;
  });

  const deleteIdSet = new Set(docsToDelete.map((doc) => doc._id.toString()));
  const deletePromise =
    docsToDelete.length > 0
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
      const docId = doc._id.toString();
      if (deleteIdSet.has(docId)) continue;
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

  const rerollsUsedToday =
    user.dailyQuestReroll?.date === todayKey
      ? Math.max(0, user.dailyQuestReroll.count ?? 0)
      : 0;
  const claimedAnythingToday = allExistingDocs.some(
    (doc) =>
      doc.placement === 'daily' &&
      doc.windowKey === todayKey &&
      (!!doc.claimedAt || (doc.claimedObjectiveIds ?? []).length > 0),
  );
  const dailyRerollsLeft =
    dailyQuestsGated || claimedAnythingToday
      ? 0
      : Math.max(0, DAILY_QUEST_REROLLS_PER_DAY - rerollsUsedToday);

  return {
    user,
    tasks,
    catalog,
    isPremium: premium,
    focusProfile: profile,
    macroCategories: categories.map(categoryDocToDefinition),
    templatesWithCover,
    dailyQuests: visibleDailyQuests,
    dailyQuestsGated,
    dailyRerollsLeft,
    firstOnboardingComplete,
    earlyObjectiveSteps,
    onboardingQuests,
    rewardCatalog: includeCatalog
      ? buildRewardCatalog(
          catalog,
          [
            ...dailyQuests.flatMap((quest) =>
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
    };
    user.markModified('focusProfile');
    await user.save();
  }

  return syncQuestState({ userId, timezone });
}

export async function claimQuestReward(args: {
  userId: string;
  claimType: 'daily';
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

  // Save quest and user in parallel
  await Promise.all([quest.save(), user.save()]);
  return summary;
}
