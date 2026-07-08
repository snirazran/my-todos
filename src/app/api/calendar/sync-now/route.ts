export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import { runOutboundSweep } from '@/lib/calendar/engine';
import { getAdapters } from '@/lib/calendar/adapters';
import { notifyTaskChanged } from '@/lib/taskSync';

export async function POST() {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const conns = await CalendarConnectionModel.find({ userId: uid, status: 'active' });
  if (conns.length === 0) {
    return NextResponse.json({ error: 'no connections' }, { status: 404 });
  }

  let appChanged = false;
  const results: Record<string, string> = {};
  for (const conn of conns) {
    try {
      if (conn.provider === 'google') {
        const { googleInbound } = await import('@/lib/calendar/google/sync');
        appChanged = (await googleInbound(conn)) || appChanged;
      } else {
        const { appleInbound } = await import('@/lib/calendar/apple/sync');
        appChanged = (await appleInbound(conn, { force: true })) || appChanged;
      }
      results[conn.provider] = 'ok';
    } catch (err) {
      results[conn.provider] = (err as Error)?.message ?? 'error';
    }
  }

  await runOutboundSweep(uid, await getAdapters());
  if (appChanged) await notifyTaskChanged(uid);

  return NextResponse.json({ ok: true, results, appChanged });
}
