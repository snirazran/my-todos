import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { buildRewardCatalog, syncQuestState } from '@/lib/quests/engine';
import { ensurePactConfig } from '@/lib/pact/engine';
import { loadStreakConfig, previousDayKey, syncDailyStreak } from '@/lib/quests/streak';
import { parseTaskStreakDays } from '@/lib/quests/metrics';
import { rewardWorth } from '@/lib/quests/priority';
import { loadMoveToWebConfig, syncMoveToWeb } from '@/lib/quests/moveToWeb';
import { getActiveQuestSeasonView } from '@/lib/quests/seasons';
import { getZonedToday } from '@/lib/utils';
import { getCachedCatalog } from '@/lib/skins/getCatalog';
import {
  metricObjectiveLabel,
  metricRemainingLabel,
  objectiveHintText,
} from '@/lib/quests/metricLabels';
import { guideContextForBlock, guideIdForBlock } from '@/lib/hints/guides';

const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

const templateCoverRef = (templateId: string) =>
  `/api/quests/cover?type=template&id=${encodeURIComponent(templateId)}`;

const categoryCoverRef = (categoryId: string) =>
  `/api/quests/cover?type=category&id=${encodeURIComponent(categoryId)}`;

const FREE_TAG_LIMIT = 6;
const AREA_UNLOCK_STEP_TARGET = 5;
const AREA_UNLOCK_LIFETIME_TASKS = 10;

async function resolveAreaQuestsUnlocked(
  userId: string,
  dashboard: Awaited<ReturnType<typeof syncQuestState>>,
): Promise<Date | null> {
  const existing = dashboard.focusProfile.areaQuestsUnlockedAt;
  if (existing) return new Date(existing);

  const earlySteps = dashboard.earlyObjectiveSteps;
  const hasFocusFootprint =
    (dashboard.focusProfile.categoryTagMap?.length ?? 0) > 0 ||
    dashboard.categoryQuests.some(
      (quest) =>
        quest.claimedObjectiveIds.length > 0 ||
        quest.logic.some((block) => block.progress > 0),
    );
  const lifetimeTaskCompletions = dashboard.tasks.reduce(
    (sum, task) =>
      sum + (task.completedDates?.length ?? 0) + (task.completed ? 1 : 0),
    0,
  );
  // Escape hatch: when the only objectives left on screen ask the user to
  // start an area quest, keeping areas locked would deadlock progression.
  const visibleBlocks = [
    ...(dashboard.onboardingQuests ?? []),
    ...dashboard.dailyQuests,
  ].flatMap((quest) => quest.logic);
  const unmetBlocks = visibleBlocks.filter(
    (block) => block.progress < Math.max(1, block.target),
  );
  const stuckOnAreaStart =
    unmetBlocks.length > 0 &&
    unmetBlocks.every((block) => block.metricKey === 'focus_tag_linked');

  const unlocked =
    hasFocusFootprint ||
    earlySteps >= AREA_UNLOCK_STEP_TARGET ||
    lifetimeTaskCompletions >= AREA_UNLOCK_LIFETIME_TASKS ||
    stuckOnAreaStart;
  if (!unlocked) return null;
  const unlockedAt = new Date();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { 'focusProfile.areaQuestsUnlockedAt': unlockedAt } },
  );
  return unlockedAt;
}

function withTemplateCover<T extends { templateId?: string; coverImageUrl?: string }>(
  quest: T,
  templatesWithCover: Set<string>,
): T {
  if (!quest.templateId || !templatesWithCover.has(quest.templateId)) return quest;
  return { ...quest, coverImageUrl: templateCoverRef(quest.templateId) };
}

function lightenCategory<T extends { id?: string; coverImageUrl?: string }>(
  category: T,
): T {
  if (!isDataUrl(category.coverImageUrl) || !category.id) return category;
  return { ...category, coverImageUrl: categoryCoverRef(category.id) };
}

type ObjectiveLabelBlock = {
  type?: string;
  subject?: string;
  action?: string;
  tagMode?: string;
  metricKey?: string;
  target?: number;
  progress?: number;
  sessionMinutes?: number;
  requiresFollowThrough?: boolean;
  beforeHour?: number;
};

