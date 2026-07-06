export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskBondModel from '@/lib/models/TaskBond';
import { createTasksForUser } from '@/app/api/tasks/route';
import { buildAcceptBody } from '@/lib/buddy/bond';
import { getZonedToday } from '@/lib/utils';
import { sendBuddyPush, buddyDisplayName } from '@/lib/buddy/push';
import { notifyFriendUpdate } from '@/lib/taskSync';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bondId: string }> },
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bondId } = await params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const tz = body?.timezone || 'UTC';

  try {
    await connectMongo();
    const bond = await TaskBondModel.findOne({ bondId });
    if (!bond) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    if (bond.toUserId !== userId)
      return NextResponse.json({ error: 'Not your invite' }, { status: 403 });
    if (bond.status === 'active')
      return NextResponse.json({ ok: true, alreadyActive: true });
    if (bond.status !== 'pending')
      return NextResponse.json({ error: 'Invite is no longer valid' }, { status: 409 });
    if (bond.expiresAt && bond.expiresAt.getTime() < Date.now()) {
      bond.status = 'expired';
      await bond.save();
      return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
    }

    const acceptBody = buildAcceptBody(bond.createParams, tz);
    const result = await createTasksForUser(userId, acceptBody, tz, {
      bondId,
      buddyUserId: bond.fromUserId,
    });
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: result.status });

    bond.taskToId = result.repeatGroupId ?? result.ids[0];
    bond.status = 'active';
    bond.activeSince = getZonedToday(tz);
    await bond.save();

    void notifyFriendUpdate(bond.fromUserId);
    void buddyDisplayName(userId).then((name) =>
      sendBuddyPush(bond.fromUserId, {
        title: `${name} accepted your invite`,
        body: "You're goal buddies now. First one to finish today sets the pace.",
        path: '/planner',
        type: 'buddy_accepted',
      }),
    );

    return NextResponse.json({ ok: true, tasks: result.tasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to accept invite' },
      { status: 500 },
    );
  }
}
