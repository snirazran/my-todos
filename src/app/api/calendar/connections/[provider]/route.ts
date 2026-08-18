export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import { disconnectCalendarConnection } from '@/lib/calendar/disconnect';

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

  await disconnectCalendarConnection(conn);
  return NextResponse.json({ ok: true });
}