function objectiveSummaryLabel(
  block: ObjectiveLabelBlock,
  tagName?: string,
): string {
  const target = Math.max(0, block.target ?? 0);
  const usesFocusTags = block.tagMode === 'focus_category_tags';
  if (block.type === 'metric_count') {
    return metricObjectiveLabel(block.metricKey, target, {
      tagScoped: usesFocusTags,
    });
  }
  if (block.type === 'focus_minutes') {
    if (!usesFocusTags) return `Focus for ${target} minutes on tasks`;
    return tagName
      ? `Focus for ${target} minutes on ${tagName}`
      : `Focus for ${target} minutes on quest tasks`;
  }
  if (block.type === 'distinct_days') {
    const days = target === 1 ? 'day' : 'different days';
    const scope = usesFocusTags
      ? tagName
        ? ` on ${tagName}`
        : ' on quest tasks'
      : '';
    return `Show up${scope} ${target} ${days}`;
  }
  if (block.type === 'deep_session') {
    const minutes = block.sessionMinutes ?? 25;
    const scope = usesFocusTags
      ? tagName
        ? ` on ${tagName}`
        : ' on a quest task'
      : '';
    return target === 1
      ? `Focus ${minutes} min without a break${scope}`
      : `Focus ${minutes} min without a break${scope}, ${target} times`;
  }
  const subject = block.subject === 'any' || target !== 1 ? 'tasks' : 'task';
  const scope = usesFocusTags
    ? tagName
      ? `${tagName} ${subject}`
      : `quest ${subject}`
    : subject;
  if (block.action === 'add') {
    return block.requiresFollowThrough
      ? `Plan ${target} ${scope} and finish ${target === 1 ? 'it' : 'them'}`
      : `Add ${target} ${scope}`;
  }
  if (typeof block.beforeHour === 'number') {
    return `Finish ${target} ${scope} ${hourCutoffLabel(block.beforeHour)}`;
  }
  return `Complete ${target} ${scope}`;
}

function hourCutoffLabel(hour: number): string {
  if (hour === 12) return 'before noon';
  if (hour < 12) return `before ${hour}am`;
  return `before ${hour - 12}pm`;
}

type ObjectiveTagChip = {
  id: string;
  name: string;
  color: string;
};

type ClaimableEntry = {
  id: string;
  questId?: string;
  objectiveId?: string;
  kind: 'objective' | 'season';
  placement?: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
  objectiveLabel?: string;
  tags?: ObjectiveTagChip[];
  seasonId?: string;
  seasonName?: string;
  day?: number;
  reward?: any;
  rewards?: any[];
};

type TrackableEntry = {
  id: string;
  questId: string;
  placement: 'daily' | 'category' | 'onboarding';
  categoryId?: string;
  categoryName?: string;
  objectiveLabel: string;
  remainingLabel: string;
  objectiveType?: string;
  actionKey?: string;
  questDone?: number;
  questTotal?: number;
  tags?: ObjectiveTagChip[];
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  tierIndex?: number;
  reward?: any;
  rewards?: any[];
  hint?: string;
  guideId?: string;
  guideContext?: import('@/lib/hints/guides').HintGuideContext;
  lastProgressAt?: string;
  expiresAt?: string;
  effortToActNow?: number;
  effortToComplete?: number;
  effortAtRiskDays?: number;
  rewardValue?: number;
};

// Exchange rates between objective units and "days of work". These are the
// single place ranking decides a focus minute is worth a tenth of a task, and
// the only inputs that need calibrating against real completion telemetry.
const TASK_UNIT_EFFORT_DAYS = 0.1;
const FOCUS_MINUTE_EFFORT_DAYS = 0.01;
// Typing a title is not the work; only the follow-through is. A bare add is
// priced near zero so it reads as the on-ramp it is.
const ADD_UNIT_EFFORT_DAYS = 0.01;
// A day you have to show up on cannot be compressed by working harder today,
// so each one costs most of a calendar day.
const DISTINCT_DAY_EFFORT_DAYS = 0.8;

type EffortTask = {
  type?: string;
  tags?: string[];
  completedDates?: string[];
  lateCompletedDates?: string[];
};

