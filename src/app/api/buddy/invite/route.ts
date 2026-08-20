export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskBondModel, { type BuddyCreateParams } from '@/lib/models/TaskBond';
import { areFriends } from '@/lib/friends/code';
import { createTasksForUser } from '@/app/api/tasks/route';
import {
  repeatLabelFor,
  buddyScheduleSummary,
  paramsFromTask,
  isShareableParams,
  type ExistingBuddyTask,
} from '@/lib/buddy/bond';
import { sendBuddyPush, buddyDisplayName } from '@/lib/buddy/push';
import { notifyFriendUpdate } from '@/lib/taskSync';
import TaskModel from '@/lib/models/Task';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { taskAnalyticsProperties } from '@/lib/analytics/engagement';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const GOAL_TEXT_PUSH_MAX = 40;

function invitePushBody(params: BuddyCreateParams): string {
  const text =
    params.text.length > GOAL_TEXT_PUSH_MAX
      ? `${params.text.slice(0, GOAL_TEXT_PUSH_MAX - 1).trimEnd()}…`
      : params.text;
  const schedule = buddyScheduleSummary(params);
  const tail = "you'll see each other's progress.";
  return schedule
    ? `"${text}" · ${schedule} — ${tail}`
    : `Team up on "${text}" — ${tail}`;
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const friendId = String(body?.friendId || '').trim();
  const tz = body?.timezone || 'UTC';
  const fromTaskId = String(body?.fromTaskId || '').trim();
  const params: BuddyCreateParams = {
    text: String(body?.text ?? '').trim(),
    repeat: body?.repeat,
    days: Array.isArray(body?.days) ? body.days.map(Number) : undefined,
    dates: Array.isArray(body?.dates) ? body.dates.map(String) : undefined,
    repeatRule: body?.repeatRule,
    repeatEndDate: body?.repeatEndDate,
  };

  if (!friendId) return NextResponse.json({ error: 'Missing friendId' }, { status: 400 });
  if (friendId === userId)
    return NextResponse.json({ error: "You can't buddy with yourself" }, { status: 400 });
  if (!fromTaskId) {
    if (!params.text)
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    if (!isShareableParams(params))
      return NextResponse.json(
        { error: 'Pick when you will both do it' },
        { status: 400 },
      );
  }

  try {
    await connectMongo();
    if (!(await areFriends(userId, friendId)))
      return NextResponse.json({ error: 'Not friends' }, { status: 403 });

    const bondId = uuid();
    let bondParams = params;
    let taskFromId: string;

    if (fromTaskId) {
      // Bond the user's existing repeat group instead of creating a copy.
      const task = await TaskModel.findOne({ userId, id: fromTaskId })
        .lean<ExistingBuddyTask | null>();
      if (!task)
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      if (task.bondId)
        return NextResponse.json(
          { error: 'This task is already shared' },
          { status: 409 },
        );

      const siblings = task.repeatGroupId
        ? await TaskModel.find({ userId, repeatGroupId: task.repeatGroupId })
            .lean<ExistingBuddyTask[]>()
        : [task];
      bondParams = paramsFromTask(task, siblings);
      if (!isShareableParams(bondParams))
        return NextResponse.json(
          { error: 'Give this task a day first, then share it' },
          { status: 400 },
        );

      const filter = task.repeatGroupId
        ? { userId, repeatGroupId: task.repeatGroupId }
        : { userId, id: task.id };
      await TaskModel.updateMany(filter, {
        $set: { bondId, buddyUserId: friendId },
      });
      taskFromId = task.repeatGroupId ?? task.id;
    } else {
      // Create the inviter's own copy now, stamped with the bond.
      const result = await createTasksForUser(userId, body, tz, {
        bondId,
        buddyUserId: friendId,
      });
      if (!result.ok)
        return NextResponse.json({ error: result.error }, { status: result.status });

      const [createdTask, analyticsUser] = await Promise.all([
        TaskModel.findOne({ userId, id: { $in: result.ids } }).lean(),
        UserModel.findById(userId).select('focusProfile').lean(),
      ]);
      await recordAnalyticsEvent({
        userId,
        name: 'task_created',
        properties: taskAnalyticsProperties(createdTask ?? {}, analyticsUser?.focusProfile, {
          count: result.ids.length,
          buddy: true,
        }),
      });

      taskFromId = result.repeatGroupId ?? result.ids[0];
    }

    await TaskBondModel.create({
      bondId,
      invitedBy: userId,
      fromUserId: userId,
      toUserId: friendId,
      status: 'pending',
      initialText: bondParams.text,
      createParams: bondParams,
      repeatLabel: repeatLabelFor(bondParams),
      taskFromId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    await recordAnalyticsEvent({
      userId,
      name: 'buddy_invite_sent',
      properties: {
        source: fromTaskId ? 'existing_task' : 'existing_friend',
        repeat_mode: repeatLabelFor(bondParams),
      },
    });

    void notifyFriendUpdate(friendId);
    void buddyDisplayName(userId).then((name) =>
      sendBuddyPush(friendId, {
        title: `${name} wants to be your goal buddy`,
        body: invitePushBody(bondParams),
        path: '/friends',
        type: 'buddy_invite',
      }),
    );

    return NextResponse.json({ ok: true, bondId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send buddy invite' },
      { status: 500 },
    );
  }
}

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const now = new Date();
    const bonds = await TaskBondModel.find({
      status: 'pending',
      $or: [{ toUserId: userId }, { fromUserId: userId }],
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const otherIds = Array.from(
      new Set(
        bonds.map((b) => (b.fromUserId === userId ? b.toUserId : b.fromUserId)),
      ),
    );
    const users = await UserModel.find({ _id: { $in: otherIds } })
      .select('name frogName')
      .lean();
    const byId = new Map(users.map((u) => [u._id, u]));

    const map = (b: (typeof bonds)[number]) => {
      const otherId = b.fromUserId === userId ? b.toUserId : b.fromUserId;
      const other = byId.get(otherId);
      return {
        bondId: b.bondId,
        direction: b.fromUserId === userId ? 'outgoing' : 'incoming',
        withUserId: otherId,
        withName: other?.name || other?.frogName || 'Friend',
        text: b.initialText,
        repeatLabel: b.repeatLabel ?? '',
        scheduleLabel: b.createParams ? buddyScheduleSummary(b.createParams) : '',
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
      };
    };

    const incoming = bonds.filter((b) => b.toUserId === userId).map(map);
    const outgoing = bonds.filter((b) => b.fromUserId === userId).map(map);

    return NextResponse.json({ incoming, outgoing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load invites' },
      { status: 500 },
    );
  }
}
