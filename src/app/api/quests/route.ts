import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { buildRewardCatalog, syncQuestState } from '@/lib/quests/engine';
import { getActiveQuestSeasonView } from '@/lib/quests/seasons';
import { getCachedCatalog } from '@/lib/skins/getCatalog';

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

function objectiveSummaryLabel(block: {
  type?: string;
  subject?: string;
  action?: string;
  tagMode?: string;
  target?: number;
}): string {
  const target = Math.max(0, block.target ?? 0);
  if (block.type === 'focus_minutes') {
    return block.tagMode === 'focus_category_tags'
      ? `Focus for ${target} minutes on tagged tasks`
      : `Focus for ${target} minutes on tasks`;
  }
  const subject = block.subject === 'any' || target !== 1 ? 'tasks' : 'task';
  const action = block.action === 'add' ? 'Add' : 'Complete';
  const scope =
    block.tagMode === 'focus_category_tags'
      ? `${subject} with focus tags`
      : subject;
  return `${action} ${target} ${scope}`;
}

type ClaimableEntry = {
  id: string;
  kind: 'objective' | 'season';
  placement?: 'daily' | 'category';
  categoryName?: string;
  objectiveLabel?: string;
  seasonName?: string;
  day?: number;
  reward?: any;
};

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

    const [dashboard, activeSeason] = await Promise.all([
      syncQuestState({
        userId,
        timezone,
        includeCatalog: !isSummary,
        includeCategories,
      }),
      getActiveQuestSeasonView({ userId, timezone }),
    ]);
    // Count prizes ready to collect. Quests no longer have an end-reward —
    // only per-objective rewards are claimable, so count one per completed
    // objective with unclaimed rewards.
    const questClaimable = [...dashboard.dailyQuests, ...dashboard.categoryQuests].reduce(
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
    const claimableCount = questClaimable + seasonDailyClaimable;

    const categoryNameById = new Map<string, string>(
      (dashboard.macroCategories ?? []).map((c: any) => [c.id, c.name]),
    );
    const claimables: ClaimableEntry[] = [];
    for (const quest of [...dashboard.dailyQuests, ...dashboard.categoryQuests]) {
      if (quest.claimed || quest.locked) continue;
      for (const block of quest.logic) {
        if (
          (block.rewards?.length ?? 0) > 0 &&
          block.progress >= block.target &&
          !quest.claimedObjectiveIds.includes(block.id)
        ) {
          claimables.push({
            id: `${quest.id}:${block.id}`,
            kind: 'objective',
            placement: quest.placement,
            categoryName:
              quest.placement === 'category'
                ? categoryNameById.get(quest.categoryId ?? '')
                : undefined,
            objectiveLabel: objectiveSummaryLabel(block),
            reward: block.rewards?.[0],
          });
        }
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
    const claimableRewards = claimables
      .map((c) => c.reward)
      .filter(Boolean) as import('@/lib/quests/types').QuestRewards;
    let claimablesRewardCatalog: Record<string, unknown> = {};
    if (isSummary && claimableRewards.some((r) => r?.itemId)) {
      const catalog = dashboard.catalog?.length
        ? dashboard.catalog
        : await getCachedCatalog();
      claimablesRewardCatalog = buildRewardCatalog(catalog, [claimableRewards]);
    }

    // Count active quests the user can still work on (not claimed, not yet fully claimable)
    const activeCount = [...dashboard.dailyQuests, ...dashboard.categoryQuests].filter(
      (quest) => !quest.claimed && !quest.claimable && !quest.locked,
    ).length;
    const lightMacroCategories = dashboard.macroCategories.map(lightenCategory);

    if (isSummary) {
      return NextResponse.json(
        {
          isPremium: dashboard.isPremium,
          claimableCount,
          claimables,
          claimablesRewardCatalog,
          activeCount,
          activeFocusCategoryId: dashboard.activeFocusCategoryId,
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
