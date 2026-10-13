import type { TaskDoc } from '@/lib/models/Task';
import { occursOnDate, isCompletedOnDate } from '@/lib/taskOccurrence';

/** The Friends page offers the user's live, unfinished occurrence for today. */
export function currentBuddyTask(tasks: TaskDoc[], bondId: string, today: string, timezone: string): TaskDoc | undefined {
  return tasks.find((task) => task.bondId === bondId && !task.deletedAt && occursOnDate(task, today, timezone) && !isCompletedOnDate(task, today));
}
