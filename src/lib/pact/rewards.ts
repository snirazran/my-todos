import PactModel from '@/lib/models/Pact';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { isPremiumUser } from '@/lib/quests/engine';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart } from '@/lib/weekStart';
import {
  ensurePactConfig,
  normalizePactStreak,
  weekKeyFor,
} from './engine';
import { applyPactRewards, type PactRewardSummary } from './grant';

export type { PactRewardSummary };

/**
 * Manual claim of the week in progress. A week that ends unclaimed is paid out
 * automatically when it settles (see `settleFinishedWeeks`), so this is the
 * ceremony, never the only way to get paid.
 */
export async function claimPactReward(args: {
  userId: string;
  timezone: string;
}): Promise<PactRewardSummary> {
  const { userId, timezone } = args;
  await connectMongo();
  const config = await ensurePactConfig();
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');
  const weekKey = weekKeyFor(
    getZonedToday(timezone),
    normalizeWeekStart(user.weekStartsOn),
  );
  const pact = await PactModel.findOne({ userId, weekKey });
  if (!pact) throw new Error('No pact this week');
  if (pact.claimedAt) throw new Error('Already claimed');
  if (pact.progress < pact.target) throw new Error('Pact is not finished yet');

  const isPremium = isPremiumUser(user.toObject());
  const streak = normalizePactStreak(user.toObject());

  // This week has not settled yet, so its position in the streak is the next
  // one — settle will write exactly these numbers onto the pact afterwards.
  const streakWeeks = streak.weeks + 1;
  const areaWeeks = (streak.areaWeeks[pact.categoryId] ?? 0) + 1;

  const summary = applyPactRewards({
    user,
    config,
    pact,
    // The ordinal above is where the week sits; the rate is what it was played
    // at, and a rung the week is only now reaching pays from the next one.
    streakWeeks: streak.weeks,
    laps: streak.laps,
    isPremium,
  });

  recordDoubleableClaim(user, summary);

  if (!isPremium && summary.fliesGranted > 0) {
    (user as any).set(
      'quests.pactStreak.forgoneFlies',
      streak.forgoneFlies + summary.fliesGranted,
    );
  }

  pact.claimedAt = new Date();
  pact.streakWeek = streakWeeks;
  pact.areaWeek = areaWeeks;
  if (!pact.completedAt) pact.completedAt = new Date();

  await Promise.all([user.save(), pact.save()]);

  if (pact.suggestionId) {
    const PactConfigModel = (await import('@/lib/models/PactConfig')).default;
    const { PACT_CONFIG_ID } = await import('@/lib/models/PactConfig');
    await PactConfigModel.updateOne(
      { configId: PACT_CONFIG_ID, 'suggestions.id': pact.suggestionId },
      { $inc: { 'suggestions.$.kept': 1 } },
    );
  }

  return summary;
}
