export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import { invalidateConnectionCache } from '@/lib/calendar/connections';
import { resumeConnection } from '@/lib/calendar/health';

export async function GET() {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  const conns = await CalendarConnectionModel.find(
    { userId: uid },
    {
      provider: 1,
      status: 1,
      errorMessage: 1,
      lastErrorKind: 1,
      consecutiveFailures: 1,
      firstFailureAt: 1,
      pausedReason: 1,
      calendarDisplayName: 1,
      calendarId: 1,
      lastIncrementalSyncAt: 1,
      lastFullSyncAt: 1,
      settings: 1,
      appleId: 1,
    },
  ).lean();

  return NextResponse.json({
    connections: conns.map((c) => ({
      provider: c.provider,
      status: c.status,
      errorMessage: c.errorMessage,
      errorKind: c.lastErrorKind,
      failureCount: c.consecutiveFailures ?? 0,
      failingSince: c.firstFailureAt ?? null,
      pausedReason: c.pausedReason,
      calendarDisplayName: c.calendarDisplayName,
      calendarId: c.calendarId,
      appleId: c.appleId,
      lastSyncedAt: c.lastIncrementalSyncAt ?? c.lastFullSyncAt ?? null,
      settings: c.settings,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const provider = body.provider;
  if (provider !== 'google' && provider !== 'apple') {
    return NextResponse.json({ error: 'invalid provider' }, { status: 400 });
  }

  if (body.resume === true) {
    await connectMongo();
    const conn = await resumeConnection(uid, provider);
    if (!conn) return NextResponse.json({ error: 'not connected' }, { status: 404 });
    if (conn.status === 'disconnected') {
      return NextResponse.json({ error: 'reconnect required' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: conn.status });
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};
  if (typeof body.exportEnabled === 'boolean')
    set['settings.exportEnabled'] = body.exportEnabled;
  if (typeof body.importEnabled === 'boolean')
    set['settings.importEnabled'] = body.importEnabled;
  if (body.importTagId === null) unset['settings.importTagId'] = 1;
  else if (typeof body.importTagId === 'string')
    set['settings.importTagId'] = body.importTagId;
  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await connectMongo();
  const res = await CalendarConnectionModel.updateOne(
    { userId: uid, provider },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  invalidateConnectionCache(uid);
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: 'not connected' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
