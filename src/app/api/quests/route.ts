import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { buildRewardCatalog, syncQuestState } from '@/lib/quests/engine';
import { loadStreakConfig, syncDailyStreak } from '@/lib/quests/streak';
import { getActiveQuestSeasonView } from '@/lib/quests/seasons';
import { getZonedToday } from '@/lib/utils';
import { getCachedCatalog } from '@/lib/skins/getCatalog';
import {
  metricObjectiveLabel,
  metricRemainingLabel,
} from '@/lib/quests/metricLabels';

const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

const templateCoverRef = (templateId: string) =>
  `/api/quests/cover?type=template&id=${encodeURIComponent(templateId)}`;

const categoryCoverRef = (categoryId: string) =>
  `/api/quests/cover?type=category&id=${encodeURIComponent(categoryId)}`;

const FREE_TAG_LIMIT = 6;

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
  tagsResolved = false,
): string {
  const target = Math.max(0, block.target ?? 0);
  const usesFocusTags = block.tagMode === 'focus_category_tags';
  if (block.type === 'metric_count') {
    return metricObjectiveLabel(block.metricKey, target, {
      tagScoped: usesFocusTags,
    });
  }
  if (block.type === 'focus_minutes') {
    return usesFocusTags && !tagsResolved
      ? `Focus for ${target} minutes on tasks with focus tags`
      : `Focus for ${target} minutes on tasks`;
  }
  const subject = block.subject === 'any' || target !== 1 ? 'tasks' : 'task';
  const action = block.action === 'add' ? 'Add' : 'Complete';
  const scope =
    usesFocusTags && !tagsResolved ? `${subject} with focus tags` : subject;
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
  kind: 'objective' | 'season';
  placement?: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
  objectiveLabel?: string;
  tags?: ObjectiveTagChip[];
  seasonName?: string;
  day?: number;
  reward?: any;
};

type TrackableEntry = {
  id: string;
  questId: string;
  placement: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
  objectiveLabel: string;
  remainingLabel: string;
  tags?: ObjectiveTagChip[];
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  reward?: any;
};

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
  tagsResolved = false,
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
    return tagsResolved
      ? `Focus ${remaining} more min on tasks`
      : `Focus ${remaining} more min on tasks with focus tags`;
  }
  const subject = remaining === 1 ? 'task' : 'tasks';
  const action = block.action === 'add' ? 'Add' : 'Complete';
  const scope =
    usesFocusTags && !tagsResolved ? `${subject} with focus tags` : subject;
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

    const [dashboard, activeSeason, streakConfig] = await Promise.all([
      syncQuestState({
        userId,
        timezone,
        includeCatalog: !isSummary,
        includeCategories,
      }),
      getActiveQuestSeasonView({ userId, timezone }),
      loadStreakConfig(),
    ]);
    const dailyStreak = await syncDailyStreak({
      user: dashboard.user,
      config: streakConfig,
      dailyQuests: dashboard.dailyQuests,
      todayKey: getZonedToday(timezone),
    });
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
    const claimableCount =
      questClaimable + seasonDailyClaimable + streakClaimable;

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
            kind: 'objective',
            placement: quest.placement,
            categoryName:
              quest.placement === 'category'
                ? categoryNameById.get(quest.categoryId ?? '')
                : undefined,
            objectiveLabel: objectiveSummaryLabel(
              block,
              questFocusTags(quest).length > 0,
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
    for (const quest of [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests, ...dashboard.categoryQuests]) {
      if (quest.claimed || quest.locked) continue;
      for (const block of quest.logic) {
        const target = Math.max(1, block.target);
        if ((block.rewards?.length ?? 0) === 0) continue;
        if (block.progress >= target) continue;
        if (quest.claimedObjectiveIds.includes(block.id)) continue;
        trackables.push({
          id: `${quest.id}:${block.id}`,
          questId: quest.id,
          placement: quest.placement,
          categoryName:
            quest.placement === 'category'
              ? categoryNameById.get(quest.categoryId ?? '')
              : undefined,
          objectiveLabel: objectiveSummaryLabel(
            block,
            questFocusTags(quest).length > 0,
          ),
          remainingLabel: objectiveRemainingLabel(
            block,
            questFocusTags(quest).length > 0,
          ),
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
          reward: block.rewards?.[0],
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

    return NextResponse.json(
      {
        isPremium: dashboard.isPremium,
        claimableCount,
        activeCount,
        activeFocusCategoryId: dashboard.activeFocusCategoryId,
        rentedFocus: dashboard.rentedFocus,
        dailyStreak,
        onboarding: {
          complete: !!dashboard.focusProfile.completedAt,
          selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
          categoryTagMap: dashboard.focusProfile.categoryTagMap,
        },
        tags,
        macroCategories: lightMacroCategories,
        activeSeason,
        dailyQuests: dashboard.dailyQuests.map((q) =>
          withTemplateCover(q, dashboard.templatesWithCover),
        ),
        categoryQuests: dashboard.categoryQuests.map((q) =>
          withTemplateCover(q, dashboard.templatesWithCover),
        ),
        onboardingQuests: (dashboard.onboardingQuests ?? []).map((q) =>
          withTemplateCover(q, dashboard.templatesWithCover),
        ),
        unlockedAnimationIds: dashboard.focusProfile.unlockedAnimationIds ?? [],
        rewardCatalog: {
          ...dashboard.rewardCatalog,
          ...seasonRewardCatalog,
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
