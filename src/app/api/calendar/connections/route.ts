export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import { invalidateConnectionCache } from '@/lib/calendar/connections';
import {
  isSyncDirection,
  needsReconsent,
  settingsToDirection,
  type SyncDirection,
} from '@/lib/calendar/direction';
import { resumeConnection } from '@/lib/calendar/health';

function credKeyReady() {
  const raw = process.env.CALENDAR_CRED_KEY;
  if (!raw) return false;
  try {
    return Buffer.from(raw, 'base64').length === 32;
  } catch {
    return false;
  }
}

function providerAvailability() {
  const creds = credKeyReady();
  return {
    google:
      creds &&
      !!process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    apple: creds,
  };
}

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
      grantedScopes: 1,
    },
  ).lean();

  return NextResponse.json({
    available: providerAvailability(),
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
      direction: settingsToDirection(c.settings),
      grantedScopes: c.grantedScopes,
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

  if (body.direction !== undefined) {
    if (!isSyncDirection(body.direction)) {
      return NextResponse.json({ error: 'invalid direction' }, { status: 400 });
    }
  } else if (
    typeof body.exportEnabled === 'boolean' ||
    typeof body.importEnabled === 'boolean'
  ) {
    // Legacy per-flag callers: fold them into a direction so the pair can
    // never land on "neither", which reads as connected but syncs nothing.
    if (typeof body.exportEnabled === 'boolean')
      set['settings.exportEnabled'] = body.exportEnabled;
    if (typeof body.importEnabled === 'boolean')
      set['settings.importEnabled'] = body.importEnabled;
  }

  if (body.importTagId === null) unset['settings.importTagId'] = 1;
  else if (typeof body.importTagId === 'string')
    set['settings.importTagId'] = body.importTagId;

  const direction: SyncDirection | null = isSyncDirection(body.direction)
    ? body.direction
    : null;

  if (!direction && Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await connectMongo();
  const conn = await CalendarConnectionModel.findOne({ userId: uid, provider });
  if (!conn) {
    return NextResponse.json({ error: 'not connected' }, { status: 404 });
  }

  if (direction) {
    // Google consent is scoped to the direction it was granted for, so
    // widening one needs a fresh trip through the consent screen rather than
    // a silently broken connection.
    if (needsReconsent(provider, conn.grantedScopes, direction)) {
      return NextResponse.json(
        { error: 'reconsent required', reconsent: true, direction },
        { status: 409 },
      );
    }
    Object.assign(set, {
      'settings.importEnabled': direction !== 'export_only',
      'settings.exportEnabled': direction !== 'import_only',
    });
  } else if (
    typeof set['settings.exportEnabled'] === 'boolean' ||
    typeof set['settings.importEnabled'] === 'boolean'
  ) {
    const nextImport =
      (set['settings.importEnabled'] as boolean | undefined) ??
      conn.settings.importEnabled !== false;
    const nextExport =
      (set['settings.exportEnabled'] as boolean | undefined) ??
      conn.settings.exportEnabled !== false;
    if (!nextImport && !nextExport) {
      return NextResponse.json(
        { error: 'sync needs at least one direction' },
        { status: 400 },
      );
    }
  }

  await CalendarConnectionModel.updateOne(
    { userId: uid, provider },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  invalidateConnectionCache(uid);
  return NextResponse.json({ ok: true, direction: direction ?? undefined });
}
