import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import {
  FOCUS_FLY_RATE_SECONDS,
  FOCUS_FLY_DAILY_CAP,
} from '@/lib/focusFlies';

// Credits flies for focused time: 1 fly per 5 focused minutes, capped per day.
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
        'wardrobe.focusFlyDaily': '$_focusFlyNext',
        'wardrobe.flies': {
          $add: [
            { $ifNull: ['$wardrobe.flies', 0] },
            {
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
          ],
        },
      },
    },
    { $unset: ['_focusFlyPrev', '_focusFlyNext'] },
  ]);
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