function bestStreakRun(
  tasks: EffortTask[],
  todayKey: string,
  tagIds?: string[],
): { runDays: number; completedToday: boolean } {
  const wanted = tagIds?.length ? new Set(tagIds) : null;
  let best = { runDays: 0, completedToday: false };
  for (const task of tasks) {
    if (task.type !== 'weekly') continue;
    if (wanted && !task.tags?.some((tagId) => wanted.has(tagId))) continue;
    const dates = new Set(task.completedDates ?? []);
    for (const d of task.lateCompletedDates ?? []) dates.delete(d);
    const completedToday = dates.has(todayKey);
    let runDays = completedToday ? 1 : 0;
    let day = previousDayKey(todayKey);
    while (dates.has(day)) {
      runDays += 1;
      day = previousDayKey(day);
    }
    if (
      runDays > best.runDays ||
      (runDays === best.runDays && completedToday && !best.completedToday)
    ) {
      best = { runDays, completedToday };
    }
  }
  return best;
}

// Two different effort questions, and ranking needs them apart. `actNow` is
// what it takes to move this objective today — the WSJF denominator. `complete`
// is what it takes to finish outright, which for a streak is calendar days no
// amount of effort today can compress.
function objectiveEffort(
  block: {
    type?: string;
    metricKey?: string;
    target?: number;
    progress?: number;
    action?: string;
    sessionMinutes?: number;
    requiresFollowThrough?: boolean;
  },
  tasks: EffortTask[],
  todayKey: string,
  tagIds?: string[],
): {
  effortToActNow: number;
  effortToComplete: number;
  effortAtRiskDays: number;
} {
  const target = Math.max(1, block.target ?? 1);
  const remainingUnits = Math.max(1, target - Math.max(0, block.progress ?? 0));
  const streakDays = parseTaskStreakDays(block.metricKey);
  if (block.type === 'metric_count' && streakDays !== null) {
    const { runDays, completedToday } = bestStreakRun(tasks, todayKey, tagIds);
    const credit = runDays >= streakDays ? 0 : runDays;
    const effortToComplete =
      streakDays - credit + (remainingUnits - 1) * streakDays;
    return {
      // Today's link in the chain is one task. Once it is done there is no
      // action left to surface, so it costs the wait until tomorrow.
      effortToActNow: completedToday ? effortToComplete : TASK_UNIT_EFFORT_DAYS,
      effortToComplete,
      effortAtRiskDays: completedToday ? 0 : credit,
    };
  }
  if (block.type === 'distinct_days') {
    // Today's link is one task, but only while today is still unclaimed —
    // once it counts, no amount of work today buys the next day.
    const wanted = tagIds?.length ? new Set(tagIds) : null;
    const showedUpToday = tasks.some((task) => {
      if (wanted && !task.tags?.some((tagId) => wanted.has(tagId))) return false;
      return (task.completedDates ?? []).includes(todayKey);
    });
    const effortToComplete = remainingUnits * DISTINCT_DAY_EFFORT_DAYS;
    return {
      effortToActNow: showedUpToday ? effortToComplete : TASK_UNIT_EFFORT_DAYS,
      effortToComplete,
      effortAtRiskDays: 0,
    };
  }
  if (block.type === 'deep_session') {
    const days = remainingUnits * (block.sessionMinutes ?? 25) * FOCUS_MINUTE_EFFORT_DAYS;
    return {
      effortToActNow: days,
      effortToComplete: days,
      effortAtRiskDays: 0,
    };
  }
  const unitDays =
    block.type === 'focus_minutes'
      ? FOCUS_MINUTE_EFFORT_DAYS
      : block.action === 'add' && !block.requiresFollowThrough
        ? ADD_UNIT_EFFORT_DAYS
        : TASK_UNIT_EFFORT_DAYS;
  const days = remainingUnits * unitDays;
  return {
    effortToActNow: days,
    effortToComplete: days,
    effortAtRiskDays: 0,
  };
}


