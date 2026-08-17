import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumUser } from '@/lib/quests/engine';
import {
  grantShields,
  loadShieldConfig,
  persistShieldState,
  readShieldState,
} from '@/lib/shields/engine';
import { milestonesUpTo, type StreakMilestone } from '@/lib/flyValue';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { loadFlyEconomyConfig, type FlyEconomyConfig } from './config';
import { fliesGrantedOnDay, settleFlyGrant } from './ledger';
import FlyLedgerModel from '@/lib/models/FlyLedger';

export type QueuedMilestone = {
  key: string;
  groupKey: string;
  taskId: string;
  taskText: string;
  day: number;
  queuedAt: Date | string;
};

export type MilestonePayout = {
  taskId: string;
  taskText: string;
  day: number;
  flies: number;
  giftItemId?: string;
  shields: number;
};

export type MilestoneResult = {
  paid: MilestonePayout | null;
  /** Milestones that landed while the day's payout was already spent. */
  queued: number;
};

/** Sibling docs of one repeat share a streak, so they share its milestones. */
export function streakGroupKey(task: {
  id: string;
  repeatGroupId?: string | null;
}) {
  return task.repeatGroupId || `solo:${task.id}`;
}

const milestoneKey = (groupKey: string, day: number) =>
  `${groupKey}:day${day}`;

function repeatOf(config: FlyEconomyConfig) {
  return {
    everyDays: config.taskStreak.repeatEveryDays,
    flies: config.taskStreak.repeatFlies,
    giftItemId: config.taskStreak.repeatGiftItemId,
    shields: config.taskStreak.repeatShields,
  };
}

async function paidMilestoneKeys(
  userId: string,
  keys: string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  await connectMongo();
  const rows = await FlyLedgerModel.find(
    { userId, source: 'task_streak', occurrenceKey: { $in: keys } },
    { occurrenceKey: 1 },
  ).lean<{ occurrenceKey: string }[]>();
  return new Set(rows.map((row) => row.occurrenceKey));
}

async function milestonesPaidToday(userId: string, dayKey: string) {
  await connectMongo();
  return FlyLedgerModel.countDocuments({
    userId,
    source: 'task_streak',
    dayKey,
    amount: { $gt: 0 },
  });
}

/**
 * Hand over one milestone: its flies, its gift and any Lily Pads. The ledger
 * row is the record that this task has had this milestone, so a streak that
 * breaks and climbs back to 30 never sells the same milestone twice.
 */
async function payMilestone(args: {
  userId: string;
  groupKey: string;
  taskId: string;
  taskText: string;
  milestone: StreakMilestone;
  dayKey: string;
}): Promise<MilestonePayout | null> {
  const { userId, groupKey, taskId, taskText, milestone, dayKey } = args;

  const settlement = await settleFlyGrant({
    userId,
    source: 'task_streak',
    occurrenceKey: milestoneKey(groupKey, milestone.atDays),
    dayKey,
    targetAmount: Math.max(0, milestone.flies),
    meta: {
      taskId,
      groupKey,
      milestoneDay: milestone.atDays,
      giftItemId: milestone.giftItemId,
      shields: milestone.shields ?? 0,
    },
  });
  if (settlement.delta <= 0 && settlement.paidBefore > 0) return null;

  const update: Record<string, any> = {};
  if (settlement.delta > 0) {
    update.$inc = { 'wardrobe.flies': settlement.delta };
  }
  if (milestone.giftItemId) {
    update.$inc = {
      ...(update.$inc ?? {}),
      [`wardrobe.inventory.${milestone.giftItemId}`]: 1,
    };
    update.$addToSet = { 'wardrobe.unseenItems': milestone.giftItemId };
  }
  if (Object.keys(update).length > 0) {
    await UserModel.updateOne({ _id: userId }, update);
  }

  const shields = Math.max(0, Math.floor(milestone.shields ?? 0));
  if (shields > 0) {
    const [user, shieldConfig] = await Promise.all([
      UserModel.findById(userId).select('quests premiumUntil').lean(),
      loadShieldConfig(),
    ]);
    if (user) {
      await persistShieldState(
        userId,
        grantShields(
          readShieldState(user),
          shieldConfig,
          isPremiumUser(user as any),
          shields,
        ),
      );
    }
  }

  void recordAnalyticsEvent({
    userId,
    name: 'fly_earned',
    properties: {
      source: 'task_streak_milestone',
      fly_amount: settlement.delta,
      streak_length: milestone.atDays,
    },
  }).catch(() => {});

  return {
    taskId,
    taskText,
    day: milestone.atDays,
    flies: settlement.delta,
    giftItemId: milestone.giftItemId,
    shields,
  };
}

