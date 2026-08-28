import PactModel from '@/lib/models/Pact';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart } from '@/lib/weekStart';
import type { UserDoc } from '@/lib/types/UserDoc';
import {
  ensurePactConfig,
  normalizePactStreak,
  pactComebackFlies,
  pactSessionFlies,
  readPactSessions,
  weekKeyFor,
} from './engine';
import { applyPactSessionFlies } from './grant';

export type PactSessionGrant = {
  /** Sessions newly paid for. Negative when a completion was undone. */
  sessionsDelta: number;
  comebackPaid: boolean;
  fliesGranted: number;
  flyBalanceAfter: number;
};

/**
 * Settles the running week's session flies against what the tasks actually
 * say. Every session pays the moment its task is ticked rather than the week
 * paying nothing until it lands — a week that loses one session has to stay
 * worth finishing, or the first miss makes abandoning the rest the rational
 * move.
 *
 * Written as a reconciliation against `paidSessions` rather than an increment
 * at the call site: completions arrive from several routes and can be undone,
 * so the only safe question is "how many are paid for versus how many are
 * kept". That makes it idempotent, and it refunds an undo for free.
 */
export async function reconcilePactSessionFlies(args: {
  userId: string;
  timezone: string;
  /** Tasks already in hand, to save the query on hot paths. */
  tasks?: TaskDoc[];
}): Promise<PactSessionGrant | null> {
  const { userId, timezone } = args;
  await connectMongo();

  const user = await UserModel.findById(userId);
  if (!user) return null;

  const todayKey = getZonedToday(timezone);
  const weekStartsOn = normalizeWeekStart(user.weekStartsOn);
  const pact = await PactModel.findOne({
    userId,
    weekKey: weekKeyFor(todayKey, weekStartsOn),
  });
  if (!pact || pact.status === 'skipped') return null;
  if (!pact.taskIds?.length) return null;

  const config = await ensurePactConfig();
  const rate = pactSessionFlies(config);
  const comebackRate = pactComebackFlies(config);
  if (rate === 0 && comebackRate === 0) return null;

  const tasks =
    args.tasks ??
    (await TaskModel.find(
      { userId, id: { $in: pact.taskIds ?? [] }, deletedAt: { $exists: false } },
      { id: 1, completedDates: 1, completedAtByDate: 1, dayOfWeek: 1 },
    ).lean<TaskDoc[]>());

  const ledger = readPactSessions({
    pact,
    tasks,
    timezone,
    weekStartsOn,
    todayKey,
  });

  const paid = Math.max(0, pact.paidSessions ?? 0);
  const sessionsDelta = ledger.progress - paid;
  const earnsComeback = ledger.cameBack && !pact.comebackPaid;
  if (sessionsDelta === 0 && !earnsComeback) return null;

  const isPremium = isPremiumUser(user.toObject() as UserDoc);
  const streakState = normalizePactStreak(user.toObject() as UserDoc);
  const granted = applyPactSessionFlies({
    user,
    config,
    paidSessions: paid,
    owedSessions: sessionsDelta,
    comeback: earnsComeback,
    isPremium,
    // The week in progress pays at the rung the streak has already banked.
    // The rung it is reaching for is unlocked by landing it, not by starting it.
    streakWeeks: streakState.weeks,
    laps: streakState.laps,
  });

  // Same bookkeeping the claim path does, so the retroactive-unlock pitch
  // counts session flies too rather than only the ones finishing a week pays.
  // It tracks refunds in both directions, or undoing a session would leave a
  // free user owed flies for work they took back.
  if (!isPremium && granted !== 0) {
    (user as any).set(
      'quests.pactStreak.forgoneFlies',
      Math.max(0, streakState.forgoneFlies + granted),
    );
  }

  pact.paidSessions = ledger.progress;
  if (earnsComeback) pact.comebackPaid = true;

  await Promise.all([user.save(), pact.save()]);

  return {
    sessionsDelta,
    comebackPaid: earnsComeback,
    fliesGranted: granted,
    flyBalanceAfter: Math.max(0, Number(user.wardrobe?.flies) || 0),
  };
}
