import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import {
  FOCUS_FLY_RATE_SECONDS,
  FOCUS_FLY_DAILY_CAP,
} from '@/lib/focusFlies';
import { FLY_HUNGER_REWARD_MS, MAX_HUNGER_MS } from '@/lib/hungerLogic';

// Credits flies for focused time: 1 fly per 15 focused minutes, capped per day.
// Runs as a single aggregation-pipeline update so concurrent flushes (live
// ticks, pause saves, the completion processor) can never double-award.
async function awardFocusFlies(
  userId: string,
  date: string,
  focusSeconds: number,
): Promise<void> {
  if (focusSeconds <= 0) return;
  const fresh = { date, focusSeconds: 0, earned: 0 };
  await UserModel.updateOne({ _id: userId }, [
    {
      $set: {
        _focusFlyPrev: {
          $cond: [
            { $eq: ['$wardrobe.focusFlyDaily.date', date] },
            '$wardrobe.focusFlyDaily',
            fresh,
          ],
        },
      },
    },
    {
      $set: {
        _focusFlyNext: {
          $let: {
            vars: {
              seconds: {
                $add: [
                  { $ifNull: ['$_focusFlyPrev.focusSeconds', 0] },
                  focusSeconds,
                ],
              },
            },
            in: {
              date,
              focusSeconds: '$$seconds',
              earned: {
                $min: [
                  FOCUS_FLY_DAILY_CAP,
                  { $floor: { $divide: ['$$seconds', FOCUS_FLY_RATE_SECONDS] } },
                ],
              },
            },
          },
        },
      },
    },
    {
      $set: {
        _focusFlyGained: {
          $max: [
            0,
            {
              $subtract: [
                '$_focusFlyNext.earned',
                { $ifNull: ['$_focusFlyPrev.earned', 0] },
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        'wardrobe.focusFlyDaily': '$_focusFlyNext',
        'wardrobe.flies': {
          $add: [{ $ifNull: ['$wardrobe.flies', 0] }, '$_focusFlyGained'],
        },
        // Caught flies feed the frog too — same clamp-at-full as task feeding;
        // the lazy drain in calculateHunger keeps working off lastHungerUpdate.
        'wardrobe.hunger': {
          $min: [
            MAX_HUNGER_MS,
            {
              $add: [
                { $ifNull: ['$wardrobe.hunger', MAX_HUNGER_MS] },
                { $multiply: [FLY_HUNGER_REWARD_MS, '$_focusFlyGained'] },
              ],
            },
          ],
        },
      },
    },
    { $unset: ['_focusFlyPrev', '_focusFlyNext', '_focusFlyGained'] },
  ], { updatePipeline: true });
}

type FrogodoroSession = { date: string; focusTime: number; breakTime: number };

// Sessions are stamped with the day the work happened and never re-dated, so a
// one-off that has been moved between days keeps its log on the original day.
// Its row still owns all of that time — a one-off is a single piece of work —
// so the row reports the total. A repeat occurrence owns only its own day.
export function sessionForRow(
  task: Pick<TaskDoc, 'type' | 'frogodoroSessions'>,
  date: string,
): FrogodoroSession | null {
  const sessions = task.frogodoroSessions ?? [];
  if (sessions.length === 0) return null;
  if (task.type === 'weekly') {
    return sessions.find((session) => session.date === date) ?? null;
  }
  const total = sessions.reduce(
    (sum, session) => ({
      focusTime: sum.focusTime + (session.focusTime ?? 0),
      breakTime: sum.breakTime + (session.breakTime ?? 0),
    }),
    { focusTime: 0, breakTime: 0 },
  );
  if (total.focusTime === 0 && total.breakTime === 0) return null;
  return { date, ...total };
}

export async function addFrogodoroSession(
  userId: string,
  taskId: string,
  date: string,
  focusTime: number,
  breakTime: number,
): Promise<boolean> {
  await awardFocusFlies(userId, date, focusTime).catch((error) => {
    console.error('Focus fly award failed:', error);
  });
  const inc = await TaskModel.updateOne(
    { id: taskId, userId, 'frogodoroSessions.date': date },
    {
      $inc: {
        'frogodoroSessions.$.focusTime': focusTime,
        'frogodoroSessions.$.breakTime': breakTime,
      },
    },
  );
  if (inc.matchedCount > 0) return true;

  const push = await TaskModel.updateOne(
    { id: taskId, userId, 'frogodoroSessions.date': { $ne: date } },
    { $push: { frogodoroSessions: { date, focusTime, breakTime } } },
  );
  if (push.modifiedCount > 0) return true;

  const retry = await TaskModel.updateOne(
    { id: taskId, userId, 'frogodoroSessions.date': date },
    {
      $inc: {
        'frogodoroSessions.$.focusTime': focusTime,
        'frogodoroSessions.$.breakTime': breakTime,
      },
    },
  );
  return retry.matchedCount > 0;
}
