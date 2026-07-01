export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskBondModel from '@/lib/models/TaskBond';
import TaskModel from '@/lib/models/Task';
import { applySetRepeat } from '@/app/api/tasks/route';
import {
  createParamsFromSetRepeat,
  repeatLabelFor,
} from '@/lib/buddy/bond';
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
    /* empty ok */
  }
  const tz = body?.timezone || 'UTC';

  try {
    await connectMongo();
    const bond = await TaskBondModel.findOne({ bondId });
    if (!bond) return NextResponse.json({ error: 'Bond not found' }, { status: 404 });
    if (bond.fromUserId !== userId && bond.toUserId !== userId)
      return NextResponse.json({ error: 'Not your bond' }, { status: 403 });
    const change = bond.pendingRepeatChange;
    if (!change)
      return NextResponse.json({ error: 'No pending change' }, { status: 409 });
    if (change.requestedBy === userId)
      return NextResponse.json(
        { error: 'The other person must approve' },
        { status: 403 },
      );

    // Apply the new schedule to BOTH copies (personal fields preserved).
    for (const memberId of [bond.fromUserId, bond.toUserId]) {
      const primary = await TaskModel.findOne({ userId: memberId, bondId })
        .select('id')
        .lean<{ id: string }>();
      if (primary) await applySetRepeat(memberId, primary.id, change.setRepeat, change.date, tz);
    }

    bond.createParams = createParamsFromSetRepeat(
      change.setRepeat,
      bond.initialText,
      change.date,
    );
    bond.repeatLabel = repeatLabelFor(bond.createParams);
    bond.activeSince = getZonedToday(tz); // schedule changed → restart streak window
    bond.streak = { count: 0, lastDate: null };
    bond.pendingRepeatChange = null;
    await bond.save();

    void notifyFriendUpdate(change.requestedBy);
    void buddyDisplayName(userId).then((name) =>
      sendBuddyPush(change.requestedBy, {
        title: 'Goal Buddy 🐸',
        body: `${name} approved your schedule change`,
        path: '/planner',
        type: 'buddy_repeat_approved',
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to approve change' },
      { status: 500 },
    );
  }
}
