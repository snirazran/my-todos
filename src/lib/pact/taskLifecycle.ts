import PactModel from '@/lib/models/Pact';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart } from '@/lib/weekStart';
import { dropPact } from './drop';
import {
  ensurePactConfig,
  pactNearMissTarget,
  readPactSessionStates,
  readPactSessions,
} from './engine';

export type PactTaskRemovalOutcome =
  | 'none'
  /** Sessions still ahead were removed, so the week now asks for fewer. */
  | 'shrunk'
  /** Only spent days were removed — the goal is untouched. */
  | 'unchanged'
  /** Nothing left to do this week. The Leap is over. */
  | 'cancelled';

export type PactTaskRemovalResult = {
  outcome: PactTaskRemovalOutcome;
  /** Sessions this removal took off the board. */
  removed: number;
  /** Of those, the ones whose day had not come round yet. */
  removedOpen: number;
  target: number;
  progress: number;
  usedToken?: boolean;
  streakReset?: boolean;
};

const NO_CHANGE: PactTaskRemovalResult = {
  outcome: 'none',
  removed: 0,
  removedOpen: 0,
  target: 0,
  progress: 0,
};

/**
 * Keeps a running Leap honest when its tasks are deleted off the board.
 *
 * Three rules, and they are the whole design:
 *
 * - A session whose day is still ahead can be dropped, and the week's goal
 *   drops with it — the reward re-prices itself off the smaller target.
 * - A session already ticked is banked, never un-done: deleting the task keeps
 *   both the progress and the goal it counted toward.
 * - A session whose day went by unticked is a miss, and deleting it does not
 *   erase the miss. Goals move forward, not backward (the rule Apple's Move
 *   ring uses), or every broken week could be rewritten into a kept one.
 *
 * Must be called BEFORE the tasks are actually removed — it reads their
 * completion state to decide which of the three each one is.
 */
export async function applyPactTaskRemoval(args: {
  userId: string;
  timezone: string;
  /** Tasks about to be deleted, soft-deleted, or suppressed for their date. */
  taskIds: string[];
}): Promise<PactTaskRemovalResult> {
  const { userId, timezone } = args;
  const ids = Array.from(new Set(args.taskIds.filter(Boolean)));
  if (ids.length === 0) return NO_CHANGE;

  await connectMongo();
  const user = await UserModel.findById(userId).select('weekStartsOn').lean();
  const weekStartsOn = normalizeWeekStart(
    (user as { weekStartsOn?: unknown } | null)?.weekStartsOn,
  );
  const todayKey = getZonedToday(timezone);

  // Found by the tasks themselves rather than by this week's key: a pact
  // committed on the eve of the week owns tasks before its week begins, and
  // looking it up by date would miss it.
  const pact = await PactModel.findOne({
    userId,
    settledAt: null,
    taskIds: { $in: ids },
  }).sort({ weekKey: 1 });
  if (!pact || pact.status === 'skipped') return NO_CHANGE;

  const hit = ids.filter((id) => (pact.taskIds ?? []).includes(id));
  if (hit.length === 0) return NO_CHANGE;

  const tasks = await TaskModel.find(
    { userId, id: { $in: pact.taskIds ?? [] }, deletedAt: { $exists: false } },
    {
      id: 1,
      completedDates: 1,
      completedAtByDate: 1,
      dayOfWeek: 1,
      repeatGroupId: 1,
    },
  ).lean<TaskDoc[]>();

  const states = readPactSessionStates({
    pact,
    tasks,
    timezone,
    weekStartsOn,
    todayKey,
  });
  const removing = states.filter((session) => hit.includes(session.taskId));
  const removedDone = removing.filter((s) => s.state === 'done').length;
  const removedOpen = removing.filter((s) => s.state === 'open').length;

  const banked = Math.max(0, pact.bankedProgress ?? 0) + removedDone;
  const keptIds = (pact.taskIds ?? []).filter((id) => !hit.includes(id));
  const keptStates = states.filter((session) => !hit.includes(session.taskId));
  const progressAfter = banked + keptStates.filter((s) => s.state === 'done').length;

  // Finished is finished — the same rule the swap flow enforces. Tidying the
  // board after a week is done can never take the week back.
  const alreadyFinished = !!pact.claimedAt || pact.progress >= pact.target;
  const target = alreadyFinished
    ? pact.target
    : Math.max(0, pact.target - removedOpen);

  const nothingLeft = keptIds.length === 0 && progressAfter < target;
  if (!alreadyFinished && (nothingLeft || target <= 0)) {
    // Asked of the week as it stood BEFORE this deletion, exactly as the swap
    // flow asks it: a token covers a week the user chose to abandon, never one
    // that was already lost. Clearing the board is the same escape as tapping
    // swap, so it has to be priced the same or it becomes the cheaper door.
    const config = await ensurePactConfig();
    const ledger = readPactSessions({
      pact,
      tasks,
      timezone,
      weekStartsOn,
      todayKey,
    });
    const holdable =
      ledger.progress + ledger.remaining + ledger.catchable >=
      pactNearMissTarget(config, pact.target);

    const drop = await dropPact({
      userId,
      pact,
      source: 'tasks_deleted',
      // The caller is already removing what it named; anything else the week
      // still owns has to come off the board with it.
      keepTasks: keptIds.length === 0,
      holdable,
    });
    return {
      outcome: 'cancelled',
      removed: removing.length,
      removedOpen,
      target: 0,
      progress: progressAfter,
      usedToken: drop.usedToken,
      streakReset: drop.streakReset,
    };
  }

  pact.taskIds = keptIds;
  pact.bankedProgress = banked;
  pact.days = Array.from(
    new Set(keptStates.map((session) => session.dayOfWeek)),
  ).sort((a, b) => a - b);
  pact.target = target;
  pact.progress = Math.min(target, progressAfter);
  if (pact.progress >= target && !pact.completedAt) pact.completedAt = new Date();
  await pact.save();

  const outcome: PactTaskRemovalOutcome = removedOpen > 0 ? 'shrunk' : 'unchanged';
  await recordAnalyticsEvent({
    userId,
    name: 'pact_sessions_removed',
    properties: {
      week_key: pact.weekKey,
      category_id: pact.categoryId,
      removed: removing.length,
      removed_open: removedOpen,
      target: pact.target,
      outcome,
    },
  });

  return {
    outcome,
    removed: removing.length,
    removedOpen,
    target: pact.target,
    progress: pact.progress,
  };
}
