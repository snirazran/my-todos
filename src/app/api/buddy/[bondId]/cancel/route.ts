export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskBondModel from '@/lib/models/TaskBond';
import TaskModel from '@/lib/models/Task';
import { notifyFriendUpdate } from '@/lib/taskSync';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bondId: string }> },
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bondId } = await params;

  try {
    await connectMongo();
    const bond = await TaskBondModel.findOne({ bondId });
    if (!bond) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    if (bond.fromUserId !== userId)
      return NextResponse.json({ error: 'Not your invite' }, { status: 403 });
    if (bond.status !== 'pending')
      return NextResponse.json({ ok: true, alreadyResolved: true });

    bond.status = 'severed';
    await bond.save();

    // The sender keeps the task — it just goes back to being a solo task.
    await TaskModel.updateMany(
      { userId, bondId },
      { $unset: { bondId: '', buddyUserId: '' } },
    );

    void notifyFriendUpdate(bond.toUserId);
    await recordAnalyticsEvent({
      userId,
      name: 'buddy_invite_cancelled',
      properties: { repeat_mode: bond.repeatLabel ?? 'unknown' },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to cancel invite' },
      { status: 500 },
    );
  }
}