async function readQueue(userId: string): Promise<QueuedMilestone[]> {
  await connectMongo();
  const user = await UserModel.findById(userId)
    .select('taskStreakQueue')
    .lean<{ taskStreakQueue?: QueuedMilestone[] } | null>();
  return user?.taskStreakQueue ?? [];
}

/**
 * Pay the oldest queued milestone, if the day still has a payout to give.
 * Called on every completion and on the day's first task fetch, so a queue
 * built up on a busy Sunday drains itself one day at a time without a cron.
 */
export async function drainTaskStreakQueue(args: {
  userId: string;
  dayKey: string;
  queue?: QueuedMilestone[];
}): Promise<MilestonePayout | null> {
  const config = await loadFlyEconomyConfig();
  const queue = args.queue ?? (await readQueue(args.userId));
  if (queue.length === 0) return null;
  if ((await milestonesPaidToday(args.userId, args.dayKey)) >= config.taskStreak.milestonesPerDay) {
    return null;
  }

  const [next, ...rest] = [...queue].sort(
    (a, b) =>
      new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime() ||
      a.day - b.day,
  );

  // Drop it from the queue first: a payout that fails is better lost than paid
  // twice, and the ledger would refuse the second attempt anyway.
  const removed = await UserModel.updateOne(
    { _id: args.userId, 'taskStreakQueue.key': next.key },
    { $pull: { taskStreakQueue: { key: next.key } } },
  );
  if (removed.modifiedCount === 0) return null;
  void rest;

  const milestone =
    config.taskStreak.milestones.find((m) => m.atDays === next.day) ??
    milestonesUpTo(next.day, config.taskStreak.milestones, repeatOf(config)).find(
      (m) => m.atDays === next.day,
    );
  if (!milestone) return null;

  return payMilestone({
    userId: args.userId,
    groupKey: next.groupKey,
    taskId: next.taskId,
    taskText: next.taskText,
    milestone,
    dayKey: args.dayKey,
  });
}

/**
 * Settle the milestones a task's streak has reached. At most one is paid a day
 * across every task; the rest queue for tomorrow. The cap is the anti-farm
 * guard and is invisible to anyone completing a normal number of habits.
 */
export async function creditTaskStreakMilestones(args: {
  userId: string;
  groupKey: string;
  taskId: string;
  taskText: string;
  streak: number;
  dayKey: string;
}): Promise<MilestoneResult> {
  const config = await loadFlyEconomyConfig();
  const reached = milestonesUpTo(
    args.streak,
    config.taskStreak.milestones,
    repeatOf(config),
  );
  if (reached.length === 0) {
    return { paid: await drainTaskStreakQueue(args), queued: 0 };
  }

  const queue = await readQueue(args.userId);
  const queuedKeys = new Set(queue.map((entry) => entry.key));
  const paidKeys = await paidMilestoneKeys(
    args.userId,
    reached.map((milestone) => milestoneKey(args.groupKey, milestone.atDays)),
  );

  const outstanding = reached.filter((milestone) => {
    const key = milestoneKey(args.groupKey, milestone.atDays);
    return !paidKeys.has(key) && !queuedKeys.has(key);
  });

  if (outstanding.length === 0) {
    return { paid: await drainTaskStreakQueue({ ...args, queue }), queued: 0 };
  }

  const alreadyPaidToday = await milestonesPaidToday(args.userId, args.dayKey);
  let payoutsLeft = Math.max(
    0,
    config.taskStreak.milestonesPerDay - alreadyPaidToday,
  );

  let paid: MilestonePayout | null = null;
  const toQueue: QueuedMilestone[] = [];

  for (const milestone of outstanding) {
    if (payoutsLeft > 0) {
      paid = await payMilestone({
        userId: args.userId,
        groupKey: args.groupKey,
        taskId: args.taskId,
        taskText: args.taskText,
        milestone,
        dayKey: args.dayKey,
      });
      if (paid) payoutsLeft -= 1;
      continue;
    }
    toQueue.push({
      key: milestoneKey(args.groupKey, milestone.atDays),
      groupKey: args.groupKey,
      taskId: args.taskId,
      taskText: args.taskText,
      day: milestone.atDays,
      queuedAt: new Date(),
    });
  }

  if (toQueue.length > 0) {
    await UserModel.updateOne(
      { _id: args.userId },
      { $push: { taskStreakQueue: { $each: toQueue, $slice: -200 } } },
    );
  }

  return { paid, queued: toQueue.length };
}