function objectiveRemainingLabel(
  block: ObjectiveLabelBlock,
  tagName?: string,
): string {
  const target = Math.max(1, block.target ?? 1);
  const progress = Math.max(0, block.progress ?? 0);
  if (progress <= 0) return objectiveSummaryLabel(block, tagName);
  const remaining = Math.max(1, target - progress);
  const usesFocusTags = block.tagMode === 'focus_category_tags';
  if (block.type === 'metric_count') {
    return metricRemainingLabel(block.metricKey, remaining, {
      tagScoped: usesFocusTags,
    });
  }
  if (block.type === 'focus_minutes') {
    if (!usesFocusTags) return `Focus ${remaining} more min`;
    return tagName
      ? `Focus ${remaining} more min on ${tagName}`
      : `Focus ${remaining} more min on quest tasks`;
  }
  if (block.type === 'distinct_days') {
    return remaining === 1
      ? 'Show up on 1 more day'
      : `Show up on ${remaining} more days`;
  }
  if (block.type === 'deep_session') {
    const minutes = block.sessionMinutes ?? 25;
    return remaining === 1
      ? `One more ${minutes}-min unbroken session`
      : `${remaining} more ${minutes}-min unbroken sessions`;
  }
  const subject = remaining === 1 ? 'task' : 'tasks';
  const scope = usesFocusTags
    ? tagName
      ? `${tagName} ${subject}`
      : `quest ${subject}`
    : subject;
  if (block.action === 'add') {
    return block.requiresFollowThrough
      ? `Finish ${remaining} more planned ${scope}`
      : `Add ${remaining} more ${scope}`;
  }
  if (typeof block.beforeHour === 'number') {
    return `Finish ${remaining} more ${scope} ${hourCutoffLabel(block.beforeHour)}`;
  }
  return `Complete ${remaining} more ${scope}`;
}

