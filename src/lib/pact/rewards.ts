import PactModel from '@/lib/models/Pact';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { isPremiumUser } from '@/lib/quests/engine';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart } from '@/lib/weekStart';
import {
  ensurePactConfig,
  normalizePactStreak,
  pactMoveAllowance,
  pactMoveTargets,
  readPactSessions,
  readPactSessionStates,
  weekKeyFor,
} from './engine';
import { applyPactRewards, type PactRewardSummary } from './grant';

export type { PactRewardSummary };

/**
 * Manual claim of a week already finished. A week that ends unclaimed is paid
 * out automatically when it settles (see `settleFinishedWeeks`), so this is
 * the ceremony, never the only way to get paid.
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
  const todayKey = getZonedToday(timezone);
  const weekStartsOn = normalizeWeekStart(user.weekStartsOn);
  const weekKey = weekKeyFor(todayKey, weekStartsOn);
  const pact = await PactModel.findOne({ userId, weekKey });
  if (!pact) throw new Error('No pact this week');
  if (pact.claimedAt) throw new Error('Already claimed');

  // The comeback bonus is settled with the rest of the week, so a week claimed
  // by hand has to read it here or claiming early would forfeit it.
  const tasks = await TaskModel.find(
    { userId, id: { $in: pact.taskIds ?? [] }, deletedAt: { $exists: false } },
    { id: 1, completedDates: 1, completedAtByDate: 1, dayOfWeek: 1 },
  ).lean<TaskDoc[]>();
  const ledger = readPactSessions({
    pact,
    tasks,
    timezone,
    weekStartsOn,
    todayKey,
  });

  const isPremium = isPremiumUser(user.toObject());
  const kept = pact.progress >= pact.target;
  // A short week pays too, but only once it can no longer improve. Claiming a
  // week that still has a session in it — or a move that could hand one back —
  // trades the whole prize for a fraction of it, which is a trap however
  // clearly it is labelled.
  const rescuableByMove =
    pactMoveAllowance(config, isPremium) - Math.max(0, pact.movesUsed ?? 0) > 0 &&
    pactMoveTargets({ pact, weekStartsOn, todayKey }).length > 0 &&
    readPactSessionStates({
      pact,
      tasks,
      timezone,
      weekStartsOn,
      todayKey,
    }).some((session) => session.state !== 'done');
  const canImprove = ledger.remaining + ledger.catchable > 0 || rescuableByMove;
  if (pact.progress <= 0) throw new Error('Nothing to claim yet');
  if (!kept && canImprove) throw new Error('Pact is not finished yet');

  const streak = normalizePactStreak(user.toObject());

  // This week has not settled yet, so its position in the streak is the next
  // one — settle will write exactly these numbers afterwards. Only a finished
  // week advances, so only a finished week writes them.
  const streakWeeks = streak.weeks + 1;
  const areaWeeks = (streak.areaWeeks[pact.categoryId] ?? 0) + 1;

  const summary = applyPactRewards({
    user,
    config,
    pact,
    progress: pact.progress,
    comeback: ledger.cameBack,
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
  if (kept) {
    pact.streakWeek = streakWeeks;
    pact.areaWeek = areaWeeks;
    if (!pact.completedAt) pact.completedAt = new Date();
  }

  await Promise.all([user.save(), pact.save()]);

  if (kept && pact.suggestionId) {
    const PactConfigModel = (await import('@/lib/models/PactConfig')).default;
    const { PACT_CONFIG_ID } = await import('@/lib/models/PactConfig');
    await PactConfigModel.updateOne(
      { configId: PACT_CONFIG_ID, 'suggestions.id': pact.suggestionId },
      { $inc: { 'suggestions.$.kept': 1 } },
    );
  }

  return summary;
}
