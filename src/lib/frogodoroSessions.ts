import TaskModel from '@/lib/models/Task';

export async function addFrogodoroSession(
  userId: string,
  taskId: string,
  date: string,
  focusTime: number,
  breakTime: number,
): Promise<boolean> {
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
