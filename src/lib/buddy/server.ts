import TaskBondModel, { type BuddyCreateParams } from '@/lib/models/TaskBond';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import { notifyFriendUpdate } from '@/lib/taskSync';
import { sendBuddyPush, buddyDisplayName } from '@/lib/buddy/push';
import {
  buddyBothFinishedMessage,
  buddyPartnerFinishedMessage,
} from '@/lib/notifications/frogVoice';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import { checklistDoneIdsForDate } from '@/lib/checklist';

function dowYMD(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function lastDayOfMonth(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Is `d` a scheduled occurrence for the shared repeat? (weekly + monthly exact; custom lenient.) */
function isScheduled(params: BuddyCreateParams, d: string): boolean {
  if (params.repeatRule) return true; // custom: lenient (any both-done day counts)
  if (params.repeat === 'monthly') {
    const anchorDom = params.dates?.[0] ? Number(params.dates[0].slice(8, 10)) : null;
    if (anchorDom == null) return false;
    const dom = Number(d.slice(8, 10));
    return dom === Math.min(anchorDom, lastDayOfMonth(d));
  }
  return (params.days ?? []).includes(dowYMD(d));
}

/**
 * Shared flame streak: consecutive scheduled occurrences since `activeSince`
 * (up to today) that BOTH completed. A missed *past* scheduled occurrence
 * resets it; today's not-yet-both-done occurrence doesn't break it.
 */
export function computeStreak(
  params: BuddyCreateParams,
  activeSince: string | null,
  today: string,
  both: Set<string>,
): { count: number; lastDate: string | null } {
  const start = activeSince ?? today;
  if (start > today) return { count: 0, lastDate: null };

  const occ: string[] = [];
  for (let d = start, i = 0; d <= today && i < 2000; d = addDaysYMD(d, 1), i++) {
    if (isScheduled(params, d)) occ.push(d);
  }

  let count = 0;
  let lastDate: string | null = null;
  for (let i = occ.length - 1; i >= 0; i--) {
    const d = occ[i];
    if (both.has(d)) {
      count++;
      if (!lastDate) lastDate = d;
    } else if (d < today) {
      break; // a past scheduled occurrence was missed
    }
  }
  return { count, lastDate };
}

async function partnerTaskFlyValue(
  bondId: string,
  partnerId: string,
  date: string,
): Promise<number> {
  const docs = await TaskModel.find({ userId: partnerId, bondId })
    .select('type checklist checklistDoneByDate')
    .lean<
      {
        type?: string;
        checklist?: { id: string; text: string; done: boolean }[];
        checklistDoneByDate?: Record<string, string[]>;
      }[]
    >();
  const done = docs.reduce(
    (max, d) => Math.max(max, checklistDoneIdsForDate(d, date).length),
    0,
  );
  return 1 + done;
}

/**
 * Mirror a bonded task completion to the bond. When BOTH sides have completed
 * the same occurrence date, grant the 2× bonus (an extra 1× of each side's own
 * value, bypassing the daily cap) to both; reverse on uncomplete. Recomputes
 * the shared streak and nudges the partner's client.
 */
export async function handleBuddyCompletion(opts: {
  bondId: string;
  userId: string;
  date: string;
  completed: boolean;
  ownFlyValue: number;
  tz: string;
}) {
  const { bondId, userId, date, completed, ownFlyValue, tz } = opts;
  const bond = await TaskBondModel.findOne({ bondId });
  if (!bond || bond.status !== 'active') return;

  const isFrom = bond.fromUserId === userId;
  const partnerId = isFrom ? bond.toUserId : bond.fromUserId;

  const mine = new Set(isFrom ? bond.completedFrom : bond.completedTo);
  if (completed) mine.add(date);
  else mine.delete(date);
  const mineList = Array.from(mine);
  if (isFrom) bond.completedFrom = mineList;
  else bond.completedTo = mineList;

  const fromSet = new Set(bond.completedFrom);
  const toSet = new Set(bond.completedTo);
  const bothNow = fromSet.has(date) && toSet.has(date);
  const alreadyBonused = bond.bonusAwardedDates.includes(date);

  const loadBondTaskTags = () =>
    Promise.all([
      TaskModel.findOne({ userId, bondId })
        .select('tags')
        .lean<{ tags?: string[] } | null>(),
      TaskModel.findOne({ userId: partnerId, bondId })
        .select('tags')
        .lean<{ tags?: string[] } | null>(),
    ]);

  if (completed && bothNow && !alreadyBonused) {
    const [partnerValue, [myTask, partnerTask]] = await Promise.all([
      partnerTaskFlyValue(bondId, partnerId, date),
      loadBondTaskTags(),
    ]);
    await Promise.all([
      UserModel.updateOne({ _id: userId }, { $inc: { 'wardrobe.flies': ownFlyValue } }),
      UserModel.updateOne({ _id: partnerId }, { $inc: { 'wardrobe.flies': partnerValue } }),
      bumpQuestMetric({ userId, metric: 'buddy_task_completed', timezone: tz, tagIds: myTask?.tags ?? [] }),
      bumpQuestMetric({ userId: partnerId, metric: 'buddy_task_completed', timezone: tz, tagIds: partnerTask?.tags ?? [] }),
    ]);
    bond.bonusAwardedDates = [...bond.bonusAwardedDates, date];
  } else if (!bothNow && alreadyBonused) {
    const [partnerValue, [myTask, partnerTask]] = await Promise.all([
      partnerTaskFlyValue(bondId, partnerId, date),
      loadBondTaskTags(),
    ]);
    await Promise.all([
      UserModel.updateOne({ _id: userId }, { $inc: { 'wardrobe.flies': -ownFlyValue } }),
      UserModel.updateOne({ _id: partnerId }, { $inc: { 'wardrobe.flies': -partnerValue } }),
      bumpQuestMetric({ userId, metric: 'buddy_task_completed', amount: -1, timezone: tz, tagIds: myTask?.tags ?? [] }),
      bumpQuestMetric({ userId: partnerId, metric: 'buddy_task_completed', amount: -1, timezone: tz, tagIds: partnerTask?.tags ?? [] }),
    ]);
    bond.bonusAwardedDates = bond.bonusAwardedDates.filter((d) => d !== date);
  }

  const both = new Set(Array.from(fromSet).filter((d) => toSet.has(d)));
  const today = getZonedToday(tz);
  bond.streak = computeStreak(bond.createParams, bond.activeSince ?? null, today, both);

  await bond.save();
  void notifyFriendUpdate(partnerId);

  // Push the partner when I finish today's shared occurrence.
  if (completed && date === today) {
    void (async () => {
      const [name, partnerTask] = await Promise.all([
        buddyDisplayName(userId),
        TaskModel.findOne({ userId: partnerId, bondId })
          .select('text')
          .lean<{ text?: string } | null>(),
      ]);
      const copy = bothNow
        ? buddyBothFinishedMessage(name, partnerTask?.text)
        : buddyPartnerFinishedMessage(name, partnerTask?.text);
      await sendBuddyPush(partnerId, {
        ...copy,
        path: '/planner',
        type: 'buddy_completed',
      });
    })();
  }
}

/**
 * Sever a buddy bond because `deleterId` deleted their copy of the shared task.
 * The partner keeps their task as a normal solo task (bond fields cleared).
 */
export async function severBond(bondId: string, deleterId: string) {
  const bond = await TaskBondModel.findOne({ bondId });
  if (!bond || bond.status === 'severed') return;
  const partnerId =
    bond.fromUserId === deleterId ? bond.toUserId : bond.fromUserId;
  bond.status = 'severed';
  await bond.save();
  await TaskModel.updateMany(
    { userId: partnerId, bondId },
    { $unset: { bondId: '', buddyUserId: '' } },
  );
  void notifyFriendUpdate(partnerId);
}
