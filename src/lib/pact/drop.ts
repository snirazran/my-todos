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
 *
 * A token buys a change of mind, never an escape from a failure. Dropping
 * deletes the pact, so the week never settles as missed — which on a week that
 * could still have been kept is exactly right, and on one already past saving
 * would launder a broken streak into an intact one. So a week that can no
 * longer hold its streak breaks it either way, and the token stays unspent
 * rather than being burned on nothing.
 */
export async function dropPact(args: {
  userId: string;
  pact: PactDoc;
  source: 'swap' | 'tasks_deleted';
  /** Skip releasing the tasks when the caller is already deleting them. */
  keepTasks?: boolean;
  /**
   * Whether the week could still have held its streak at the moment of the
   * drop. Omitted means "assume it could" — the old behaviour, for callers
   * that have no ledger in hand.
   */
  holdable?: boolean;
}): Promise<PactDropResult> {
  const { userId, pact, source } = args;
  const holdable = args.holdable ?? true;

  const user = await UserModel.findById(userId).lean();
  const streak = normalizePactStreak(user as any);
  const useToken = holdable && streak.swapTokens > 0;

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