function normalizeQuestTag(tag: any, index: number, isPremium: boolean) {
  if (typeof tag === 'string') {
    const name = tag.trim();
    if (!name) return null;
    return {
      id: name,
      name,
      color: '#22c55e',
      key: `${name}-${index}`,
      disabled: !isPremium && index >= FREE_TAG_LIMIT,
    };
  }

  if (!tag || typeof tag !== 'object') return null;

  const name =
    typeof tag.name === 'string' && tag.name.trim()
      ? tag.name.trim()
      : typeof tag.id === 'string' && tag.id.trim()
        ? tag.id.trim()
        : '';

  if (!name) return null;

  const id =
    typeof tag.id === 'string' && tag.id.trim()
      ? tag.id.trim()
      : name;
  const color =
    typeof tag.color === 'string' && tag.color.trim()
      ? tag.color.trim()
      : '#22c55e';

  return {
    id,
    name,
    color,
    key: typeof tag._key === 'string' ? tag._key : `${id}-${index}`,
    disabled: !isPremium && index >= FREE_TAG_LIMIT,
  };
}

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Unauthorized' }
        : {
            error: 'Unauthorized',
            details: error instanceof Error ? error.message : 'Unknown auth error',
          },
      { status: 401 },
    );
  }

  try {
    await connectMongo();
    const searchParams = new URL(req.url).searchParams;
    const timezone = searchParams.get('timezone') || 'UTC';
    const view = searchParams.get('view');
    const isSummary = view === 'summary' || view === 'home' || searchParams.get('summary') === '1';
    const includeCategories =
      !isSummary ||
      view === 'home' ||
      searchParams.get('includeCategories') === '1';

    const [dashboard, activeSeason, streakConfig, moveToWebConfig, pactConfig] =
      await Promise.all([
        syncQuestState({
          userId,
          timezone,
          includeCatalog: !isSummary,
          includeCategories,
        }),
        getActiveQuestSeasonView({ userId, timezone }),
        loadStreakConfig(),
        loadMoveToWebConfig(),
        ensurePactConfig(),
      ]);

    // The weekly pact replaced area quests outright. They are dropped at the
    // source rather than hidden per-surface, so they cannot come back as a
    // "next up" objective, a claimable, or a badge count while the pact runs.
    if (pactConfig.isActive) dashboard.categoryQuests = [];
    const dailyStreak = await syncDailyStreak({
      user: dashboard.user,
      config: streakConfig,
      dailyQuests: dashboard.dailyQuests,
      todayKey: getZonedToday(timezone),
    });
    const moveToWebSynced = await syncMoveToWeb({
      user: dashboard.user,
      config: moveToWebConfig,
    });
    const moveToWeb = dashboard.firstOnboardingComplete
      ? moveToWebSynced
      : null;
    const areaQuestsUnlockedAt = await resolveAreaQuestsUnlocked(
      userId,
      dashboard,
    );
    const areaQuestsUnlocked = !!areaQuestsUnlockedAt;
    // Count prizes ready to collect. Quests no longer have an end-reward —
    // only per-objective rewards are claimable, so count one per completed
    // objective with unclaimed rewards.
    const questClaimable = [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests, ...dashboard.categoryQuests].reduce(
      (sum, quest) => {
        if (quest.claimed || quest.locked) return sum;
        let count = 0;
        quest.logic.forEach((block) => {
          if (
            (block.rewards?.length ?? 0) > 0 &&
            block.progress >= block.target &&
            !quest.claimedObjectiveIds.includes(block.id)
          ) {
            count++;
          }
        });
        return sum + count;
      },
      0,
    );
    const seasonDailyClaimable =
      activeSeason && activeSeason.claimable && !activeSeason.claimedToday ? 1 : 0;
    const streakClaimable = dailyStreak?.claimable ? 1 : 0;
    const moveToWebClaimable = moveToWeb?.claimable ? 1 : 0;
    const claimableCount =
      questClaimable + seasonDailyClaimable + streakClaimable + moveToWebClaimable;

    const categoryNameById = new Map<string, string>(
      (dashboard.macroCategories ?? []).map((c: any) => [c.id, c.name]),
    );
    const tagChipById = new Map<string, ObjectiveTagChip>();
    for (const tag of (dashboard.user.tags ?? []) as unknown[]) {
      if (typeof tag === 'string') {
        const name = tag.trim();
        if (name) tagChipById.set(name, { id: name, name, color: '#22c55e' });
        continue;
      }
      if (!tag || typeof tag !== 'object') continue;
      const name =
        typeof (tag as any).name === 'string' && (tag as any).name.trim()
          ? (tag as any).name.trim()
          : typeof (tag as any).id === 'string'
            ? (tag as any).id.trim()
            : '';
      if (!name) continue;
      const id =
        typeof (tag as any).id === 'string' && (tag as any).id.trim()
          ? (tag as any).id.trim()
          : name;
      const color =
        typeof (tag as any).color === 'string' && (tag as any).color.trim()
          ? (tag as any).color.trim()
          : '#22c55e';
      tagChipById.set(id, { id, name, color });
    }
    const focusTagsByCategory = new Map<string, ObjectiveTagChip[]>(
      (dashboard.focusProfile.categoryTagMap ?? []).map((entry: any) => [
        entry.categoryId,
        (entry.tagIds ?? [])
          .map((tagId: string) => tagChipById.get(tagId))
          .filter(Boolean) as ObjectiveTagChip[],
      ]),
    );
    const questFocusTags = (quest: { categoryId?: string }) =>
      quest.categoryId ? focusTagsByCategory.get(quest.categoryId) ?? [] : [];
    const claimables: ClaimableEntry[] = [];
    for (const quest of [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests, ...dashboard.categoryQuests]) {
      if (quest.claimed || quest.locked) continue;
      const activeOnboardingObjectiveId =
        quest.placement === 'onboarding'
          ? quest.logic.find(
              (block) =>
                (block.rewards?.length ?? 0) > 0 &&
                !quest.claimedObjectiveIds.includes(block.id),
            )?.id
          : null;
      for (const block of quest.logic) {
        if (
          quest.placement === 'onboarding' &&
          block.id !== activeOnboardingObjectiveId
        ) {
          continue;
        }
        if (
          (block.rewards?.length ?? 0) > 0 &&
          block.progress >= block.target &&
          !quest.claimedObjectiveIds.includes(block.id)
        ) {
          claimables.push({
            id: `${quest.id}:${block.id}`,
            questId: quest.id,
            objectiveId: block.id,
            kind: 'objective',
            placement: quest.placement,
            categoryName:
              quest.placement === 'category'
                ? categoryNameById.get(quest.categoryId ?? '')
                : undefined,
            objectiveLabel: objectiveSummaryLabel(
              block,
              categoryNameById.get(quest.categoryId ?? ''),
            ),
            tags:
              block.tagMode === 'focus_category_tags'
                ? questFocusTags(quest)
                : undefined,
            reward: block.rewards?.[0],
            rewards: block.rewards ?? undefined,
          });
        }
      }
    }
    const trackables: TrackableEntry[] = [];
    const effortTodayKey = getZonedToday(timezone);
    const withBlockEffort = <
      T extends { categoryId?: string; logic: any[] },
    >(
      quest: T,
    ): T => ({
      ...quest,
      logic: quest.logic.map((block) => ({
        ...block,
        ...objectiveEffort(
          block,
          dashboard.tasks,
          effortTodayKey,
          block.tagMode === 'focus_category_tags'
            ? questFocusTags(quest).map((tag) => tag.id)
            : undefined,
        ),
      })),
    });
    for (const quest of [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests, ...dashboard.categoryQuests]) {
      if (quest.claimed || quest.locked) continue;
      const activeOnboardingObjectiveId =
        quest.placement === 'onboarding'
          ? quest.logic.find(
              (block) =>
                (block.rewards?.length ?? 0) > 0 &&
                !quest.claimedObjectiveIds.includes(block.id),
            )?.id
          : null;
      for (let tierIndex = 0; tierIndex < quest.logic.length; tierIndex++) {
        const block = quest.logic[tierIndex];
        if (
          quest.placement === 'onboarding' &&
          block.id !== activeOnboardingObjectiveId
        ) {
          continue;
        }
        const target = Math.max(1, block.target);
        if ((block.rewards?.length ?? 0) === 0) continue;
        if (block.progress >= target) continue;
        if (quest.claimedObjectiveIds.includes(block.id)) continue;
        trackables.push({
          id: `${quest.id}:${block.id}`,
          questId: quest.id,
          placement: quest.placement,
          tierIndex,
          categoryId:
            quest.placement === 'category' ? quest.categoryId : undefined,
          categoryName:
            quest.placement === 'category'
              ? categoryNameById.get(quest.categoryId ?? '')
              : undefined,
          objectiveLabel: objectiveSummaryLabel(
            block,
            categoryNameById.get(quest.categoryId ?? ''),
          ),
          remainingLabel: objectiveRemainingLabel(
            block,
            categoryNameById.get(quest.categoryId ?? ''),
          ),
          objectiveType: block.type,
          // Where this objective sits in its ladder, so a surface can show the
          // whole arc without re-deriving it from a list that omits finished
          // tiers by design.
          questDone: quest.logic.filter(
            (b) =>
              (b.rewards?.length ?? 0) > 0 &&
              b.progress >= Math.max(1, b.target),
          ).length,
          questTotal: quest.logic.filter((b) => (b.rewards?.length ?? 0) > 0)
            .length,
          // Objectives that the same act advances. Two tiers sharing this key
          // are not two things to do — the nearer one is on the way to the
          // further one, so only the nearer belongs on the "next up" card.
          actionKey: [
            block.type,
            block.action ?? '',
            block.metricKey ?? '',
            block.sessionMinutes ?? '',
            block.beforeHour ?? '',
            block.requiresFollowThrough ? 'follow' : '',
          ].join('|'),
          tags:
            block.tagMode === 'focus_category_tags'
              ? questFocusTags(quest)
              : undefined,
          needsFocusTags:
            quest.placement === 'category' &&
            block.tagMode === 'focus_category_tags' &&
            questFocusTags(quest).length === 0,
          progress: Math.max(0, block.progress),
          target,
          ...objectiveEffort(
            block,
            dashboard.tasks,
            effortTodayKey,
            block.tagMode === 'focus_category_tags'
              ? questFocusTags(quest).map((tag) => tag.id)
              : undefined,
          ),
          reward: block.rewards?.[0],
          rewards: block.rewards ?? undefined,
          rewardValue: rewardWorth(block.rewards),
          lastProgressAt: quest.lastProgressAt,
          expiresAt: quest.expiresAt,
          hint: objectiveHintText(block, questFocusTags(quest)[0]?.name, {
            omitTagScope: block.tagMode === 'focus_category_tags',
          }),
          guideId: guideIdForBlock(block) ?? undefined,
          guideContext: (() => {
            const context = guideContextForBlock(block);
            const focusTags = questFocusTags(quest);
            const tagNames =
              context?.tagNames ??
              (focusTags.length > 0
                ? focusTags.map((tag) => tag.name)
                : undefined);
            const tags = focusTags.length > 0 ? focusTags : undefined;
            const tagIds = context?.tagIds ?? tags?.map((tag) => tag.id);
            return context || tagNames
              ? { ...context, tagNames, tags, tagIds }
              : undefined;
          })(),
        });
      }
    }
    if (activeSeason && activeSeason.claimable && !activeSeason.claimedToday) {
      const dayEntry = activeSeason.rewardsByDay.find(
        (e) => e.day === activeSeason.currentDay,
      );
      const seasonRewards = [
        ...(dayEntry?.freeRewards ?? []),
        ...(dashboard.isPremium ? dayEntry?.premiumRewards ?? [] : []),
      ];
      claimables.push({
        id: `season:${activeSeason.id}:${activeSeason.currentDay}`,
        kind: 'season',
        seasonId: activeSeason.id,
        seasonName: activeSeason.name,
        day: activeSeason.currentDay,
        reward: seasonRewards[0],
        rewards: seasonRewards.length ? seasonRewards : undefined,
      });
    }
    const claimableRewards = [...claimables, ...trackables]
      .flatMap((c) => (c.rewards?.length ? c.rewards : [c.reward]))
      .filter(Boolean) as import('@/lib/quests/types').QuestRewards;
    let claimablesRewardCatalog: Record<string, unknown> = {};
    if (isSummary && claimableRewards.some((r) => r?.itemId || r?.backgroundId)) {
      const catalog = dashboard.catalog?.length
        ? dashboard.catalog
        : await getCachedCatalog();
      claimablesRewardCatalog = buildRewardCatalog(catalog, [claimableRewards]);
    }

    // Count active quests the user can still work on (not claimed, not yet fully claimable)
    const activeCount = [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests, ...dashboard.categoryQuests].filter(
      (quest) => !quest.claimed && !quest.claimable && !quest.locked,
    ).length;
    const lightMacroCategories = dashboard.macroCategories.map(lightenCategory);

    if (isSummary) {
      return NextResponse.json(
        {
          isPremium: dashboard.isPremium,
          claimableCount,
          claimables,
          trackables,
          claimablesRewardCatalog,
          activeCount,
          activeFocusCategoryId: dashboard.activeFocusCategoryId,
          areaQuestsUnlocked,
          areaQuestsUnlockedAt,
          dailyStreak,
          onboarding: {
            complete: !!dashboard.focusProfile.completedAt,
            selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
            categoryTagMap: dashboard.focusProfile.categoryTagMap,
          },
          activeSeason,
          ...(includeCategories ? { macroCategories: lightMacroCategories } : {}),
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    }

    const tags = (dashboard.user.tags ?? [])
      .map((tag: any, index: number) =>
        normalizeQuestTag(tag, index, dashboard.isPremium),
      )
      .filter(Boolean);
    const seasonRewardCatalog = activeSeason
      ? buildRewardCatalog(
          dashboard.catalog,
          activeSeason.rewardsByDay.flatMap((entry) => [
            entry.freeRewards,
            entry.premiumRewards,
          ]),
        )
      : {};
    const streakRewardCatalog = dailyStreak?.rewards?.length
      ? buildRewardCatalog(dashboard.catalog, [dailyStreak.rewards])
      : {};
    const moveToWebRewardCatalog = moveToWeb?.reward
      ? buildRewardCatalog(dashboard.catalog, [[moveToWeb.reward]])
      : {};

    return NextResponse.json(
      {
        isPremium: dashboard.isPremium,
        claimableCount,
        activeCount,
        activeFocusCategoryId: dashboard.activeFocusCategoryId,
        areaQuestsUnlocked,
        areaQuestsUnlockedAt,
        rentedFocus: dashboard.rentedFocus,
        frogName: (dashboard.user as { frogName?: string }).frogName ?? null,
        dailyStreak,
        moveToWeb,
        onboarding: {
          complete: !!dashboard.focusProfile.completedAt,
          selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
          categoryTagMap: dashboard.focusProfile.categoryTagMap,
        },
        tags,
        macroCategories: lightMacroCategories,
        activeSeason,
        dailyQuests: dashboard.dailyQuests.map((q) =>
          withBlockEffort(withTemplateCover(q, dashboard.templatesWithCover)),
        ),
        dailyQuestsGated: dashboard.dailyQuestsGated,
        firstOnboardingComplete: dashboard.firstOnboardingComplete,
        earlyObjectiveSteps: dashboard.earlyObjectiveSteps,
        categoryQuests: dashboard.categoryQuests.map((q) =>
          withBlockEffort(withTemplateCover(q, dashboard.templatesWithCover)),
        ),
        onboardingQuests: (dashboard.onboardingQuests ?? []).map((q) =>
          withBlockEffort(withTemplateCover(q, dashboard.templatesWithCover)),
        ),
        unlockedAnimationIds: dashboard.focusProfile.unlockedAnimationIds ?? [],
        rewardCatalog: {
          ...dashboard.rewardCatalog,
          ...seasonRewardCatalog,
          ...streakRewardCatalog,
          ...moveToWebRewardCatalog,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    console.error('Error loading quests:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to load quests' }
        : {
            error: 'Failed to load quests',
            details: error instanceof Error ? error.message : 'Unknown quests error',
          },
      { status: 500 },
    );
  }
}
