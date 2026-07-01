export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskBondModel from '@/lib/models/TaskBond';
import TaskModel from '@/lib/models/Task';
import { notifyFriendUpdate } from '@/lib/taskSync';

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
    if (bond.toUserId !== userId)
      return NextResponse.json({ error: 'Not your invite' }, { status: 403 });
    if (bond.status !== 'pending')
      return NextResponse.json({ ok: true, alreadyResolved: true });

    bond.status = 'declined';
    await bond.save();

    // The inviter keeps their task as a normal solo task.
    await TaskModel.updateMany(
      { userId: bond.fromUserId, bondId },
      { $unset: { bondId: '', buddyUserId: '' } },
    );

    void notifyFriendUpdate(bond.fromUserId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to decline invite' },
      { status: 500 },
    );
  }
}
