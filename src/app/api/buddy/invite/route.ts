export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskBondModel, { type BuddyCreateParams } from '@/lib/models/TaskBond';
import { areFriends } from '@/lib/friends/code';
import { createTasksForUser } from '@/app/api/tasks/route';
import { repeatLabelFor } from '@/lib/buddy/bond';
import { sendBuddyPush, buddyDisplayName } from '@/lib/buddy/push';
import { notifyFriendUpdate } from '@/lib/taskSync';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function isRepeating(params: BuddyCreateParams): boolean {
  if (params.repeatRule) return true;
  if (params.repeat === 'monthly') return true;
  if (params.repeat === 'weekly' && (params.days?.length ?? 0) > 0) return true;
  return false;
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
  const params: BuddyCreateParams = {
    text: String(body?.text ?? '').trim(),
    repeat: body?.repeat,
    days: Array.isArray(body?.days) ? body.days.map(Number) : undefined,
    dates: Array.isArray(body?.dates) ? body.dates.map(String) : undefined,
    repeatRule: body?.repeatRule,
    repeatEndDate: body?.repeatEndDate,
  };

  if (!friendId) return NextResponse.json({ error: 'Missing friendId' }, { status: 400 });
  if (!params.text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (friendId === userId)
    return NextResponse.json({ error: "You can't buddy with yourself" }, { status: 400 });
  if (!isRepeating(params))
    return NextResponse.json(
      { error: 'Buddy tasks must repeat — pick a repeat option' },
      { status: 400 },
    );

  try {
    await connectMongo();
    if (!(await areFriends(userId, friendId)))
      return NextResponse.json({ error: 'Not friends' }, { status: 403 });

    const bondId = uuid();

    // Create the inviter's own copy now, stamped with the bond.
    const result = await createTasksForUser(userId, body, tz, {
      bondId,
      buddyUserId: friendId,
    });
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: result.status });

    const taskFromId = result.repeatGroupId ?? result.ids[0];

    await TaskBondModel.create({
      bondId,
      invitedBy: userId,
      fromUserId: userId,
      toUserId: friendId,
      status: 'pending',
      initialText: params.text,
      createParams: params,
      repeatLabel: repeatLabelFor(params),
      taskFromId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    void notifyFriendUpdate(friendId);
    void buddyDisplayName(userId).then((name) =>
      sendBuddyPush(friendId, {
        title: `${name} wants to be your goal buddy`,
        body: `Team up on "${params.text}" — you'll see each other's progress every day.`,
        path: '/friends',
        type: 'buddy_invite',
      }),
    );

    return NextResponse.json({ ok: true, bondId, tasks: result.tasks });
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
        withName: other?.frogName || other?.name || 'Friend',
        text: b.initialText,
        repeatLabel: b.repeatLabel ?? '',
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
