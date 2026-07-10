export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskBondModel from '@/lib/models/TaskBond';
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
    if (!bond) return NextResponse.json({ error: 'Bond not found' }, { status: 404 });
    if (bond.fromUserId !== userId && bond.toUserId !== userId)
      return NextResponse.json({ error: 'Not your bond' }, { status: 403 });
    const change = bond.pendingRepeatChange;
    if (!change) return NextResponse.json({ ok: true, alreadyResolved: true });

    const requestedBy = change.requestedBy;
    bond.pendingRepeatChange = null;
    await bond.save();
    await recordAnalyticsEvent({
      userId,
      name: 'buddy_repeat_change_declined',
      properties: { repeat_mode: bond.repeatLabel ?? 'unknown' },
    });

    void notifyFriendUpdate(requestedBy);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to decline change' },
      { status: 500 },
    );
  }
}
