import CalendarEventLinkModel from '@/lib/models/CalendarEventLink';

/**
 * Point a task's existing calendar links at the repeat group it just joined.
 *
 * The outbound sweep keys a grouped unit by `repeatGroupId` and a lone task by
 * `taskId`. A task that gains a group therefore looks like a brand new unit
 * with no link — it would insert a second event and orphan the first.
 */
export async function retargetLinksToGroup(args: {
  userId: string;
  taskId: string;
  repeatGroupId: string;
}): Promise<void> {
  await CalendarEventLinkModel.updateMany(
    {
      userId: args.userId,
      taskId: args.taskId,
      repeatGroupId: { $exists: false },
      recurrenceInstanceId: { $exists: false },
    },
    { $set: { repeatGroupId: args.repeatGroupId } },
  );
}
