import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import {
  FOCUS_FLY_RATE_SECONDS,
  FOCUS_FLY_DAILY_CAP,
  CATCH_LEAD_SECONDS,
} from '@/lib/focusFlies';
import { FLY_HUNGER_REWARD_MS, MAX_HUNGER_MS } from '@/lib/hungerLogic';

/** A focus phase still on the clock when this flush was taken. */
export type RunningFocusPhase = {
  elapsedSeconds: number;
  fullSeconds: number;
};

// Credits flies for focused time: 1 fly per 15 focused minutes, capped per day.
// Runs as a single aggregation-pipeline update so concurrent flushes (live
// ticks, pause saves, the completion processor) can never double-award.
//
// WHEN each of those flies lands depends on what the flush describes:
//
//   `runningPhase` given (a live/paused focus phase)  → pay on the phase's own
//     marks, spread evenly across its length, so the credit lands on the tick
//     the frog is seen catching it. Mirrors `focusPhaseCatches` on the client
//     exactly — same integer arithmetic, same lead — so no surface can show a
//     catch the wallet hasn't been paid for, or vice versa.
//
//   `runningPhase` absent (Stop, task switch, phase completion, or a client
//     too old to send it) → settle on the plain day curve, which pays out
//     whatever the marks hadn't reached yet.
//
// `earned` is therefore accumulated with $max rather than recomputed: a
// mid-phase target is lower than the settled curve by design, and must never
// claw back a fly an earlier flush already paid.
async function awardFocusFlies(
  userId: string,
  date: string,
  focusSeconds: number,
  runningPhase?: RunningFocusPhase | null,
): Promise<void> {
  // A settle carrying no new seconds is the whole point of the call — it is
  // how a session that ends between flushes gets priced at the time it
  // actually focused. Only a mid-phase flush needs seconds to be worth running.
  if (focusSeconds < 0 || (focusSeconds === 0 && runningPhase)) return;
  const fresh = { date, focusSeconds: 0, earned: 0 };

  const curveOf = (value: unknown) => ({
    $min: [
      FOCUS_FLY_DAILY_CAP,
      { $floor: { $divide: [value, FOCUS_FLY_RATE_SECONDS] } },
    ],
  });

  const target: unknown = runningPhase
    ? {
        $let: {
          // Focus banked today BEFORE this phase — the baseline its marks
          // count up from. Derived by subtraction so it holds still as the
          // phase runs (both totals grow together).
          vars: {
            banked: {
              $max: [
                0,
                { $subtract: ['$$seconds', runningPhase.elapsedSeconds] },
              ],
            },
          },
          in: {
            $let: {
              vars: {
                before: curveOf('$$banked'),
                potential: curveOf({
                  $add: ['$$banked', runningPhase.fullSeconds],
                }),
              },
              in: {
                $let: {
                  vars: { owed: { $subtract: ['$$potential', '$$before'] } },
                  in: {
                    $add: [
                      '$$before',
                      {
                        $min: [
                          '$$owed',
                          {
                            $floor: {
                              $divide: [
                                {
                                  $multiply: [
                                    runningPhase.elapsedSeconds +
                                      CATCH_LEAD_SECONDS,
                                    '$$owed',
                                  ],
                                },
                                runningPhase.fullSeconds,
                              ],
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      }
    : curveOf('$$seconds');

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
                $max: [{ $ifNull: ['$_focusFlyPrev.earned', 0] }, target],
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
  runningPhase?: RunningFocusPhase | null,
): Promise<boolean> {
  await awardFocusFlies(userId, date, focusTime, runningPhase).catch((error) => {
    console.error('Focus fly award failed:', error);
  });
  // Settle-only call (a session ending between flushes): the fly ledger above
  // is the point; there is no time to log, so don't touch the task's rows.
  if (focusTime === 0 && breakTime === 0) return true;
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
