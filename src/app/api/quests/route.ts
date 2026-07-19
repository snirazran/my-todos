import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { buildRewardCatalog, syncQuestState } from '@/lib/quests/engine';
import { loadStreakConfig, previousDayKey, syncDailyStreak } from '@/lib/quests/streak';
import { parseTaskStreakDays } from '@/lib/quests/metrics';
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
const AREA_UNLOCK_STEP_TARGET = 6;
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

  const unlocked =
    hasFocusFootprint ||
    earlySteps >= AREA_UNLOCK_STEP_TARGET ||
    lifetimeTaskCompletions >= AREA_UNLOCK_LIFETIME_TASKS;
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

function objectiveSummaryLabel(
  block: {
    type?: string;
    subject?: string;
    action?: string;
    tagMode?: string;
    metricKey?: string;
    target?: number;
  },
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
  const subject = block.subject === 'any' || target !== 1 ? 'tasks' : 'task';
  const action = block.action === 'add' ? 'Add' : 'Complete';
  const scope = usesFocusTags
    ? tagName
      ? `${tagName} ${subject}`
      : `quest ${subject}`
    : subject;
  return `${action} ${target} ${scope}`;
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
  tags?: ObjectiveTagChip[];
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  tierIndex?: number;
  reward?: any;
  hint?: string;
  guideId?: string;
  guideContext?: import('@/lib/hints/guides').HintGuideContext;
  lastProgressAt?: string;
  expiresAt?: string;
  remainingEffortDays?: number;
  effortAtRiskDays?: number;
};

const TASK_UNIT_EFFORT_DAYS = 0.1;
const FOCUS_MINUTE_EFFORT_DAYS = 0.01;

type EffortTask = {
  type?: string;
  tags?: string[];
  completedDates?: string[];
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

// Rough "days of work left" per objective so priority ranking can compare a
// two-tap task quest against a multi-day streak on the same scale. A streak
// unit costs its full day count minus the user's live run; everything else is
// a same-day action.
function objectiveEffort(
  block: {
    type?: string;
    metricKey?: string;
    target?: number;
    progress?: number;
  },
  tasks: EffortTask[],
  todayKey: string,
  tagIds?: string[],
): { remainingEffortDays: number; effortAtRiskDays: number } {
  const target = Math.max(1, block.target ?? 1);
  const remainingUnits = Math.max(1, target - Math.max(0, block.progress ?? 0));
  const streakDays = parseTaskStreakDays(block.metricKey);
  if (block.type === 'metric_count' && streakDays !== null) {
    const { runDays, completedToday } = bestStreakRun(tasks, todayKey, tagIds);
    const credit = runDays >= streakDays ? 0 : runDays;
    return {
      remainingEffortDays:
        streakDays - credit + (remainingUnits - 1) * streakDays,
      effortAtRiskDays: completedToday ? 0 : credit,
    };
  }
  if (block.type === 'focus_minutes') {
    return {
      remainingEffortDays: remainingUnits * FOCUS_MINUTE_EFFORT_DAYS,
      effortAtRiskDays: 0,
    };
  }
  return {
    remainingEffortDays: remainingUnits * TASK_UNIT_EFFORT_DAYS,
    effortAtRiskDays: 0,
  };
}

function objectiveRemainingLabel(
  block: {
    type?: string;
    subject?: string;
    action?: string;
    tagMode?: string;
    metricKey?: string;
    target?: number;
    progress?: number;
  },
  tagName?: string,
): string {
  const target = Math.max(1, block.target ?? 1);
  const remaining = Math.max(1, target - Math.max(0, block.progress ?? 0));
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
  const subject = remaining === 1 ? 'task' : 'tasks';
  const action = block.action === 'add' ? 'Add' : 'Complete';
  const scope = usesFocusTags
    ? tagName
      ? `${tagName} ${subject}`
      : `quest ${subject}`
    : subject;
  return `${action} ${remaining} more ${scope}`;
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

    const [dashboard, activeSeason, streakConfig, moveToWebConfig] =
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
      ]);
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
      for (const block of quest.logic) {
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
      for (let tierIndex = 0; tierIndex < quest.logic.length; tierIndex++) {
        const block = quest.logic[tierIndex];
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
      const seasonReward = dashboard.isPremium
        ? dayEntry?.premiumRewards?.[0] ?? dayEntry?.freeRewards?.[0]
        : dayEntry?.freeRewards?.[0];
      claimables.push({
        id: `season:${activeSeason.id}:${activeSeason.currentDay}`,
        kind: 'season',
        seasonId: activeSeason.id,
        seasonName: activeSeason.name,
        day: activeSeason.currentDay,
        reward: seasonReward,
      });
    }
    const claimableRewards = [...claimables, ...trackables]
      .map((c) => c.reward)
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
