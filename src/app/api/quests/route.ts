import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { syncQuestState } from '@/lib/quests/engine';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const timezone = new URL(req.url).searchParams.get('timezone') || 'UTC';

    const dashboard = await syncQuestState({ userId, timezone });
    const claimableCount =
      dashboard.dailyQuests.filter((quest) => quest.claimable).length +
      dashboard.categoryQuests.filter((quest) => quest.claimable).length;

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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
