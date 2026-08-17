import PactModel from '@/lib/models/Pact';

/**
 * A Leap's commitment text and the tasks it wrote to the list are the same
 * promise in two places. Renaming the whole repeat series is the user restating
 * that promise, so the Leap has to follow or the card keeps quoting a task
 * title that no longer exists.
 *
 * Settled weeks are left alone: their commitment text is a record of what was
 * promised then, and the streak ladder and week-result sheet read it back.
 */
export async function syncPactCommitmentText(args: {
  userId: string;
  taskId: string;
  text: string;
}): Promise<boolean> {
  const text = args.text.trim();
  if (!text) return false;
  const result = await PactModel.updateMany(
    { userId: args.userId, taskIds: args.taskId, settledAt: null },
    { $set: { commitmentText: text } },
  );
  return (result.modifiedCount ?? 0) > 0;
}
