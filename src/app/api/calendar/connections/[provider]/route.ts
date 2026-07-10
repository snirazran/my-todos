export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import { deleteConnectionData } from '@/lib/calendar/engine';
import { invalidateConnectionCache } from '@/lib/calendar/connections';
import { notifyTaskChanged } from '@/lib/taskSync';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'apple') {
    return NextResponse.json({ error: 'invalid provider' }, { status: 400 });
  }

  await connectMongo();
  const conn = await CalendarConnectionModel.findOne({ userId: uid, provider });
  if (!conn) return NextResponse.json({ error: 'not connected' }, { status: 404 });

  if (provider === 'google') {
    if (conn.channelId && conn.resourceId) {
      const { stopChannel } = await import('@/lib/calendar/google/client');
      await stopChannel(conn, conn.channelId, conn.resourceId);
    }
    try {
      const { deleteAppCalendar } = await import('@/lib/calendar/google/client');
      await deleteAppCalendar(conn);
    } catch (err) {
      console.error('app calendar cleanup failed (continuing):', err);
    }
  }

  await deleteConnectionData(conn._id);
  invalidateConnectionCache(uid);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}
