import PactModel, { type PactDoc } from '@/lib/models/Pact';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { releasePactTasks } from './commit';
import { normalizePactStreak } from './engine';

export type PactDropResult = {
  usedToken: boolean;
  streakReset: boolean;
  streakWeeks: number;
};

/**
 * Ends the running week's Leap. One implementation for both ways a user can
 * reach it — swapping from the card, or deleting the last of its tasks off the
 * board — because two paths that price the same act differently is exactly how
 * a streak gets lost in a way nobody can explain.
 *
 * A swap token absorbs the cost; without one the streak goes back to zero.
 */
export async function dropPact(args: {
  userId: string;
  pact: PactDoc;
  source: 'swap' | 'tasks_deleted';
  /** Skip releasing the tasks when the caller is already deleting them. */
  keepTasks?: boolean;
}): Promise<PactDropResult> {
  const { userId, pact, source } = args;

  const user = await UserModel.findById(userId).lean();
  const streak = normalizePactStreak(user as any);
  const useToken = streak.swapTokens > 0;

  if (!args.keepTasks) await releasePactTasks({ userId, pact });
  await PactModel.deleteOne({ _id: pact._id });

  const nextStreak = {
    ...streak,
    swapTokens: useToken ? streak.swapTokens - 1 : streak.swapTokens,
    weeks: useToken ? streak.weeks : 0,
  };
  await UserModel.updateOne(
    { _id: userId },
    { $set: { 'quests.pactStreak': nextStreak } },
  );

  await recordAnalyticsEvent({
    userId,
    name: 'pact_dropped',
    properties: {
      week_key: pact.weekKey,
      category_id: pact.categoryId,
      used_token: useToken,
      progress: pact.progress,
      source,
    },
  });

  return {
    usedToken: useToken,
    streakReset: !useToken && streak.weeks > 0,
    streakWeeks: nextStreak.weeks,
  };
}
