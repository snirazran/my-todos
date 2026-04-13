import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { syncQuestState } from '@/lib/quests/engine';

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
    const timezone = new URL(req.url).searchParams.get('timezone') || 'UTC';

    const dashboard = await syncQuestState({ userId, timezone });
    const claimableCount =
      dashboard.dailyQuests.filter((quest) => quest.claimable).length +
      dashboard.categoryQuests.filter((quest) => quest.claimable).length;
    const todoCount = [...dashboard.dailyQuests, ...dashboard.categoryQuests].reduce(
      (sum, quest) => {
        const questLeft = quest.completed ? 0 : 1;
        const objectivesLeft = quest.logic.filter(
          (block) => block.progress < block.target,
        ).length;
        return sum + questLeft + objectivesLeft;
      },
      0,
    );

    return NextResponse.json({
      isPremium: dashboard.isPremium,
      claimableCount,
      todoCount,
      onboarding: {
        complete: !!dashboard.focusProfile.completedAt,
        selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
        categoryTagMap: dashboard.focusProfile.categoryTagMap,
      },
      macroCategories: dashboard.macroCategories,
      dailyQuests: dashboard.dailyQuests,
      categoryQuests: dashboard.categoryQuests,
      unlockedAnimationIds: dashboard.focusProfile.unlockedAnimationIds ?? [],
      rewardCatalog: dashboard.rewardCatalog,
    });
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
