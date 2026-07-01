export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskBondModel from '@/lib/models/TaskBond';
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
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body?.setRepeat === undefined)
    return NextResponse.json({ error: 'setRepeat is required' }, { status: 400 });

  try {
    await connectMongo();
    const bond = await TaskBondModel.findOne({ bondId });
    if (!bond) return NextResponse.json({ error: 'Bond not found' }, { status: 404 });
    if (bond.status !== 'active')
      return NextResponse.json({ error: 'Bond is not active' }, { status: 409 });
    if (bond.fromUserId !== userId && bond.toUserId !== userId)
      return NextResponse.json({ error: 'Not your bond' }, { status: 403 });

    bond.pendingRepeatChange = {
      requestedBy: userId,
      setRepeat: body.setRepeat,
      date: typeof body.date === 'string' ? body.date : undefined,
      requestedAt: new Date(),
    };
    await bond.save();

    const partnerId = bond.fromUserId === userId ? bond.toUserId : bond.fromUserId;
    void notifyFriendUpdate(partnerId);
    void buddyDisplayName(userId).then((name) =>
      sendBuddyPush(partnerId, {
        title: 'Goal Buddy 🐸',
        body: `${name} wants to change a shared task's schedule — approve?`,
        path: '/planner',
        type: 'buddy_repeat_request',
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to request change' },
      { status: 500 },
    );
  }
}
