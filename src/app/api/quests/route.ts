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
    // Count prizes ready to collect (claimable quests + completed objectives with unclaimed rewards)
    const claimableCount = [...dashboard.dailyQuests, ...dashboard.categoryQuests].reduce(
      (sum, quest) => {
        if (quest.claimed) return sum;
        let count = 0;
        if (quest.claimable) count++;
        quest.logic.forEach((block) => {
          if ((block.rewards?.length ?? 0) > 0 && block.progress >= block.target && !quest.claimedObjectiveIds.includes(block.id)) {
            count++;
          }
        });
        return sum + count;
      },
      0,
    );

    return NextResponse.json({
      isPremium: dashboard.isPremium,
      claimableCount,
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
